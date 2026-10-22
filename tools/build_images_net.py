"""The command line driver for tier 2 of the image pipeline.

The reusable pieces live in build_images.py; this file only walks the guides
and reports what happened, so the network code stays in one place and the
archive code in another.
"""

import json

from build_images import GUIDES_DIR, IMG_DIR, guide_metas


def run_tier2(only=None):
    from build_images import tier2

    total_written = 0
    total_failed = 0
    total_missing = 0

    for path in sorted(GUIDES_DIR.glob("*.json")):
        guide = json.loads(path.read_text(encoding="utf-8"))
        slug = guide["slug"]
        if only and slug != only:
            continue

        out = IMG_DIR / slug
        missing = sum(
            1
            for meta in guide_metas(guide)
            if meta.get("image") and not (out / f"{meta['id']}.webp").exists()
        )
        if not missing:
            continue

        total_missing += missing
        print(f"  {slug}: {missing} to fetch ...", flush=True)
        written, failed = tier2(guide, out)
        total_written += written
        total_failed += failed
        print(f"  {slug}: {written} written, {failed} failed", flush=True)

    print(
        f"\ntier 2: {total_written} images written, {total_failed} failed, "
        f"{total_missing} were missing"
    )
    return 0
