"""Fill app/data/img with the images for every meta.

Tier 1 uses the local SingleFile archive in Country/. SingleFile downscaled
those images to roughly a twelfth of the upstream size, and they are already
WebP, so they are copied out as they are. The archive is a month older than
the live guide text and the saved DOM dropped the original image URLs, so an
archive image is only used for a meta whose text still matches it.

Tier 2 fetches whatever tier 1 could not match from plonkit.net, downscaled.
The image host rate-limits hard, so tier 2 is slow and resumable.

Usage:
    python tools/build_images.py --tier 1
    python tools/build_images.py --tier 2
    python tools/build_images.py --tier all
"""

import argparse
import base64
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

PROJECT = Path(__file__).resolve().parent.parent
GUIDES_DIR = PROJECT / "app" / "data" / "guides"
IMG_DIR = PROJECT / "app" / "data" / "img"
ARCHIVE_DIR = PROJECT / "Country"
SOURCE_DIR = PROJECT / "data-source"
BASE_URL = "https://www.plonkit.net"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)

BLOCK_MARKER = 'class="relative group/bk"'
IMAGE_RE = re.compile(r"data:image/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)")
TEXT_RE = re.compile(r"<p style=white-space:pre-wrap>(.*?)</p>", re.S)
TAG_RE = re.compile(r"<[^>]+>")

DEFAULT_THRESHOLD = 0.75

# Guides the site has renamed since the archive was captured. The archive file
# is still the right source for the same guide under its old name.
ARCHIVE_ALIASES = {
    "czechia": "czech-republic",
}


class LocalBlock:
    """One block of a saved SingleFile page."""

    __slots__ = ("image_bytes", "text", "kind")

    def __init__(self, image_bytes, text, kind="tip"):
        self.image_bytes = image_bytes
        self.text = text
        self.kind = kind

    def __repr__(self):
        preview = (self.text or "")[:40]
        return f"LocalBlock({len(self.image_bytes or b'')} bytes, {preview!r})"


# --------------------------------------------------------------------------
# parsing the archive
# --------------------------------------------------------------------------


def _decode(payload):
    payload += "=" * (-len(payload) % 4)
    return base64.b64decode(payload)


def _strip_tags(fragment):
    import html as html_module

    return html_module.unescape(TAG_RE.sub("", fragment)).strip()


def parse_blocks(html):
    """Split a saved page into its tip blocks, in document order."""
    if not isinstance(html, str):
        return list(html)

    blocks = []
    for chunk in html.split(BLOCK_MARKER)[1:]:
        image_match = IMAGE_RE.search(chunk)
        text_match = TEXT_RE.search(chunk)
        image_bytes = _decode(image_match.group(2)) if image_match else None
        text = _strip_tags(text_match.group(1)) if text_match else ""
        blocks.append(LocalBlock(image_bytes, text))
    return blocks


def is_webp(data):
    return bool(data) and data[:4] == b"RIFF" and data[8:12] == b"WEBP"


# --------------------------------------------------------------------------
# matching archive blocks to live metas
# --------------------------------------------------------------------------


def normalise(text):
    """Lowercased word set with the markdown punctuation removed."""
    if not text:
        return set()
    cleaned = text.replace("**", " ").replace("__", " ").replace("`", " ")
    cleaned = cleaned.replace("*", " ").replace("_", " ")
    words = re.split(r"[^0-9A-Za-z]+", cleaned.lower())
    return {w for w in words if len(w) >= 3}


def similarity(a, b):
    """How much of the longer text also appears in the shorter one.

    The denominator is the longer word set, not the shorter. A short block
    whose words all happen to appear in a long meta that has since been
    rewritten would score 1.0 against a min() denominator and pair a stale
    image with changed text. Dividing by the longer set penalises exactly
    that length mismatch.
    """
    left, right = normalise(a), normalise(b)
    if not left or not right:
        return 0.0
    return len(left & right) / max(len(left), len(right))


def align(blocks, metas, threshold=DEFAULT_THRESHOLD):
    """Map meta id to the index of the archive block that illustrates it.

    The archive is older than the live guide, so a block is only used when the
    text still matches. The closest pair wins, and neither a block nor a meta
    is ever used twice.
    """
    candidates = []
    for meta_index, meta in enumerate(metas):
        meta_text = meta.get("text") or ""
        for block_index, block in enumerate(blocks):
            if not block.text:
                continue
            score = similarity(block.text, meta_text)
            if score >= threshold:
                candidates.append((score, block_index, meta_index))

    candidates.sort(key=lambda item: (-item[0], item[1], item[2]))

    used_blocks = set()
    used_metas = set()
    matched = {}
    for _score, block_index, meta_index in candidates:
        if block_index in used_blocks or meta_index in used_metas:
            continue
        used_blocks.add(block_index)
        used_metas.add(meta_index)
        matched[metas[meta_index]["id"]] = block_index
    return matched


# --------------------------------------------------------------------------
# tier 1 - the local archive
# --------------------------------------------------------------------------


def guide_metas(guide):
    """Every meta of a guide, flattened, with its text joined."""
    flat = []
    for section in guide.get("sections") or []:
        for meta in section.get("metas") or []:
            flat.append(
                {
                    "id": meta["id"],
                    "text": " ".join(meta.get("text") or []),
                    "image": meta.get("image"),
                }
            )
    return flat


def tier1(guide, html_or_blocks, out_dir):
    """Copy the archive's images onto the metas they still match.

    Returns (written, unmatched).
    """
    blocks = parse_blocks(html_or_blocks)
    metas = guide_metas(guide)
    matches = align(blocks, metas)

    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    written = 0
    for meta in metas:
        if not meta.get("image"):
            continue
        target = out / f"{meta['id']}.webp"
        if target.exists():
            continue
        block_index = matches.get(meta["id"])
        if block_index is None:
            continue
        data = blocks[block_index].image_bytes
        if not is_webp(data):
            continue
        target.write_bytes(data)
        written += 1

    return written, len([m for m in metas if m.get("image")]) - len(matches)


def run_tier1(only=None):
    total_written = 0
    total_metas = 0
    unmatched_guides = []

    for path in sorted(GUIDES_DIR.glob("*.json")):
        guide = json.loads(path.read_text(encoding="utf-8"))
        slug = guide["slug"]
        if only and slug != only:
            continue

        archive = ARCHIVE_DIR / f"{slug}.html"
        if not archive.exists() and slug in ARCHIVE_ALIASES:
            archive = ARCHIVE_DIR / f"{ARCHIVE_ALIASES[slug]}.html"
        if not archive.exists():
            unmatched_guides.append(slug)
            continue

        html = archive.read_text(encoding="utf-8", errors="replace")
        out = IMG_DIR / slug
        written, unmatched = tier1(guide, html, out)
        total_written += written
        total_metas += guide["metaCount"]
        if written or unmatched:
            print(f"  {slug}: {written} matched, {unmatched} unmatched", flush=True)

    print(
        f"\ntier 1: {total_written} images written of {total_metas} metas; "
        f"{len(unmatched_guides)} guides have no archive copy"
    )
    if unmatched_guides:
        print("  (these need tier 2: " + ", ".join(unmatched_guides) + ")")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tier", choices=["1", "2", "all"], default="all")
    parser.add_argument("--only", help="restrict to one slug")
    args = parser.parse_args()

    if args.tier in ("1", "all"):
        run_tier1(args.only)
    if args.tier in ("2", "all"):
        from build_images_net import run_tier2  # noqa: F401  (added in task 3)

        run_tier2(args.only)
    return 0


if __name__ == "__main__":
    sys.exit(main())
