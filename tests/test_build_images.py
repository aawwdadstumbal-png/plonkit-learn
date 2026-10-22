"""Tests for the image pipeline: matching the local archive to the live guides."""

import base64
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))

import build_images  # noqa: E402

PROJECT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ARCHIVE_DIR = os.path.join(PROJECT, "Country")
GUIDES_DIR = os.path.join(PROJECT, "app", "data", "guides")


def load_guide(slug):
    with open(os.path.join(GUIDES_DIR, slug + ".json"), encoding="utf-8") as fh:
        return json.load(fh)


class NormaliseTests(unittest.TestCase):
    def test_normalise_drops_markup_and_short_words(self):
        # Words shorter than 3 characters are dropped, so "a" goes and "the" stays.
        self.assertEqual(
            build_images.normalise("The **maximum** 'a' sign"), {"the", "maximum", "sign"}
        )

    def test_normalise_lowercases(self):
        self.assertEqual(build_images.normalise("LICENCE Plate"), {"licence", "plate"})

    def test_normalise_drops_marks_and_underscores(self):
        self.assertEqual(build_images.normalise("_italic_ text"), {"italic", "text"})


class SimilarityTests(unittest.TestCase):
    def test_similarity_is_one_for_identical_text(self):
        self.assertEqual(
            build_images.similarity(
                "Albanian licence plates have blue strips",
                "albanian licence plates have blue strips",
            ),
            1.0,
        )

    def test_similarity_is_zero_for_unrelated_text(self):
        self.assertEqual(build_images.similarity("aaa bbb ccc", "xxx yyy zzz"), 0.0)

    def test_similarity_is_zero_when_a_side_has_no_words(self):
        self.assertEqual(build_images.similarity("!!!", "licence plate"), 0.0)

    def test_similarity_counts_shared_words(self):
        score = build_images.similarity(
            "speed signs use maximum word", "the maximum word appears on signs"
        )
        self.assertGreater(score, 0.4)
        self.assertLess(score, 0.95)


class AlignTests(unittest.TestCase):
    def test_align_rejects_a_meta_whose_text_changed(self):
        blocks = [build_images.LocalBlock(b"", "Albanian licence plates have blue strips", "tip")]
        metas = [{"id": "X", "text": "The road markings here are painted in bright yellow"}]
        self.assertEqual(build_images.align(blocks, metas), {})

    def test_align_matches_a_meta_whose_text_is_the_same(self):
        blocks = [build_images.LocalBlock(b"", "Albanian licence plates have blue strips", "tip")]
        metas = [{"id": "X", "text": "Albanian licence plates have blue strips"}]
        self.assertEqual(build_images.align(blocks, metas), {"X": 0})

    def test_align_rejects_a_below_threshold_match(self):
        blocks = [build_images.LocalBlock(b"", "licence plates blue strips", "tip")]
        metas = [
            {
                "id": "X",
                "text": "licence plates blue strips and a very different additional "
                "clause about something else entirely",
            }
        ]
        self.assertEqual(build_images.align(blocks, metas), {})

    def test_align_never_reuses_a_block(self):
        blocks = [build_images.LocalBlock(b"", "Albanian licence plates have blue strips", "tip")]
        metas = [
            {"id": "A", "text": "Albanian licence plates have blue strips"},
            {"id": "B", "text": "Albanian licence plates have blue strips"},
        ]
        matched = build_images.align(blocks, metas)
        self.assertEqual(len(matched), 1)

    def test_align_ignores_blocks_with_no_text(self):
        blocks = [build_images.LocalBlock(b"", "", "summary")]
        metas = [{"id": "X", "text": "anything at all here"}]
        self.assertEqual(build_images.align(blocks, metas), {})

    def test_align_prefers_the_closer_block(self):
        blocks = [
            build_images.LocalBlock(b"", "alpha beta gamma delta", "tip"),
            build_images.LocalBlock(b"", "alpha beta gamma delta epsilon", "tip"),
        ]
        metas = [{"id": "X", "text": "alpha beta gamma delta epsilon"}]
        self.assertEqual(build_images.align(blocks, metas), {"X": 1})


class ParseBlocksTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = os.path.join(ARCHIVE_DIR, "albania.html")
        with open(path, encoding="utf-8", errors="replace") as fh:
            cls.html = fh.read()

    def test_parse_blocks_finds_the_images_and_text(self):
        blocks = build_images.parse_blocks(self.html)
        self.assertGreater(len(blocks), 20)
        self.assertGreater(sum(1 for b in blocks if b.image_bytes), 20)
        self.assertGreater(sum(1 for b in blocks if b.text), 20)

    def test_the_first_block_is_the_summary_and_has_no_text(self):
        blocks = build_images.parse_blocks(self.html)
        self.assertEqual(blocks[0].text, "")

    def test_decoded_images_are_real_bytes(self):
        blocks = build_images.parse_blocks(self.html)
        with_image = next(b for b in blocks if b.image_bytes)
        self.assertTrue(with_image.image_bytes.startswith(b"RIFF"))
        self.assertEqual(with_image.image_bytes[8:12], b"WEBP")


class Tier1Tests(unittest.TestCase):
    def test_tier1_writes_a_webp_for_a_known_meta(self):
        guide = load_guide("albania")
        with open(os.path.join(ARCHIVE_DIR, "albania.html"), encoding="utf-8", errors="replace") as fh:
            html = fh.read()

        with tempfile.TemporaryDirectory() as tmp:
            written, unmatched = build_images.tier1(guide, html, tmp)
            self.assertGreater(written, 0)
            files = os.listdir(tmp)
            self.assertEqual(len(files), written)
            for name in files:
                with open(os.path.join(tmp, name), "rb") as fh:
                    data = fh.read()
                self.assertEqual(data[:4], b"RIFF")
                self.assertEqual(data[8:12], b"WEBP")

    def test_tier1_is_idempotent(self):
        guide = load_guide("albania")
        with open(os.path.join(ARCHIVE_DIR, "albania.html"), encoding="utf-8", errors="replace") as fh:
            html = fh.read()

        with tempfile.TemporaryDirectory() as tmp:
            first, _ = build_images.tier1(guide, html, tmp)
            count = len(os.listdir(tmp))
            second, _ = build_images.tier1(guide, html, tmp)
            self.assertEqual(len(os.listdir(tmp)), count)
            self.assertEqual(second, 0)
            self.assertGreater(first, 0)

    def test_tier1_skips_a_png_block(self):
        # The 246 PNGs in the archive are the site logo, not a meta image.
        guide = load_guide("albania")
        png = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 40)
        blocks = [build_images.LocalBlock(png, "Albanian licence plates have blue strips", "tip")]
        with tempfile.TemporaryDirectory() as tmp:
            written, _ = build_images.tier1(guide, blocks, tmp)
            self.assertEqual(written, 0)
            self.assertEqual(os.listdir(tmp), [])


class Tier2Tests(unittest.TestCase):
    def test_downscale_shrinks_a_large_image(self):
        from PIL import Image

        buffer = io.BytesIO()
        Image.new("RGB", (2400, 1200), (90, 190, 130)).save(buffer, "PNG")
        result = build_images.downscale(buffer.getvalue(), max_dim=1000)
        self.assertEqual(result[:4], b"RIFF")
        self.assertEqual(result[8:12], b"WEBP")
        with Image.open(io.BytesIO(result)) as img:
            self.assertLessEqual(max(img.size), 1000)

    def test_downscale_leaves_a_small_image_small(self):
        from PIL import Image

        buffer = io.BytesIO()
        Image.new("RGB", (200, 100), (10, 20, 30)).save(buffer, "PNG")
        result = build_images.downscale(buffer.getvalue(), max_dim=1000)
        with Image.open(io.BytesIO(result)) as img:
            self.assertLessEqual(max(img.size), 200)

    def test_downscale_rejects_non_image_data(self):
        with self.assertRaises(ValueError):
            build_images.downscale(b"<html>not an image</html>")

    def test_tier2_skips_existing_files(self):
        guide = load_guide("albania")
        with tempfile.TemporaryDirectory() as tmp:
            for meta in build_images.guide_metas(guide):
                if meta.get("image"):
                    with open(os.path.join(tmp, meta["id"] + ".webp"), "wb") as fh:
                        fh.write(b"RIFF0000WEBPnot-really")
            # The hero exists too, so this run must not touch the network.
            with open(os.path.join(tmp, "hero.webp"), "wb") as fh:
                fh.write(b"RIFF0000WEBPnot-really")
            written, failed = build_images.tier2(guide, tmp, sleep=0)
            self.assertEqual(written, 0)
            self.assertEqual(failed, 0)

    def test_tier2_reports_a_missing_upstream_url(self):
        guide = {"slug": "nowhere", "sections": [{"metas": [{"id": "A", "image": "img/nowhere/A.webp", "text": ["x"]}]}]}
        with tempfile.TemporaryDirectory() as tmp:
            written, failed = build_images.tier2(guide, tmp, sleep=0)
            self.assertEqual(written, 0)
            self.assertEqual(failed, 1)


if __name__ == "__main__":
    unittest.main()
