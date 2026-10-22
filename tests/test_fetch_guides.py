"""Tests for the guide pipeline: fetching and reshaping the upstream guide JSON."""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))

import fetch_guides  # noqa: E402

SOURCE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data-source")


def load_source(slug):
    with open(os.path.join(SOURCE_DIR, slug + ".json"), encoding="utf-8") as fh:
        return json.load(fh)["data"]["public"]


def all_slugs():
    return sorted(
        f[:-5] for f in os.listdir(SOURCE_DIR) if f.endswith(".json") and not f.startswith("_")
    )


class ParsePreloadedTests(unittest.TestCase):
    def test_parse_preloaded_returns_the_payload(self):
        html = (
            '<html><head><script id="__PRELOADED_DATA__" type="application/json">'
            '{"success":true,"data":{"public":{"slug":"x"}}}'
            "</script></head></html>"
        )
        self.assertEqual(fetch_guides.parse_preloaded(html)["data"]["public"]["slug"], "x")

    def test_parse_preloaded_raises_when_absent(self):
        with self.assertRaises(ValueError):
            fetch_guides.parse_preloaded("<html></html>")

    def test_parse_preloaded_raises_on_malformed_json(self):
        html = '<script id="__PRELOADED_DATA__" type="application/json">{oops</script>'
        with self.assertRaises(ValueError):
            fetch_guides.parse_preloaded(html)


class ReshapeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.japan = fetch_guides.reshape(load_source("japan"))

    def test_reshape_produces_the_contract_shape(self):
        g = self.japan
        self.assertEqual(g["slug"], "japan")
        self.assertEqual(g["title"], "Japan")
        self.assertEqual(g["code"], "JP")
        self.assertEqual(g["continent"], "Asia")
        self.assertEqual(g["metaCount"], 82)
        self.assertEqual(len(g["sections"]), 4)
        self.assertEqual(g["sections"][-1]["kind"], "map")

    def test_every_meta_has_the_contract_fields(self):
        for section in self.japan["sections"]:
            for meta in section["metas"]:
                self.assertIsInstance(meta["id"], str)
                self.assertTrue(meta["id"])
                self.assertIn("image", meta)
                self.assertIn("mapsUrl", meta)
                self.assertIn("width", meta)
                self.assertIsInstance(meta["text"], list)
                for paragraph in meta["text"]:
                    self.assertIsInstance(paragraph, str)

    def test_a_meta_with_an_image_gets_a_local_path(self):
        with_image = [m for s in self.japan["sections"] for m in s["metas"] if m["image"]]
        self.assertTrue(with_image)
        for meta in with_image:
            self.assertTrue(meta["image"].startswith("img/japan/"))
            self.assertTrue(meta["image"].endswith(".webp"))

    def test_a_meta_without_an_image_is_null(self):
        # Every upstream tip currently carries an image, so the null case is
        # exercised on a synthetic guide rather than on the real data.
        public = load_source("japan")
        items = public["steps"][0]["items"]
        tip = next(i for i in items if i.get("kind") == "tip")
        tip["data"].pop("image", None)
        shaped = fetch_guides.reshape(public)
        meta = shaped["sections"][0]["metas"][0]
        self.assertIsNone(meta["image"])
        self.assertIsNone(meta["mapsUrl"])
        self.assertIsNone(meta["width"])

    def test_a_meta_whose_link_equals_its_image_has_no_maps_url(self):
        public = load_source("japan")
        items = public["steps"][0]["items"]
        tip = next(i for i in items if i.get("kind") == "tip")
        tip["data"]["image"]["imageLink"] = tip["data"]["image"]["imageUrl"]
        shaped = fetch_guides.reshape(public)
        self.assertIsNone(shaped["sections"][0]["metas"][0]["mapsUrl"])

    def test_divider_titles_are_preserved(self):
        extras = [e for s in self.japan["sections"] for e in s["extras"]]
        dividers = [e for e in extras if e["kind"] == "divider"]
        self.assertTrue(dividers)
        for divider in dividers:
            self.assertTrue(divider.get("title"))

    def test_extras_keep_their_kind(self):
        extras = [e for s in self.japan["sections"] for e in s["extras"]]
        for extra in extras:
            self.assertIn("kind", extra)

    def test_map_sections_carry_text_and_no_metas(self):
        for section in self.japan["sections"]:
            if section["kind"] == "map":
                self.assertTrue(section["text"])
                self.assertEqual(section["metas"], [])
            else:
                self.assertEqual(section["text"], [])

    def test_sections_are_numbered_in_document_order(self):
        ids = [s["id"] for s in self.japan["sections"]]
        self.assertEqual(ids, ["s1", "s2", "s3", "s4"])

    def test_reshape_is_deterministic(self):
        again = fetch_guides.reshape(load_source("japan"))
        self.assertEqual(
            json.dumps(self.japan, sort_keys=True),
            json.dumps(again, sort_keys=True),
        )

    def test_a_missing_code_becomes_an_empty_string(self):
        public = load_source("japan")
        public.pop("code", None)
        self.assertEqual(fetch_guides.reshape(public)["code"], "")

    def test_an_unknown_continent_becomes_general(self):
        public = load_source("japan")
        public["cat"] = ["Middle Earth"]
        self.assertEqual(fetch_guides.reshape(public)["continent"], "General")

    def test_a_duplicate_meta_id_is_disambiguated(self):
        public = load_source("japan")
        items = public["steps"][0]["items"]
        first_tip = next(i for i in items if i.get("kind") == "tip")
        clone = json.loads(json.dumps(first_tip))
        items.insert(1, clone)
        shaped = fetch_guides.reshape(public)
        ids = [m["id"] for s in shaped["sections"] for m in s["metas"]]
        self.assertEqual(len(ids), len(set(ids)), "meta ids must be unique within a guide")


class TotalsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.guides = [fetch_guides.reshape(load_source(s)) for s in all_slugs()]

    def test_all_139_guides_reshape(self):
        self.assertEqual(len(self.guides), 139)

    def test_the_total_meta_count_is_5303(self):
        self.assertEqual(sum(g["metaCount"] for g in self.guides), 5303)


class IndexTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.guides = [fetch_guides.reshape(load_source(s)) for s in all_slugs()]
        cls.index = fetch_guides.build_index(cls.guides)

    def test_the_index_excludes_a_guide_with_no_metas(self):
        slugs = [e["slug"] for e in self.index]
        self.assertNotIn("beginners-guide", slugs)
        self.assertEqual(len(slugs), 138)

    def test_every_other_guide_is_present(self):
        slugs = {e["slug"] for e in self.index}
        for slug in all_slugs():
            if slug == "beginners-guide":
                continue
            self.assertIn(slug, slugs)

    def test_the_index_uses_the_current_upstream_slugs(self):
        slugs = {e["slug"] for e in self.index}
        for slug in (
            "svalbard",
            "cocos-islands",
            "south-georgia-sandwich-islands",
            "us-minor-outlying-islands",
            "us-virgin-islands",
            "china",
        ):
            self.assertIn(slug, slugs)
        for stale in (
            "svalbard-and-jan-mayen",
            "cocos-keeling-islands",
            "united-states-virgin-islands",
            "united-states-minor-outlying-islands",
            "south-georgia-and-south-sandwich-islands",
        ):
            self.assertNotIn(stale, slugs)

    def test_the_index_carries_the_counts(self):
        for entry in self.index:
            self.assertEqual(
                entry["metaCount"],
                sum(g["metaCount"] for g in self.guides if g["slug"] == entry["slug"]),
            )
            self.assertTrue(entry["title"])
            self.assertIn("continent", entry)
            self.assertIn("hero", entry)
            self.assertIn("code", entry)

    def test_the_index_total_is_5303(self):
        self.assertEqual(sum(e["metaCount"] for e in self.index), 5303)


if __name__ == "__main__":
    unittest.main()
