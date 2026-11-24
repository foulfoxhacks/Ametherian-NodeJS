#!/usr/bin/env python3
"""Generate the Ametherian web brand assets from the supplied artwork.

The source files are the three original 2000x1971 uploads. The black-on-white
version is used as the alpha mask so the supplied mark is never redrawn by hand.
Run from the repository root:

    python scripts/make_brand_assets.py
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "_pylibs"))

try:
    import potrace
except ImportError as exc:  # pragma: no cover - authoring helper
    raise SystemExit(
        "Potracer is required: python -m pip install --target _pylibs potracer"
    ) from exc

ASSETS = ROOT / "assets"
BRAND = ASSETS / "brand"
UPLOADS = Path(r"E:\Codebase")

BRAND.mkdir(parents=True, exist_ok=True)

SOURCES = {
    "ametherian-primary.jpg": UPLOADS / "Ametherian.png",
    "ametherian-reverse.jpg": UPLOADS / "Ametherian (1).png",
    "ametherian-mono.jpg": UPLOADS / "Ametherian (2).png",
}

PURPLE = (139, 83, 254, 255)
WHITE = (255, 255, 255, 255)
INK = (11, 8, 18, 255)

# Bounding boxes measured from the supplied mono artwork.
MARK_BOX = (431, 230, 1567, 1372)  # left, top, right, bottom (exclusive)
LOCKUP_BOX = (427, 230, 1573, 1774)
PAD = 26


def copy_sources() -> None:
    for name, source in SOURCES.items():
        target = BRAND / name
        if source.exists():
            shutil.copy2(source, target)
        elif not target.exists():
            raise SystemExit(f"Missing source artwork: {source}")


def load_mask() -> tuple[Image.Image, np.ndarray]:
    image = Image.open(BRAND / "ametherian-mono.jpg").convert("L")
    gray = np.asarray(image)
    # Black pixels become opaque; white becomes transparent. Anti-aliased
    # edges keep partial opacity, which preserves the supplied curves.
    alpha = np.clip(255 - gray.astype(np.int16), 0, 255).astype(np.uint8)
    return image, alpha


def cropped_mask(alpha: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
    left, top, right, bottom = box
    return alpha[
        max(top - PAD, 0) : min(bottom + PAD, alpha.shape[0]),
        max(left - PAD, 0) : min(right + PAD, alpha.shape[1]),
    ]


def colorized(mask: np.ndarray, color: tuple[int, int, int, int]) -> Image.Image:
    image = Image.new("RGBA", (mask.shape[1], mask.shape[0]), color[:3] + (0,))
    image.putalpha(Image.fromarray(mask))
    return image


def save_png(image: Image.Image, name: str, max_width: int) -> None:
    if image.width > max_width:
        height = round(image.height * (max_width / image.width))
        image = image.resize((max_width, height), Image.Resampling.LANCZOS)
    image.save(ASSETS / name, optimize=True)
    print(f"wrote assets/{name} ({image.width}x{image.height})")


def trace_to_svg(mask: np.ndarray, name: str, fill: str) -> None:
    """Trace the supplied bitmap into a clean SVG using potrace."""
    bitmap = potrace.Bitmap(mask < 128)
    path = bitmap.trace(
        turdsize=2,
        turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,
        alphamax=1.0,
        opticurve=True,
        opttolerance=0.2,
    )
    parts: list[str] = []
    for curve in path:
        start = curve.start_point
        if start is None:
            continue
        parts.append(f"M{start.x:.2f} {start.y:.2f}")
        for segment in curve:
            if segment.is_corner:
                corner = segment.c
                end = segment.end_point
                parts.append(
                    f"L{corner.x:.2f} {corner.y:.2f}L{end.x:.2f} {end.y:.2f}"
                )
            else:
                c1, c2, end = segment.c1, segment.c2, segment.end_point
                parts.append(
                    "C"
                    f"{c1.x:.2f} {c1.y:.2f} "
                    f"{c2.x:.2f} {c2.y:.2f} "
                    f"{end.x:.2f} {end.y:.2f}"
                )
        parts.append("Z")
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {mask.shape[1]} '
        f'{mask.shape[0]}" role="img" aria-label="Ametherian">'
        f'<path fill="{fill}" fill-rule="evenodd" d="{"".join(parts)}"/></svg>\n'
    )
    (ASSETS / name).write_text(svg, encoding="utf-8")
    print(f"wrote assets/{name}")


def make_icon(mask: np.ndarray, size: int, background: str | None) -> Image.Image:
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if background:
        icon.paste(background, (0, 0, size, size))
    inner = round(size * 0.68)
    mark = colorized(mask, PURPLE)
    mark.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    icon.alpha_composite(
        mark, ((size - mark.width) // 2, (size - mark.height) // 2)
    )
    return icon


def make_favicon_svg(mask: np.ndarray) -> None:
    bitmap = potrace.Bitmap(mask < 128)
    path = bitmap.trace(
        turdsize=2,
        turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,
        alphamax=1.0,
        opticurve=True,
        opttolerance=0.2,
    )
    parts: list[str] = []
    for curve in path:
        start = curve.start_point
        if start is None:
            continue
        parts.append(f"M{start.x:.2f} {start.y:.2f}")
        for segment in curve:
            if segment.is_corner:
                corner, end = segment.c, segment.end_point
                parts.append(
                    f"L{corner.x:.2f} {corner.y:.2f}L{end.x:.2f} {end.y:.2f}"
                )
            else:
                c1, c2, end = segment.c1, segment.c2, segment.end_point
                parts.append(
                    "C"
                    f"{c1.x:.2f} {c1.y:.2f} "
                    f"{c2.x:.2f} {c2.y:.2f} "
                    f"{end.x:.2f} {end.y:.2f}"
                )
        parts.append("Z")
    w, h = mask.shape[1], mask.shape[0]
    # Fit the traced mark into a 64x64 dark tile with room to breathe.
    scale = 44 / max(w, h)
    tx = (64 - w * scale) / 2
    ty = (64 - h * scale) / 2
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        '<rect width="64" height="64" rx="14" fill="#120e1c"/>'
        f'<g transform="translate({tx:.2f} {ty:.2f}) scale({scale:.4f})">'
        f'<path fill="#8b53fe" fill-rule="evenodd" d="{"".join(parts)}"/></g></svg>\n'
    )
    (ASSETS / "favicon.svg").write_text(svg, encoding="utf-8")
    print("wrote assets/favicon.svg")


def main() -> None:
    copy_sources()
    _, alpha = load_mask()

    mark = cropped_mask(alpha, MARK_BOX)
    lockup = cropped_mask(alpha, LOCKUP_BOX)

    trace_to_svg(mark, "ametherian-mark.svg", "#8b53fe")
    trace_to_svg(mark, "ametherian-mark-white.svg", "#ffffff")
    trace_to_svg(lockup, "ametherian-lockup.svg", "#8b53fe")
    trace_to_svg(lockup, "ametherian-lockup-white.svg", "#ffffff")
    trace_to_svg(lockup, "ametherian-lockup-black.svg", "#0b0812")

    save_png(colorized(mark, PURPLE), "ametherian-mark-purple.png", 900)
    save_png(colorized(mark, WHITE), "ametherian-mark-white.png", 900)
    save_png(colorized(mark, INK), "ametherian-mark-black.png", 900)
    save_png(colorized(lockup, PURPLE), "ametherian-lockup-purple.png", 900)
    save_png(colorized(lockup, WHITE), "ametherian-lockup-white.png", 900)
    save_png(colorized(lockup, INK), "ametherian-lockup-black.png", 900)

    make_favicon_svg(mark)
    make_icon(mark, 32, None).save(ASSETS / "favicon-32.png", optimize=True)
    make_icon(mark, 180, "#120e1c").save(
        ASSETS / "apple-touch-icon.png", optimize=True
    )
    make_icon(mark, 512, "#120e1c").save(ASSETS / "icon-512.png", optimize=True)
    make_icon(mark, 48, "#120e1c").save(
        ASSETS / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]
    )
    print("wrote assets/favicon-32.png, apple-touch-icon.png, icon-512.png, favicon.ico")


if __name__ == "__main__":
    main()
