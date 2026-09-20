#!/usr/bin/env python3
"""
scripts/styleframe_engine.py — StyleFrame Studio Python Compositing Engine
Mimics styleframe.ai capability: takes product cutouts, renders 3D turntable
angles, contact/cast shadows, glossy floor reflections, 3D pedestals, and
studio backdrops (including commercial-maker-v6 backgrounds).

Usage:
    python scripts/styleframe_engine.py --input public/cutouts/wc-shorts-cutout.png \
        --preset amazon_white --out-dir public/styleframes/wc-shorts --gif
"""

import os
import sys
import math
import argparse

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
from PIL import Image, ImageDraw, ImageFilter, ImageOps, ImageEnhance

PRESETS = {
    "amazon_white": {
        "name": "Amazon Pure White",
        "bg_type": "solid",
        "bg_color": (255, 255, 255),
        "pedestal_color": (245, 245, 248),
        "pedestal_edge": (220, 220, 225),
        "shadow_color": (30, 30, 35),
        "shadow_opacity": 0.25,
        "reflection_opacity": 0.08,
        "neon": False,
    },
    "minimalist_dark": {
        "name": "Minimalist Charcoal Studio",
        "bg_type": "gradient_radial",
        "bg_inner": (45, 52, 65),
        "bg_outer": (17, 20, 26),
        "pedestal_color": (28, 33, 42),
        "pedestal_edge": (55, 65, 80),
        "shadow_color": (5, 5, 8),
        "shadow_opacity": 0.75,
        "reflection_opacity": 0.22,
        "neon": False,
    },
    "cyber_neon": {
        "name": "TikTok Cyber Neon",
        "bg_type": "gradient_radial",
        "bg_inner": (25, 20, 45),
        "bg_outer": (10, 10, 18),
        "pedestal_color": (20, 20, 30),
        "pedestal_edge": (0, 242, 254), # TikTok Cyan
        "shadow_color": (0, 0, 0),
        "shadow_opacity": 0.85,
        "reflection_opacity": 0.35,
        "neon": True,
        "neon_color": (0, 242, 254),
        "accent_color": (255, 153, 0), # Amazon Orange
    },
    "luxury_warm": {
        "name": "Warm Luxury Editorial",
        "bg_type": "gradient_radial",
        "bg_inner": (85, 60, 45),
        "bg_outer": (28, 20, 18),
        "pedestal_color": (48, 35, 28),
        "pedestal_edge": (160, 120, 80),
        "shadow_color": (15, 10, 8),
        "shadow_opacity": 0.65,
        "reflection_opacity": 0.20,
        "neon": False,
    },
    "commercial_showcase": {
        "name": "Commercial Maker Showcase",
        "bg_type": "image",
        "bg_file": "public/backgrounds/bg-showcase.jpg",
        "pedestal_color": (32, 36, 44),
        "pedestal_edge": (70, 80, 100),
        "shadow_color": (10, 10, 15),
        "shadow_opacity": 0.70,
        "reflection_opacity": 0.25,
        "neon": False,
    },
    "commercial_features": {
        "name": "Commercial Maker Features",
        "bg_type": "image",
        "bg_file": "public/backgrounds/bg-features.jpg",
        "pedestal_color": (30, 30, 36),
        "pedestal_edge": (65, 65, 80),
        "shadow_color": (10, 10, 15),
        "shadow_opacity": 0.70,
        "reflection_opacity": 0.25,
        "neon": False,
    },
}


