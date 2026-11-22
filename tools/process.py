"""Turn raw generated images (raw/*.png) into game-ready sprites (assets/*.png).

Background removal is a flood fill from the image border, so light colours inside a sprite
(the cream starburst, the white t-shirt) stay opaque.
Usage: python3 tools/process.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RAW, OUT = ROOT / "raw", ROOT / "assets"
OUT.mkdir(exist_ok=True)
KEY = (255, 0, 255)

# name -> (kind, target height in px). Sprites are stored at 2x game size, drawn smaller.
SPEC = {
    **{f"dario-{p}": ("sprite", 128) for p in ["idle", "run-a", "run-b", "jump", "crouch", "hurt", "win", "throw"]},
    "bug-a": ("sprite", 64), "bug-b": ("sprite", 64), "bug-flat": ("sprite", 40),
    "ghost-a": ("sprite", 80), "ghost-b": ("sprite", 80),
    "token": ("sprite", 48), "spark": ("sprite", 64), "goal": ("sprite", 576),
    "block-star": ("tile", 32), "block-used": ("tile", 32), "brick": ("tile", 32), "ground": ("tile", 32),
    "bg": ("bg", 544),
}


GROUPS = {**{f"dario-{p}": "dario-idle" for p in ["run-a", "run-b", "jump", "crouch", "hurt", "win", "throw"]},
          "bug-b": "bug-a", "bug-flat": "bug-a", "ghost-b": "ghost-a"}


def cut_background(im: Image.Image) -> Image.Image:
    rgb = im.convert("RGB")
    w, h = rgb.size
    # flood from many border points so separated white pockets on the edge also go
    pts = [(x, 0) for x in range(0, w, 16)] + [(x, h - 1) for x in range(0, w, 16)] + \
          [(0, y) for y in range(0, h, 16)] + [(w - 1, y) for y in range(0, h, 16)]
    for p in pts:
        r, g, b = rgb.getpixel(p)
        if min(r, g, b) > 225 and rgb.getpixel(p) != KEY:
            ImageDraw.floodfill(rgb, p, KEY, thresh=40)
    a = np.asarray(rgb)
    mask = ~((a[..., 0] == 255) & (a[..., 1] == 0) & (a[..., 2] == 255))
    alpha = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))  # eat the light halo
    out = im.convert("RGB").copy()
    out.putalpha(alpha)
    box = alpha.getbbox()
    return out.crop(box) if box else out


def square_tile(im: Image.Image) -> Image.Image:
    rgba = cut_background(im)
    w, h = rgba.size
    s = min(w, h)
    rgba = rgba.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    return rgba


def main():
    for name, (kind, size) in SPEC.items():
        src = RAW / f"{name}.png"
        if not src.exists():
            print("missing", name)
            continue
        im = Image.open(src)
        if kind == "bg":
            im = im.convert("RGB")
            im = im.resize((round(im.width * size / im.height), size), Image.LANCZOS)
        elif kind == "tile":
            im = (square_tile(im) if name != "ground" else im.convert("RGBA")).resize((size, size), Image.BOX)
        else:
            im = cut_background(im)
            group = GROUPS.get(name)
            if group:  # one scale for the whole group, taken from its first frame, so poses keep true size
                ref = cut_background(Image.open(RAW / f"{group}.png"))
                f = SPEC[group][1] / ref.height
            else:
                f = size / im.height
            im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.BOX)
        im.save(OUT / f"{name}.png", optimize=True)
        if name == "ground":  # underground fill: the earth part of the ground tile, no grass strip
            g = Image.open(src).convert("RGBA")
            g.crop((0, g.height * 45 // 100, g.width, g.height)).resize((32, 32), Image.BOX).save(OUT / "dirt.png", optimize=True)
        print("ok", name, im.size)


if __name__ == "__main__":
    main()
