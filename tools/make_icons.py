"""
Draw the app icons.

A dark green panel with a lighter green map pin and a white letter, so the
icon reads at 192 pixels and again as a maskable icon at 512.

Usage:
    python tools/make_icons.py
"""

import os
from pathlib import Path

from PIL import Image, ImageDraw

APP_DIR = Path(__file__).resolve().parent.parent / "app"
ICON_DIR = APP_DIR / "icons"

BG = (15, 18, 20, 255)
ACCENT = (94, 191, 130, 255)
LIGHT = (232, 236, 239, 255)


def draw_icon(size, maskable=False):
    image = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(image)

    # A maskable icon has to keep its content inside the middle 80%, so the
    # safe zone is the circle in the middle of the image.
    if maskable:
        pad = size * 0.1
        plate = Image.new("RGBA", (size, size), BG)
        plate_draw = ImageDraw.Draw(plate)
        plate_draw.ellipse((pad, pad, size - pad, size - pad), fill=ACCENT)
        image = Image.alpha_composite(image, plate)
        draw = ImageDraw.Draw(image)
        glyph = size * 0.5
    else:
        radius = size * 0.22
        draw.rounded_rectangle(
            (size * 0.08, size * 0.08, size * 0.92, size * 0.92),
            radius=radius,
            fill=ACCENT,
        )
        glyph = size * 0.6

    # A map pin.
    cx = size / 2
    top = size / 2 - glyph * 0.42
    head = glyph * 0.32
    draw.ellipse((cx - head, top, cx + head, top + head * 2), fill=BG)
    draw.polygon(
        [
            (cx - head * 0.55, top + head * 1.5),
            (cx + head * 0.55, top + head * 1.5),
            (cx, top + head * 2.75),
        ],
        fill=BG,
    )
    draw.ellipse(
        (cx - head * 0.42, top + head * 0.58, cx + head * 0.42, top + head * 1.42),
        fill=ACCENT,
    )
    return image


def main():
    os.makedirs(ICON_DIR, exist_ok=True)
    draw_icon(192).save(ICON_DIR / "icon-192.png")
    draw_icon(512).save(ICON_DIR / "icon-512.png")
    draw_icon(512, maskable=True).save(ICON_DIR / "icon-maskable-512.png")
    print(f"wrote three icons to {ICON_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