def create_radial_gradient(width, height, inner_color, outer_color):
    """Generate smooth radial gradient background."""
    img = Image.new("RGB", (width, height), outer_color)
    draw = ImageDraw.Draw(img)
    max_radius = int(math.hypot(width, height) / 1.5)
    cx, cy = width // 2, int(height * 0.45)
    
    steps = 40
    for i in range(steps, 0, -1):
        ratio = i / steps
        r = int(max_radius * ratio)
        col = tuple(
            int(inner_color[c] + (outer_color[c] - inner_color[c]) * (1 - ratio))
            for c in range(3)
        )
        draw.ellipse([cx - r, cy - int(r * 0.7), cx + r, cy + int(r * 0.7)], fill=col)
    
    return img.filter(ImageFilter.GaussianBlur(width // 25))


def render_pedestal(width, height, center_y, radius_x, radius_y, height_3d, preset_cfg):
    """Draw a 3D cylindrical podium/turntable disc."""
    pedestal_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(pedestal_layer)
    cx = width // 2
    top_y = center_y
    base_y = top_y + height_3d
    
    base_col = preset_cfg.get("pedestal_color", (40, 45, 55))
    edge_col = preset_cfg.get("pedestal_edge", (80, 90, 110))
    is_neon = preset_cfg.get("neon", False)

    # 1. Beveled cylinder body
    body_box = [cx - radius_x, top_y, cx + radius_x, base_y + radius_y]
    draw.rectangle([cx - radius_x, top_y, cx + radius_x, base_y], fill=(*base_col, 240))
    draw.ellipse([cx - radius_x, base_y - radius_y, cx + radius_x, base_y + radius_y], fill=(*base_col, 240))
    
    # 2. Top surface disc
    top_col = tuple(min(255, int(c * 1.25)) for c in base_col)
    draw.ellipse([cx - radius_x, top_y - radius_y, cx + radius_x, top_y + radius_y], fill=(*top_col, 255), outline=(*edge_col, 255), width=2)

    # 3. Optional Neon Glowing Edge
    if is_neon:
        neon_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        n_draw = ImageDraw.Draw(neon_layer)
        neon_c = preset_cfg.get("neon_color", (0, 242, 254))
        n_draw.ellipse([cx - radius_x, top_y - radius_y, cx + radius_x, top_y + radius_y], outline=(*neon_c, 255), width=4)
        glow = neon_layer.filter(ImageFilter.GaussianBlur(8))
        pedestal_layer = Image.alpha_composite(pedestal_layer, glow)
        pedestal_layer = Image.alpha_composite(pedestal_layer, neon_layer)

    return pedestal_layer


def transform_product_angle(cutout_img, angle_deg, target_h):
    """
    Simulates 3D turntable rotation foreshortening using 2.5D perspective width scaling.
    angle_deg: 0 to 360
    """
    rad = math.radians(angle_deg)
    scale_x = abs(math.cos(rad))
    effective_scale_x = max(0.20, scale_x)
    
    orig_w, orig_h = cutout_img.size
    aspect = orig_w / orig_h
    h = target_h
    w = int(h * aspect * effective_scale_x)
    
    transformed = cutout_img.resize((max(1, w), max(1, h)), Image.Resampling.LANCZOS)
    
    if 90 < (angle_deg % 360) < 270:
        transformed = ImageOps.mirror(transformed)
        r, g, b, a = transformed.split()
        rgb = Image.merge("RGB", (r, g, b))
        darkened_rgb = ImageEnhance.Brightness(rgb).enhance(0.92)
        dr, dg, db = darkened_rgb.split()
        transformed = Image.merge("RGBA", (dr, dg, db, a))
        
    return transformed


def render_shadows(width, height, prod_img, prod_x, prod_y, pedestal_y, preset_cfg, elevation=0):
    """Generates contact occlusion shadow + floor drop shadow."""
    shadow_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow_layer)
    
    pw, ph = prod_img.size
    cx = prod_x + pw // 2
    ground_y = pedestal_y
    
    shadow_col = preset_cfg.get("shadow_color", (0, 0, 0))
    shadow_alpha = int(preset_cfg.get("shadow_opacity", 0.6) * 255)
    
    # 1. Contact Occlusion Shadow (tight under base)
    contact_rx = max(10, int(pw * 0.35))
    contact_ry = max(4, int(contact_rx * 0.25))
    contact_box = [cx - contact_rx, ground_y - contact_ry, cx + contact_rx, ground_y + contact_ry]
    s_draw.ellipse(contact_box, fill=(*shadow_col, int(shadow_alpha * 0.9)))
    
    # 2. Soft Cast Drop Shadow (slightly offset by light source)
    cast_rx = max(20, int(pw * 0.48 + elevation * 0.3))
    cast_ry = max(8, int(cast_rx * 0.32))
    cast_cx = cx + 15  # light coming from upper left
    cast_box = [cast_cx - cast_rx, ground_y - cast_ry + 8, cast_cx + cast_rx, ground_y + cast_ry + 8]
    s_draw.ellipse(cast_box, fill=(*shadow_col, int(shadow_alpha * 0.5)))
    
    return shadow_layer.filter(ImageFilter.GaussianBlur(16))


def render_reflection(width, height, prod_img, prod_x, prod_y, ground_y, preset_cfg):
    """Renders glossy floor reflection with vertical falloff."""
    ref_opacity = preset_cfg.get("reflection_opacity", 0.20)
    if ref_opacity <= 0.01:
        return Image.new("RGBA", (width, height), (0, 0, 0, 0))
    
    pw, ph = prod_img.size
    flipped = prod_img.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    
    fade_mask = Image.new("L", (pw, ph), 0)
    fade_draw = ImageDraw.Draw(fade_mask)
    for y in range(ph):
        factor = max(0.0, 1.0 - (y / (ph * 0.45)))
        fade_draw.line([(0, y), (pw, y)], fill=int(factor * ref_opacity * 255))
    
    r, g, b, a = flipped.split()
    combined_a = ImageEnhance.Brightness(a).enhance(1.0)
    combined_a = Image.composite(combined_a, Image.new("L", (pw, ph), 0), fade_mask)
    
    reflection_prod = Image.merge("RGBA", (r, g, b, combined_a))
    
    ref_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ref_layer.paste(reflection_prod, (prod_x, ground_y), reflection_prod)
    return ref_layer


def composite_styleframe(
    cutout_path,
    preset_key="amazon_white",
    angle_deg=0,
    width=1080,
    height=1080,
    elevation=0,
    show_pedestal=True,
):
    """Composites a single styleframe image with full studio treatment."""
    preset = PRESETS.get(preset_key, PRESETS["amazon_white"])
    
    # 1. Prepare Background
    bg_type = preset.get("bg_type", "solid")
    if bg_type == "solid":
        canvas = Image.new("RGBA", (width, height), (*preset["bg_color"], 255))
    elif bg_type == "gradient_radial":
        rgb_canvas = create_radial_gradient(width, height, preset["bg_inner"], preset["bg_outer"])
        canvas = rgb_canvas.convert("RGBA")
    elif bg_type == "image":
        bg_path = preset.get("bg_file")
        if os.path.exists(bg_path):
            img_bg = Image.open(bg_path).convert("RGBA")
            canvas = img_bg.resize((width, height), Image.Resampling.LANCZOS)
        else:
            canvas = Image.new("RGBA", (width, height), (25, 30, 40, 255))
    else:
        canvas = Image.new("RGBA", (width, height), (255, 255, 255, 255))

    # 2. Product Geometry & Stage Dimensions
    cutout = Image.open(cutout_path).convert("RGBA")
    pedestal_y = int(height * 0.72)
    pedestal_rx = int(width * 0.38)
    pedestal_ry = int(pedestal_rx * 0.28)
    pedestal_h = int(height * 0.05)
    
    # 3. Draw Pedestal
    if show_pedestal:
        pedestal_img = render_pedestal(
            width, height, pedestal_y, pedestal_rx, pedestal_ry, pedestal_h, preset
        )
        canvas = Image.alpha_composite(canvas, pedestal_img)

    # 4. Transform Product (Angle & Scale)
    target_product_h = int(height * 0.52)
    product_transformed = transform_product_angle(cutout, angle_deg, target_product_h)
    pw, ph = product_transformed.size
    
    prod_x = (width - pw) // 2
    prod_y = pedestal_y - ph - elevation + 12

    # 5. Reflection (Underneath product)
    ref_layer = render_reflection(width, height, product_transformed, prod_x, prod_y, pedestal_y, preset)
    canvas = Image.alpha_composite(canvas, ref_layer)

    # 6. Contact & Cast Shadows
    shadow_layer = render_shadows(
        width, height, product_transformed, prod_x, prod_y, pedestal_y, preset, elevation
    )
    canvas = Image.alpha_composite(canvas, shadow_layer)

    # 7. Composite Product Itself
    canvas.paste(product_transformed, (prod_x, prod_y), product_transformed)

    return canvas.convert("RGB")


def export_keyframe_suite(cutout_path, out_dir, preset_key="amazon_white", width=1080, height=1080):
    """
    Generates standard 4-angle e-commerce keyframe pack:
    - 0° Front Hero
    - 45° 3/4 Dynamic Angle
    - 90° Side Profile
    - 315° Reverse 3/4 Hero
    """
    os.makedirs(out_dir, exist_ok=True)
    angles = [
        ("front_0deg", 0),
        ("angle_45deg", 45),
        ("profile_90deg", 90),
        ("dynamic_315deg", 315),
    ]
    results = []
    for label, deg in angles:
        frame = composite_styleframe(
            cutout_path, preset_key=preset_key, angle_deg=deg, width=width, height=height
        )
        out_fn = f"styleframe_{preset_key}_{label}.png"
        out_path = os.path.join(out_dir, out_fn)
        frame.save(out_path, "PNG", quality=95)
        results.append({"label": label, "angle": deg, "path": out_path, "filename": out_fn})
        print(f"✓ Saved keyframe: {out_fn}")
    return results


def export_turntable_gif(
    cutout_path, out_path, preset_key="amazon_white", num_frames=16, width=640, height=640
):
    """Generates an animated 360° turntable GIF loop."""
    frames = []
    step = 360 // num_frames
    for i in range(num_frames):
        deg = i * step
        frame = composite_styleframe(
            cutout_path, preset_key=preset_key, angle_deg=deg, width=width, height=height
        )
        frames.append(frame)
        print(f"Rendered GIF frame {i+1}/{num_frames} ({deg}°)...")
        
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    frames[0].save(
        out_path,
        save_all=True,
        append_images=frames[1:],
        duration=120,
        loop=0,
        optimize=True,
    )
    print(f"✓ Saved 360° Turntable GIF: {out_path}")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="StyleFrame Studio Python Engine")
    parser.add_argument("--input", required=True, help="Path to cutout transparent PNG")
    parser.add_argument("--preset", default="amazon_white", choices=list(PRESETS.keys()), help="Style preset")
    parser.add_argument("--out-dir", default="public/styleframes", help="Output directory")
    parser.add_argument("--width", type=int, default=1080, help="Frame width")
    parser.add_argument("--height", type=int, default=1080, help="Frame height")
    parser.add_argument("--gif", action="store_true", help="Generate animated turntable GIF")
    parser.add_argument("--all-presets", action="store_true", help="Render hero frame for all presets")

    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: input file {args.input} not found.")
        sys.exit(1)

    print(f"🎨 Running StyleFrame Studio Engine on {args.input}...")
    
    if args.all_presets:
        os.makedirs(args.out_dir, exist_ok=True)
        for p in PRESETS.keys():
            img = composite_styleframe(args.input, preset_key=p, angle_deg=45, width=args.width, height=args.height)
            out_f = os.path.join(args.out_dir, f"styleframe_{p}_hero.png")
            img.save(out_f, "PNG")
            print(f"✓ Rendered preset hero: {p} -> {out_f}")
    else:
        export_keyframe_suite(args.input, args.out_dir, preset_key=args.preset, width=args.width, height=args.height)
        
        if args.gif:
            gif_out = os.path.join(args.out_dir, f"turntable_{args.preset}_360.gif")
            export_turntable_gif(args.input, gif_out, preset_key=args.preset, num_frames=12, width=480, height=480)

    print("🚀 StyleFrame rendering complete.")


if __name__ == "__main__":
    main()
