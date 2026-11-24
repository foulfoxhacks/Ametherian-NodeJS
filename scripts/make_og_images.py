#!/usr/bin/env python3
"""Generate unique 1200x630 Open Graph cards for every page.

The cards use the supplied Ametherian artwork, system fonts, and original line
motifs. They do not include third-party logos. Run from the repository root:

    python scripts/make_og_images.py
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "og"
MARK = ROOT / "assets" / "ametherian-mark-purple.png"
MANIFEST = ROOT / "scripts" / "og-manifest.json"

W, H = 1200, 630
S = 2
W2, H2 = W * S, H * S

FONT_BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
FONT_SEMI = r"C:\Windows\Fonts\seguisb.ttf"
FONT_REGULAR = r"C:\Windows\Fonts\segoeui.ttf"
FONT_MONO = r"C:\Windows\Fonts\consola.ttf"

PURPLE = (139, 83, 254)
PURPLE_LIGHT = (196, 181, 253)
WHITE = (247, 244, 252)
MUTED = (185, 176, 201)
MUTED_DIM = (124, 114, 143)
LINE = (58, 46, 80)
INK = (11, 8, 18)
PANEL = (22, 16, 34)


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size * S)


def scale(value: float) -> int:
    return round(value * S)


def tracked_text(
    draw: ImageDraw.ImageDraw,
    xy: tuple[float, float],
    text: str,
    a_font: ImageFont.FreeTypeFont,
    fill,
    tracking: float,
    anchor_right: float | None = None,
) -> float:
    x, y = xy
    widths = [draw.textlength(char, font=a_font) for char in text]
    total = sum(widths) + tracking * S * (len(text) - 1)
    if anchor_right is not None:
        x = anchor_right - total
    for char, width in zip(text, widths):
        draw.text((x, y), char, font=a_font, fill=fill)
        x += width + tracking * S
    return total


def wrap(draw: ImageDraw.ImageDraw, text: str, a_font, max_width: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=a_font) <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def fit_title(draw: ImageDraw.ImageDraw, title: str, max_width: float) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    for size in range(96, 63, -2):
        a_font = font(FONT_BOLD, size)
        lines = wrap(draw, title, a_font, max_width)
        if len(lines) <= 3 and all(draw.textlength(line, font=a_font) <= max_width for line in lines):
            return a_font, lines
    a_font = font(FONT_BOLD, 64)
    return a_font, wrap(draw, title, a_font, max_width)[:3]


def gradient_background() -> Image.Image:
    image = Image.new("RGB", (W2, H2), INK)
    draw = ImageDraw.Draw(image)
    top = (11, 8, 18)
    bottom = (20, 15, 32)
    for y in range(H2):
        t = y / max(1, H2 - 1)
        color = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        draw.line([(0, y), (W2, y)], fill=color)
    return image.convert("RGBA")


def add_glow(image: Image.Image) -> Image.Image:
    glow = Image.new("RGBA", (W2, H2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse((W2 - 700, -360, W2 + 320, 660), fill=(139, 83, 254, 120))
    draw.ellipse((W2 - 420, 420, W2 + 220, 1060), fill=(109, 59, 224, 58))
    draw.ellipse((-260, H2 - 360, 420, H2 + 260), fill=(95, 160, 78, 24))
    glow = glow.filter(ImageFilter.GaussianBlur(scale(120)))
    return Image.alpha_composite(image, glow)


def add_grid(image: Image.Image) -> Image.Image:
    grid = Image.new("RGBA", (W2, H2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(grid)
    step = scale(56)
    for x in range(0, W2, step):
        draw.line([(x, 0), (x, H2)], fill=(255, 255, 255, 7), width=1)
    for y in range(0, H2, step):
        draw.line([(0, y), (W2, y)], fill=(255, 255, 255, 7), width=1)
    return Image.alpha_composite(image, grid)


def point(box, x: float, y: float) -> tuple[float, float]:
    return (box[0] + x * box[2], box[1] + y * box[3])


def motif(draw: ImageDraw.ImageDraw, key: str, box) -> None:
    lw = scale(2.2)
    light = PURPLE_LIGHT + (235,)
    mid = PURPLE + (220,)
    dim = (139, 83, 254, 110)

    if key == "home":
        cx, cy = point(box, 0.5, 0.5)
        for factor, alpha in ((1.0, 70), (0.72, 110)):
            rx = box[2] * 0.46 * factor
            ry = box[3] * 0.38 * factor
            draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=(139, 83, 254, alpha), width=lw)
        draw.ellipse((cx - scale(6), cy - scale(6), cx + scale(6), cy + scale(6)), fill=light)
        draw.ellipse((cx + box[2] * 0.33, cy - box[3] * 0.3, cx + box[2] * 0.33 + scale(7), cy - box[3] * 0.3 + scale(7)), fill=mid)
        draw.ellipse((cx - box[2] * 0.42, cy + box[3] * 0.2, cx - box[2] * 0.42 + scale(5), cy + box[3] * 0.2 + scale(5)), fill=mid)

    elif key == "docs":
        for index, offset in enumerate((0.22, 0.14, 0.06)):
            x = box[0] + box[2] * (0.08 + offset)
            y = box[1] + box[3] * (0.1 + offset * 0.6)
            w = box[2] * 0.6
            h = box[3] * 0.74
            draw.rounded_rectangle((x, y, x + w, y + h), radius=scale(5), outline=(light if index == 2 else dim), width=lw)
            if index == 2:
                for line in range(3):
                    ly = y + h * (0.28 + line * 0.16)
                    draw.line((x + w * 0.14, ly, x + w * (0.86 - line * 0.16), ly), fill=mid, width=lw)

    elif key == "vision":
        cx, cy = point(box, 0.44, 0.5)
        for radius in (0.12, 0.26, 0.4):
            rx = box[2] * radius
            ry = box[3] * radius * 0.9
            draw.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=(139, 83, 254, 90), width=lw)
        draw.ellipse((cx - scale(7), cy - scale(7), cx + scale(7), cy + scale(7)), fill=light)
        draw.line((cx + scale(4), cy, box[0] + box[2] * 0.94, box[1] + box[3] * 0.28), fill=mid, width=lw)
        draw.ellipse((box[0] + box[2] * 0.9, box[1] + box[3] * 0.24, box[0] + box[2] * 0.9 + scale(8), box[1] + box[3] * 0.24 + scale(8)), fill=light)

    elif key == "packages":
        for row in range(2):
            for col in range(3):
                x = box[0] + box[2] * (0.04 + col * 0.32)
                y = box[1] + box[3] * (0.08 + row * 0.46)
                w = box[2] * 0.24
                h = box[3] * 0.36
                fill = (139, 83, 254, 55) if (row, col) == (0, 1) else None
                draw.rounded_rectangle((x, y, x + w, y + h), radius=scale(5), fill=fill, outline=(light if (row, col) == (0, 1) else dim), width=lw)

    elif key == "architecture":
        nodes = [(0.12, 0.7), (0.36, 0.22), (0.6, 0.62), (0.84, 0.3), (0.72, 0.88)]
        for i, first in enumerate(nodes):
            for second in nodes[i + 1 :]:
                if abs(first[0] - second[0]) < 0.42:
                    draw.line((point(box, *first), point(box, *second)), fill=(139, 83, 254, 90), width=lw)
        for index, node in enumerate(nodes):
            cx, cy = point(box, *node)
            radius = scale(9 if index in (1, 3) else 6)
            draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=(light if index in (1, 3) else mid))

    elif key in {"security", "security-approach", "security-policy"}:
        shield = [(0.5, 0.06), (0.1, 0.26), (0.14, 0.62), (0.5, 0.94), (0.86, 0.62), (0.9, 0.26)]
        draw.polygon([point(box, *p) for p in shield], outline=light, width=lw)
        draw.line(
            (
                point(box, 0.31, 0.48),
                point(box, 0.44, 0.62),
                point(box, 0.7, 0.34),
            ),
            fill=mid,
            width=scale(3),
            joint="curve",
        )
        if key == "security-policy":
            for offset in (0.16, 0.24):
                draw.line((point(box, 0.2, offset), point(box, 0.4, offset)), fill=(139, 83, 254, 70), width=lw)

    elif key == "roadmap":
        steps = [(0.04, 0.78, 0.26), (0.28, 0.55, 0.26), (0.54, 0.32, 0.26), (0.8, 0.1, 0.12)]
        for index, (x, y, w) in enumerate(steps):
            x0, y0 = point(box, x, y)
            x1, y1 = point(box, x + w, y + 0.12)
            draw.rounded_rectangle((x0, y0, x1, y1), radius=scale(4), fill=(139, 83, 254, 40 + index * 18), outline=(light if index == 3 else dim), width=lw)

    elif key == "contributing":
        draw.line((point(box, 0.28, 0.08), point(box, 0.28, 0.92)), fill=dim, width=lw)
        draw.line((point(box, 0.28, 0.48), point(box, 0.7, 0.48), point(box, 0.7, 0.22)), fill=dim, width=lw)
        for pos in ((0.28, 0.16), (0.28, 0.48), (0.28, 0.8), (0.7, 0.18)):
            cx, cy = point(box, *pos)
            draw.ellipse((cx - scale(7), cy - scale(7), cx + scale(7), cy + scale(7)), fill=(light if pos[1] == 0.48 else mid))
        draw.line((point(box, 0.32, 0.48), point(box, 0.38, 0.32), point(box, 0.66, 0.32), point(box, 0.7, 0.22)), fill=(139, 83, 254, 120), width=lw)

    elif key == "404":
        # Two separated links: a readable "broken chain" rather than a 404 glyph.
        for x, y in ((0.04, 0.32), (0.54, 0.32)):
            x0, y0 = point(box, x, y)
            x1, y1 = point(box, x + 0.42, y + 0.36)
            draw.rounded_rectangle((x0, y0, x1, y1), radius=(y1 - y0) / 2, outline=light, width=lw)
        draw.line((point(box, 0.48, 0.3), point(box, 0.54, 0.5), point(box, 0.48, 0.7)), fill=mid, width=lw)
        draw.line((point(box, 0.46, 0.18), point(box, 0.5, 0.08)), fill=(139, 83, 254, 120), width=lw)
        draw.line((point(box, 0.58, 0.86), point(box, 0.62, 0.94)), fill=(139, 83, 254, 120), width=lw)


def make_card(item: dict) -> Path:
    image = gradient_background()
    image = add_glow(image)
    image = add_grid(image)
    draw = ImageDraw.Draw(image)

    # Header: mark and tracked wordmark.
    mark = Image.open(MARK).convert("RGBA")
    mark.thumbnail((scale(42), scale(42)), Image.Resampling.LANCZOS)
    image.alpha_composite(mark, (scale(72), scale(52)))
    wordmark_font = font(FONT_SEMI, 21)
    tracked_text(draw, (scale(124), scale(62)), "AMETHERIAN", wordmark_font, WHITE, 3.2)

    # Status pill.
    pill_font = font(FONT_MONO, 14)
    label = item["label"]
    label_width = draw.textlength(label, font=pill_font) + (len(label) - 1) * 2.2 * S
    pad = scale(16)
    pill_right = scale(1128)
    pill_left = pill_right - label_width - pad * 2
    top = scale(54)
    height = scale(34)
    draw.rounded_rectangle(
        (pill_left, top, pill_right, top + height),
        radius=height // 2,
        fill=(139, 83, 254, 26),
        outline=(139, 83, 254, 120),
        width=scale(1.2),
    )
    tracked_text(
        draw,
        (pill_left + pad, top + scale(10)),
        label,
        pill_font,
        PURPLE_LIGHT,
        2.2,
    )

    # Headline and supporting copy. Choose a size that keeps the block above
    # the footer rule on every card.
    subtitle_font = font(FONT_REGULAR, 27)
    subtitle_lines = wrap(draw, item["subtitle"], subtitle_font, scale(720))
    title_font = None
    title_lines = []
    for size in range(96, 59, -2):
        candidate = font(FONT_BOLD, size)
        lines = wrap(draw, item["title"], candidate, scale(760))
        if len(lines) > 3:
            continue
        title_height = len(lines) * size * 1.06
        subtitle_height = len(subtitle_lines) * 38
        if 178 + title_height + 18 + subtitle_height <= 505:
            title_font = candidate
            title_lines = lines
            break
    if title_font is None:
        title_font = font(FONT_BOLD, 60)
        title_lines = wrap(draw, item["title"], title_font, scale(760))[:3]

    title_line_height = scale(int(title_font.size / S * 1.06))
    block_height = (
        len(title_lines) * title_line_height
        + scale(18)
        + len(subtitle_lines) * scale(38)
    )
    available = scale(327)
    y = scale(178) + max(0, (available - block_height) // 2)
    for line in title_lines:
        draw.text((scale(72), y), line, font=title_font, fill=WHITE)
        y += title_line_height

    y += scale(18)
    for line in subtitle_lines:
        draw.text((scale(72), y), line, font=subtitle_font, fill=MUTED)
        y += scale(38)

    # Right-hand brand panel with a page-specific motif.
    panel = (scale(884), scale(132), scale(1128), scale(508))
    draw.rounded_rectangle(panel, radius=scale(26), fill=PANEL, outline=LINE, width=scale(1.4))
    draw.rounded_rectangle(
        (panel[0], panel[1], panel[2], panel[1] + scale(4)),
        radius=scale(2),
        fill=PURPLE,
    )
    art = Image.open(MARK).convert("RGBA")
    art.thumbnail((scale(132), scale(132)), Image.Resampling.LANCZOS)
    art_x = (panel[0] + panel[2] - art.width) // 2
    image.alpha_composite(art, (art_x, scale(166)))
    draw = ImageDraw.Draw(image)

    draw.line((scale(910), scale(330), scale(1102), scale(330)), fill=LINE, width=scale(1.2))
    motif(draw, item["key"], (scale(912), scale(350), scale(188), scale(92)))

    caption_font = font(FONT_MONO, 12)
    caption = "AMETHERIAN"
    caption_width = draw.textlength(caption, font=caption_font) + (len(caption) - 1) * 1.6 * S
    tracked_text(
        draw,
        ((panel[0] + panel[2] - caption_width) / 2, scale(466)),
        caption,
        caption_font,
        MUTED_DIM,
        1.6,
    )

    # Footer rule and provenance.
    draw.line((scale(72), scale(524), scale(1128), scale(524)), fill=LINE, width=scale(1.2))
    url_font = font(FONT_MONO, 15)
    draw.text((scale(72), scale(544)), item["url"], font=url_font, fill=MUTED_DIM)
    note_font = font(FONT_REGULAR, 13)
    note = "Independent proposal · No packages released"
    note_width = draw.textlength(note, font=note_font)
    draw.text((scale(1128) - note_width, scale(546)), note, font=note_font, fill=MUTED_DIM)

    # A thin brand rule at the very top.
    for x in range(scale(72), scale(1128)):
        t = (x - scale(72)) / max(1, scale(1128) - scale(72))
        color = (
            round(PURPLE[0] * (1 - t) + 95 * t),
            round(PURPLE[1] * (1 - t) + 160 * t),
            round(PURPLE[2] * (1 - t) + 78 * t),
        )
        draw.line((x, 0, x, scale(3)), fill=color)

    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / f"{item['key']}.png"
    image = image.convert("RGB").resize((W, H), Image.Resampling.LANCZOS)
    image.save(target, optimize=True)
    return target


def main() -> None:
    items = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for item in items:
        target = make_card(item)
        print(f"wrote {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
