#!/usr/bin/env python3
"""
bg_style.py — Make the commercial's backgrounds match the product.

Takes the product photo's dominant colors and color-grades the five scene
backgrounds toward them, so every commercial feels designed for that product
instead of stamped from one template.

    from lib.bg_style import style_backgrounds_for_product
    bg_dir = style_backgrounds_for_product("uploads/photo.jpg", "output/job123/bg")
    # -> path with bg-hook.jpg, bg-showcase.jpg, ... graded to the product
"""

import os
import shutil
from PIL import Image, ImageDraw, ImageFilter

SCENE_BGS = ["bg-hook.jpg", "bg-showcase.jpg", "bg-features.jpg",
             "bg-proof.jpg", "bg-cta.jpg"]

# How strongly each scene takes the product's colors (0..1).
SCENE_GRADE = {
    "bg-hook.jpg": 0.22,
    "bg-showcase.jpg": 0.14,
    "bg-features.jpg": 0.20,
    "bg-proof.jpg": 0.18,
    "bg-cta.jpg": 0.22,
}


def extract_palette(image_path, n=3):
    """Dominant colors of an image, darkest...lightest, as (r,g,b) tuples."""
    img = Image.open(image_path).convert("RGB").resize((64, 64))
    # quantize to find dominant colors
    q = img.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: n * 3]
    colors = [tuple(pal[i * 3:(i + 1) * 3]) for i in range(n)]
    # drop near-black / near-white (usually photo backdrop, not product)
    def keep(c):
        l = sum(c) / 3
        return 28 < l < 232
    kept = [c for c in colors if keep(c)] or colors
    kept.sort(key=lambda c: sum(c))
    return kept


def _grade_one(bg_path, palette, strength, out_path):
    bg = Image.open(bg_path).convert("RGB")
    w, h = bg.size
    grade = Image.new("RGB", (w, h), palette[-1])  # lightest product color
    # soft radial wash: stronger at edges, keeps center readable
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([-w * 0.2, -h * 0.2, w * 1.2, h * 1.2], fill=int(255 * strength * 2))
    mask = mask.filter(ImageFilter.GaussianBlur(120))
    bg = Image.composite(
        Image.blend(bg, grade, min(strength, 0.35)), bg, mask
    )
    # tinted vignette from the darkest product color
    vig = Image.new("RGB", (w, h), palette[0])
    vmask = Image.new("L", (w, h), 0)
    vd = ImageDraw.Draw(vmask)
    vd.ellipse([-w * 0.35, -h * 0.35, w * 1.35, h * 1.35], fill=0)
    vd.rectangle([0, 0, w, h], fill=int(255 * strength * 1.4))
    vd.ellipse([-w * 0.1, -h * 0.1, w * 1.1, h * 1.1], fill=0)
    vmask = vmask.filter(ImageFilter.GaussianBlur(160))
    bg = Image.composite(Image.blend(bg, vig, 0.5), bg, vmask)
    bg.save(out_path, quality=90)


def style_backgrounds_for_product(product_image_path, out_dir, base_bg_dir=None):
    """Grade copies of the scene backgrounds to the product's palette.

    Returns out_dir, ready to pass as render --bg-dir.
    Falls back to ungraded copies if anything goes wrong.
    """
    if base_bg_dir is None:
        base_bg_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                   "..", "assets", "backgrounds")
    os.makedirs(out_dir, exist_ok=True)
    try:
        palette = extract_palette(product_image_path)
    except Exception:
        palette = None
    for fn in SCENE_BGS:
        src = os.path.join(base_bg_dir, fn)
        dst = os.path.join(out_dir, fn)
        try:
            if palette and os.path.exists(src):
                _grade_one(src, palette, SCENE_GRADE.get(fn, 0.18), dst)
            elif os.path.exists(src):
                shutil.copy(src, dst)
        except Exception:
            if os.path.exists(src):
                shutil.copy(src, dst)
    return out_dir
