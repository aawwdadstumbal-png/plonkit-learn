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
import io
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
# The image host refuses a Referer without a trailing slash.
REFERER = BASE_URL + "/"

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


# --------------------------------------------------------------------------
# tier 2 - the network
# --------------------------------------------------------------------------

MAX_DIM = 1000
QUALITY = 78
BACKOFF = (30, 60, 120, 240)


def downscale(raw, max_dim=MAX_DIM, quality=QUALITY):
    """Re-encode an image as WebP, no larger than max_dim on its long side."""
    from PIL import Image

    try:
        with Image.open(io.BytesIO(raw)) as image:
            image.load()
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGB")
            if max(image.size) > max_dim:
                image.thumbnail((max_dim, max_dim * 4), Image.LANCZOS)
            buffer = io.BytesIO()
            image.convert("RGB").save(buffer, "WEBP", quality=quality, method=4)
            return buffer.getvalue()
    except ValueError:
        raise
    except Exception as error:
        raise ValueError(f"not a usable image: {error}") from error


def fetch_image(url, referer=REFERER, timeout=45, attempts=4):
    """GET an image. Returns the bytes, or None if the host never gave them up.

    The host answers 403 unless the Referer is the site root **with a
    trailing slash**. "https://www.plonkit.net" is refused; "https://www.
    plonkit.net/" and any page path are accepted. A 429 is backed off rather
    than abandoned, because the host rate-limits hard.
    """
    for attempt in range(attempts):
        request = urllib.request.Request(
            url,
            headers={"User-Agent": USER_AGENT, "Referer": referer, "Accept": "image/*,*/*"},
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt < attempts - 1:
                time.sleep(BACKOFF[min(attempt, len(BACKOFF) - 1)])
                continue
            return None
        except Exception:
            time.sleep(5)
    return None


def upstream_image_urls(slug):
    """The upstream image URL for every meta of a guide, keyed by meta id.

    The app guide JSON only stores the local path, so the upstream URL has to
    come from the raw payload kept in data-source.
    """
    path = SOURCE_DIR / f"{slug}.json"
    if not path.exists():
        return {}, None
    payload = json.loads(path.read_text(encoding="utf-8"))
    public = (payload.get("data") or {}).get("public") or {}
    if not public:
        return {}, None

    urls = {}
    for step in public.get("steps") or []:
        for item in step.get("items") or []:
            if item.get("kind") != "tip":
                continue
            image = (item.get("data") or {}).get("image") or {}
            if image.get("imageUrl"):
                urls[item.get("id")] = image["imageUrl"]
    return urls, public.get("heroImage")


def tier2(guide, out_dir, sleep=2.5, referer=REFERER):
    """Fetch every image the guide needs that is not on disk yet.

    Returns (written, failed).
    """
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    urls, hero = upstream_image_urls(guide["slug"])
    metas = guide_metas(guide)

    written = 0
    failed = 0

    for meta in metas:
        if not meta.get("image"):
            continue
        target = out / f"{meta['id']}.webp"
        if target.exists():
            continue
        url = urls.get(meta["id"])
        if not url:
            failed += 1
            continue
        raw = fetch_image(f"{BASE_URL}{url}", referer=referer)
        if raw is None:
            failed += 1
            continue
        try:
            data = downscale(raw)
        except ValueError:
            failed += 1
            continue
        target.write_bytes(data)
        written += 1
        if sleep:
            time.sleep(sleep)

    if hero:
        hero_target = out / "hero.webp"
        if not hero_target.exists():
            raw = fetch_image(f"{BASE_URL}{hero}", referer=referer)
            if raw is not None:
                try:
                    hero_target.write_bytes(downscale(raw, max_dim=1400))
                    written += 1
                except ValueError:
                    failed += 1
            else:
                failed += 1
            if sleep:
                time.sleep(sleep)

    return written, failed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tier", choices=["1", "2", "all"], default="all")
    parser.add_argument("--only", help="restrict to one slug")
    args = parser.parse_args()

    if args.tier in ("1", "all"):
        run_tier1(args.only)
    if args.tier in ("2", "all"):
        from build_images_net import run_tier2

        run_tier2(args.only)
    return 0


if __name__ == "__main__":
    sys.exit(main())
