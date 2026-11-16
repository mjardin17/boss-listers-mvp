#!/usr/bin/env python3
"""
scripts/card_prep.py — Local Background Removal, Card Cutout, Perspective Straighten & Picture Cropper
BossListers / Commercial Maker v6 (100% local, zero paid APIs).

Modes:
  - card    : Detects a trading card (or slab) against messy real-world backgrounds (hands, desks,
              keyboards, mats), fits the 4 straight outer borders with robust Huber line fitting,
              perspective-straightens to a crisp portrait/landscape card with rounded corners, and
              outputs a transparent RGBA PNG. Falls back to GrabCut cutout if no card quad is found.
  - cutout  : General-purpose foreground extraction (tries local RMBG-1.4 sidecar or
              commercial-maker-v6 RMBG-1.4 when installed; otherwise runs multi-pass OpenCV GrabCut
              with edge-preserving alpha feathering and tight transparent crop).
  - crop    : Crops a normalized rectangle (--crop x,y,w,h) or 4-corner quad (--corners ...),
              optionally with rounded corners or background removal.
  - closeup : Extracts a clean macro close-up crop (art | top | bottom | center) from a card
              (automatically straightening the card first unless --no-straighten is passed).
  - none    : EXIF-transposes and saves as PNG/JPEG with optional background replacement.

Optional background replacement (--replace-bg-preset / --replace-bg-image / --replace-bg-color):
  Composites the transparent cutout onto a studio backdrop with contact + soft cast drop shadow.
"""

import argparse
import json
import math
import os
import sys
import urllib.request
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

SIDECAR_URL = "http://127.0.0.1:8765/remove-bg"

STUDIO_BG_PRESETS = {
    "dark-velvet": {"type": "radial", "inner": (22, 34, 60), "outer": (6, 10, 20)},
    "navy-gold": {"type": "radial", "inner": (26, 38, 66), "outer": (5, 9, 18)},
    "obsidian": {"type": "radial", "inner": (34, 38, 46), "outer": (10, 12, 16)},
    "gold-glow": {"type": "radial", "inner": (82, 64, 28), "outer": (8, 10, 18)},
    "emerald-vault": {"type": "radial", "inner": (16, 62, 48), "outer": (5, 16, 14)},
    "crimson-vault": {"type": "radial", "inner": (78, 20, 32), "outer": (16, 6, 10)},
    "studio-white": {"type": "solid", "color": (250, 250, 252)},
}

CLOSEUP_REGIONS = {
    # Standard trading card (Pokemon / TCG / sports) upper artwork window
    "art": (0.075, 0.105, 0.85, 0.395),
    "top": (0.04, 0.03, 0.92, 0.52),
    "bottom": (0.04, 0.50, 0.92, 0.47),
    "center": (0.12, 0.18, 0.76, 0.62),
}


def load_exif_rgb(input_path):
    """Load an image with EXIF orientation applied and return a PIL RGB Image."""
    with Image.open(input_path) as im:
        oriented = ImageOps.exif_transpose(im)
        if oriented.mode == "RGBA":
            bg = Image.new("RGB", oriented.size, (0, 0, 0))
            bg.paste(oriented, mask=oriented.split()[-1])
            return bg
        return oriented.convert("RGB")


def parse_hex_color(hex_str, default=(8, 13, 27)):
    s = (hex_str or "").strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) != 6:
        return default
    try:
        return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
    except ValueError:
        return default


def order_quad(pts):
    """Order 4 points consistently as [top-left, top-right, bottom-right, bottom-left]."""
    pts = np.array(pts, dtype=np.float32).reshape(4, 2)
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1).reshape(-1)
    tl = pts[int(np.argmin(s))]
    br = pts[int(np.argmax(s))]
    tr = pts[int(np.argmin(diff))]
    bl = pts[int(np.argmax(diff))]
    return np.array([tl, tr, br, bl], dtype=np.float32)


def intersect_lines(l1, l2):
    """Intersect two cv2.fitLine tuples (vx, vy, x0, y0)."""
    vx1, vy1, x1, y1 = l1
    vx2, vy2, x2, y2 = l2
    det = vx1 * (-vy2) - vy1 * (-vx2)
    if abs(det) < 1e-6:
        return None
    rhs_x = x2 - x1
    rhs_y = y2 - y1
    t = (rhs_x * (-vy2) - rhs_y * (-vx2)) / det
    return np.array([x1 + t * vx1, y1 + t * vy1], dtype=np.float32)


def run_grabcut_mask(bgr_small, iterations=5):
    """
    Isolate the foreground subject using OpenCV GrabCut with outer-border background prior.
    Returns binary uint8 mask (0 or 255).
    """
    sh, sw = bgr_small.shape[:2]
    mask = np.full((sh, sw), cv2.GC_PR_FGD, dtype=np.uint8)
    mx = max(4, int(sw * 0.025))
    my = max(4, int(sh * 0.025))
    mask[:my, :] = cv2.GC_BGD
    mask[-my:, :] = cv2.GC_BGD
    mask[:, :mx] = cv2.GC_BGD
    mask[:, -mx:] = cv2.GC_BGD

    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(bgr_small, mask, None, bgd, fgd, iterations, cv2.GC_INIT_WITH_MASK)
    gc_bin = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
    return gc_bin


def largest_component(mask_bin):
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask_bin, connectivity=8)
    if num_labels <= 1:
        return None, 0
    best = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    area = int(stats[best, cv2.CC_STAT_AREA])
    comp = np.where(labels == best, 255, 0).astype(np.uint8)
    return comp, area


def validate_card_quad(quad, img_w, img_h):
    """Verify detected quadrilateral is convex, in-bounds, and matches a plausible card/slab."""
    if quad is None or quad.shape != (4, 2):
        return False, 0.0, 0.0
    if not np.all(np.isfinite(quad)):
        return False, 0.0, 0.0

    # Allow slight out-of-frame corner extrapolation (up to 6% of dimension)
    pad_x = img_w * 0.06
    pad_y = img_h * 0.06
    if (
        quad[:, 0].min() < -pad_x
        or quad[:, 0].max() > img_w + pad_x
        or quad[:, 1].min() < -pad_y
        or quad[:, 1].max() > img_h + pad_y
    ):
        return False, 0.0, 0.0

    area = float(cv2.contourArea(quad.astype(np.float32)))
    img_area = float(img_w * img_h)
    coverage = area / max(1.0, img_area)
    if coverage < 0.14 or coverage > 0.995:
        return False, coverage, 0.0

    if not cv2.isContourConvex(quad.astype(np.float32)):
        return False, coverage, 0.0

    tl, tr, br, bl = quad
    w_top = float(np.linalg.norm(tr - tl))
    w_bot = float(np.linalg.norm(br - bl))
    h_left = float(np.linalg.norm(bl - tl))
    h_right = float(np.linalg.norm(br - tr))
    avg_w = (w_top + w_bot) / 2.0
    avg_h = (h_left + h_right) / 2.0
    if avg_w < 30 or avg_h < 30:
        return False, coverage, 0.0

    # Opposite edges shouldn't diverge wildly (> 35% difference suggests bad perspective fit)
    if max(w_top, w_bot) / max(1.0, min(w_top, w_bot)) > 1.38:
        return False, coverage, 0.0
    if max(h_left, h_right) / max(1.0, min(h_left, h_right)) > 1.38:
        return False, coverage, 0.0

    aspect = avg_w / avg_h
    # Portrait card/slab (0.48..0.95) or landscape card (1.05..1.90)
    if not ((0.48 <= aspect <= 0.96) or (1.05 <= aspect <= 1.90)):
        return False, coverage, aspect

    return True, coverage, aspect


def fit_outer_quad_from_mask(mask_bin):
    """
    Given a binary foreground mask of a trading card (even with minor finger occlusion
    on one edge or dark interior holes), recover the exact 4 perspective corners by:
      1. Keeping largest connected component & closing internal notches.
      2. Taking convex hull -> minAreaRect to orient the 4 sides cleanly.
      3. Fitting 4 straight Huber lines to contour points along the middle 76% of each side.
      4. Intersecting adjacent fitted lines to obtain exact corners.
    """
    h, w = mask_bin.shape[:2]
    comp, area = largest_component(mask_bin)
    if comp is None or area < int(h * w * 0.12):
        return None

    k = max(5, int(min(h, w) * 0.025) | 1)
    closed = cv2.morphologyEx(
        comp, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k))
    )
    cnts, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cnts:
        return None
    main_cnt = max(cnts, key=cv2.contourArea)

    hull = cv2.convexHull(main_cnt)
    hull_area = float(cv2.contourArea(hull))
    rect = cv2.minAreaRect(hull)
    box = order_quad(cv2.boxPoints(rect))
    box_area = float(cv2.contourArea(box))

    # Reject non-rectangular shapes (e.g. clothing or irregular toys): a card's hull fills >= 82% of its bounding box
    rectangularity = hull_area / max(1.0, box_area)
    if rectangularity < 0.80:
        return None

    cnt_pts = main_cnt.reshape(-1, 2).astype(np.float32)
    edge_pairs = [(0, 1), (1, 2), (2, 3), (3, 0)]  # top, right, bottom, left
    fitted_lines = []

    for a, b in edge_pairs:
        p1, p2 = box[a], box[b]
        edge_vec = p2 - p1
        edge_len = float(np.linalg.norm(edge_vec))
        if edge_len < 12:
            return box
        u = edge_vec / edge_len
        n = np.array([-u[1], u[0]], dtype=np.float32)

        rel = cnt_pts - p1
        along = rel @ u
        perp = np.abs(rel @ n)

        band = max(4.0, edge_len * 0.025)
        inliers = cnt_pts[
            (along >= edge_len * 0.12) & (along <= edge_len * 0.88) & (perp <= band)
        ]
        if len(inliers) < 12:
            inliers = cnt_pts[
                (along >= edge_len * 0.10) & (along <= edge_len * 0.90) & (perp <= band * 2.5)
            ]
        if len(inliers) >= 8:
            line = cv2.fitLine(inliers, cv2.DIST_HUBER, 0, 0.01, 0.01).reshape(-1)
            fitted_lines.append(tuple(float(v) for v in line))
        else:
            fitted_lines.append((float(u[0]), float(u[1]), float(p1[0]), float(p1[1])))

    tl = intersect_lines(fitted_lines[3], fitted_lines[0])
    tr = intersect_lines(fitted_lines[0], fitted_lines[1])
    br = intersect_lines(fitted_lines[1], fitted_lines[2])
    bl = intersect_lines(fitted_lines[2], fitted_lines[3])
    if any(p is None for p in (tl, tr, br, bl)):
        return box

    quad = order_quad([tl, tr, br, bl])
    ok, _, _ = validate_card_quad(quad, w, h)
    if ok:
        return quad
    ok_box, _, _ = validate_card_quad(box, w, h)
    return box if ok_box else None


def detect_card_quad(bgr):
    """
    Detect the 4 perspective corners of a trading card in full-resolution BGR image.
    Returns (quad_full_float32, strategy_name) or (None, "none").
    """
    H, W = bgr.shape[:2]
    max_side = 800.0
    scale = min(1.0, max_side / float(max(W, H)))
    sw = max(64, int(round(W * scale)))
    sh = max(64, int(round(H * scale)))
    small = cv2.resize(bgr, (sw, sh), interpolation=cv2.INTER_AREA)

    # Check if image is already an edge-to-edge card crop (very uniform card ratio & little outer bg)
    img_aspect = W / float(H)

    # Strategy 1: GrabCut foreground mask -> robust 4-edge Huber quad fit
    gc_bin = run_grabcut_mask(small, iterations=5)
    quad_s = fit_outer_quad_from_mask(gc_bin)
    if quad_s is not None:
        ok, cov, _ = validate_card_quad(quad_s, sw, sh)
        if ok:
            return quad_s / scale, "grabcut_quad"

    # Strategy 2: Color-distance from border median (handles clean mats / solid tables)
    border_pixels = np.concatenate(
        [
            small[:8, :, :].reshape(-1, 3),
            small[-8:, :, :].reshape(-1, 3),
            small[:, :8, :].reshape(-1, 3),
            small[:, -8:, :].reshape(-1, 3),
        ],
        axis=0,
    ).astype(np.float32)
    bg_median = np.median(border_pixels, axis=0)
    dist = np.linalg.norm(small.astype(np.float32) - bg_median, axis=2)
    thresh_val = max(24.0, float(np.percentile(dist, 30)) * 1.4)
    color_mask = np.where(dist > thresh_val, 255, 0).astype(np.uint8)
    quad_c = fit_outer_quad_from_mask(color_mask)
    if quad_c is not None:
        ok, _, _ = validate_card_quad(quad_c, sw, sh)
        if ok:
            return quad_c / scale, "border_color_quad"

    # Strategy 3: If input itself is already tightly cropped to standard card ratio (0.65..0.78)
    # and the border is fairly uniform card-border color (low variance along outer 3%), treat full frame as card
    if 0.64 <= img_aspect <= 0.80:
        border_std = float(np.std(border_pixels))
        if border_std < 38.0:
            full_quad = np.array(
                [[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]], dtype=np.float32
            )
            return full_quad, "full_frame_card"

    return None, "none"


def apply_rounded_alpha(rgb_img, corner_radius_ratio=0.042, aa_scale=2):
    """Apply crisp anti-aliased rounded corners to an RGB PIL Image and return RGBA."""
    w, h = rgb_img.size
    radius = max(4, int(round(min(w, h) * corner_radius_ratio)))
    if corner_radius_ratio <= 0:
        return rgb_img.convert("RGBA")

    # Supersample mask for silky-smooth anti-aliased rounded corners
    sw, sh = w * aa_scale, h * aa_scale
    sr = radius * aa_scale
    mask_hi = Image.new("L", (sw, sh), 0)
    draw = ImageDraw.Draw(mask_hi)
    draw.rounded_rectangle([0, 0, sw - 1, sh - 1], radius=sr, fill=255)
    mask = mask_hi.resize((w, h), Image.Resampling.LANCZOS)
    rgba = rgb_img.convert("RGBA")
    rgba.putalpha(mask)
    return rgba


def warp_card_from_quad(bgr, quad, card_aspect=None, target_width=1000, inset_ratio=0.992, corner_ratio=0.042):
    """Perspective-rectify the detected card quadrilateral to a crisp rounded-corner RGBA PNG."""
    quad = order_quad(quad)
    tl, tr, br, bl = quad
    w_est = (float(np.linalg.norm(tr - tl)) + float(np.linalg.norm(br - bl))) / 2.0
    h_est = (float(np.linalg.norm(bl - tl)) + float(np.linalg.norm(br - tr))) / 2.0
    measured_aspect = w_est / max(1.0, h_est)

    # Slightly pull quad inward by 0.4% per edge to avoid capturing stray background fringe
    center = quad.mean(axis=0)
    quad_in = center + (quad - center) * inset_ratio

    if card_aspect == "slab":
        out_w, out_h = target_width, int(round(target_width * 1.60))
    elif card_aspect == "landscape" or (card_aspect is None and measured_aspect > 1.05):
        out_w = max(target_width, 1400)
        out_h = int(round(out_w / 1.40))
    elif card_aspect == "preserve":
        out_w = target_width
        out_h = max(100, int(round(target_width / max(0.35, min(2.5, measured_aspect)))))
    else:
        # Standard trading card ratio 2.5" x 3.5" (0.7143) unless clearly a taller graded slab (>1.48 tall)
        if measured_aspect < 0.65:
            out_w = target_width
            out_h = int(round(target_width / max(0.54, measured_aspect)))
        else:
            out_w = target_width
            out_h = int(round(target_width * 1.40))  # 1000 x 1400

    dst = np.array(
        [[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]], dtype=np.float32
    )
    M = cv2.getPerspectiveTransform(quad_in.astype(np.float32), dst)
    warped_bgr = cv2.warpPerspective(bgr, M, (out_w, out_h), flags=cv2.INTER_LANCZOS4)
    warped_rgb = cv2.cvtColor(warped_bgr, cv2.COLOR_BGR2RGB)
    return apply_rounded_alpha(Image.fromarray(warped_rgb), corner_radius_ratio=corner_ratio)


def try_rmbg_sidecar(input_path, output_path):
    """Try BossListers' warm RMBG-1.4 sidecar at 127.0.0.1:8765 if running."""
    try:
        payload = json.dumps(
            {"input_path": str(Path(input_path).resolve()), "output_path": str(Path(output_path).resolve())}
        ).encode("utf-8")
        req = urllib.request.Request(
            SIDECAR_URL,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200 and os.path.exists(output_path):
                return Image.open(output_path).convert("RGBA")
    except Exception:
        return None
    return None


def try_v6_rmbg_module(input_path, output_path):
    """Try Commercial Maker v6's local RMBG-1.4 module when present on Windows PC."""
    v6_dir = Path(os.environ.get("COMMERCIAL_MAKER_V6_DIR", r"C:\Users\jjard\claude\commercial-maker-v6"))
    if not (v6_dir / "lib" / "bg_remove.py").exists():
        return None
    try:
        if str(v6_dir) not in sys.path:
            sys.path.insert(0, str(v6_dir))
        from lib.bg_remove import remove_background  # type: ignore

        remove_background(str(Path(input_path).resolve()), str(Path(output_path).resolve()))
        if os.path.exists(output_path):
            return Image.open(output_path).convert("RGBA")
    except Exception:
        return None
    return None


def grabcut_general_cutout(rgb_pil, trim=True):
    """
    Local OpenCV GrabCut cutout for arbitrary objects / non-rectangular cut-in photos.
    Returns RGBA PIL Image with softly anti-aliased edges and optional tight transparent trim.
    """
    rgb = np.array(rgb_pil)
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    H, W = bgr.shape[:2]

    scale = min(1.0, 900.0 / float(max(W, H)))
    sw = max(64, int(round(W * scale)))
    sh = max(64, int(round(H * scale)))
    small = cv2.resize(bgr, (sw, sh), interpolation=cv2.INTER_AREA)

    gc_bin = run_grabcut_mask(small, iterations=6)
    comp, area = largest_component(gc_bin)
    if comp is None or area < int(sw * sh * 0.03):
        # Nothing clearly isolated; keep original intact
        return rgb_pil.convert("RGBA"), False

    # Morphological cleanup + slight edge feathering
    k = max(3, int(min(sw, sh) * 0.008) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    cleaned = cv2.morphologyEx(comp, cv2.MORPH_CLOSE, kernel)
    cleaned = cv2.morphologyEx(cleaned, cv2.MORPH_OPEN, kernel)

    alpha_full = cv2.resize(cleaned, (W, H), interpolation=cv2.INTER_LINEAR)
    blur_k = max(3, int(min(W, H) * 0.003) | 1)
    alpha_full = cv2.GaussianBlur(alpha_full, (blur_k, blur_k), 0)

    rgba_arr = np.dstack([rgb, alpha_full])
    rgba_img = Image.fromarray(rgba_arr, mode="RGBA")

    if trim:
        bbox = rgba_img.split()[-1].getbbox()
        if bbox:
            pad = max(6, int(min(W, H) * 0.015))
            x0 = max(0, bbox[0] - pad)
            y0 = max(0, bbox[1] - pad)
            x1 = min(W, bbox[2] + pad)
            y1 = min(H, bbox[3] + pad)
            rgba_img = rgba_img.crop((x0, y0, x1, y1))

    return rgba_img, True


def parse_crop_box(crop_str):
    """Parse 'x,y,w,h' (normalized 0..1) into tuple of floats."""
    parts = [float(p.strip()) for p in crop_str.split(",")]
    if len(parts) != 4:
        raise ValueError("crop must be 4 comma-separated numbers: x,y,w,h (normalized 0..1)")
    x, y, w, h = parts
    x = max(0.0, min(0.95, x))
    y = max(0.0, min(0.95, y))
    w = max(0.05, min(1.0 - x, w))
    h = max(0.05, min(1.0 - y, h))
    return (x, y, w, h)


def parse_corners(corners_str, img_w, img_h):
    """Parse 'x1,y1,x2,y2,x3,y3,x4,y4' (normalized 0..1 if <= 1.0, else pixels)."""
    vals = [float(p.strip()) for p in corners_str.split(",")]
    if len(vals) != 8:
        raise ValueError("corners must be 8 comma-separated numbers: x1,y1,x2,y2,x3,y3,x4,y4")
    pts = np.array(vals, dtype=np.float32).reshape(4, 2)
    if float(pts.max()) <= 1.05:
        pts[:, 0] *= img_w
        pts[:, 1] *= img_h
    return order_quad(pts)


def crop_normalized(pil_img, box, corner_ratio=0.0):
    w, h = pil_img.size
    x, y, bw, bh = box
    left = int(round(x * w))
    top = int(round(y * h))
    right = max(left + 16, int(round((x + bw) * w)))
    bottom = max(top + 16, int(round((y + bh) * h)))
    cropped = pil_img.crop((left, top, min(w, right), min(h, bottom)))
    if corner_ratio > 0:
        return apply_rounded_alpha(cropped.convert("RGB"), corner_radius_ratio=corner_ratio)
    return cropped.convert("RGBA")


def build_studio_backdrop(width, height, preset=None, bg_image=None, bg_color=None):
    """Create a replacement studio backdrop RGBA image."""
    if bg_image and os.path.exists(bg_image):
        src = ImageOps.exif_transpose(Image.open(bg_image)).convert("RGBA")
        # Cover resize
        sw, sh = src.size
        scale = max(width / float(sw), height / float(sh))
        nw, nh = int(round(sw * scale)), int(round(sh * scale))
        resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
        left = (nw - width) // 2
        top = (nh - height) // 2
        return resized.crop((left, top, left + width, top + height))

    if bg_color:
        col = parse_hex_color(bg_color)
        return Image.new("RGBA", (width, height), (*col, 255))

    cfg = STUDIO_BG_PRESETS.get(preset or "dark-velvet", STUDIO_BG_PRESETS["dark-velvet"])
    if cfg["type"] == "solid":
        return Image.new("RGBA", (width, height), (*cfg["color"], 255))

    inner = cfg["inner"]
    outer = cfg["outer"]
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    cx, cy = width * 0.5, height * 0.44
    rx, ry = width * 0.62, height * 0.55
    d = np.clip(np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2), 0.0, 1.0)
    arr = np.zeros((height, width, 4), dtype=np.uint8)
    for c in range(3):
        arr[:, :, c] = np.clip(inner[c] * (1.0 - d) + outer[c] * d, 0, 255).astype(np.uint8)
    arr[:, :, 3] = 255
    return Image.fromarray(arr, mode="RGBA")


def composite_on_backdrop(cutout_rgba, preset=None, bg_image=None, bg_color=None, pad_ratio=0.10):
    """Composite a transparent cutout onto a replaced studio background with soft drop shadow."""
    cw, ch = cutout_rgba.size
    pad_x = int(round(cw * pad_ratio))
    pad_y = int(round(ch * pad_ratio))
    W = cw + pad_x * 2
    H = ch + pad_y * 2

    canvas = build_studio_backdrop(W, H, preset=preset, bg_image=bg_image, bg_color=bg_color)

    # Soft studio shadow derived from cutout alpha
    alpha = cutout_rgba.split()[-1]
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow_shape = Image.new("RGBA", (cw, ch), (0, 0, 0, 185))
    shadow_shape.putalpha(alpha.point(lambda a: int(a * 0.72)))
    shadow.paste(shadow_shape, (pad_x, pad_y + max(10, int(ch * 0.018))))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(12, int(min(W, H) * 0.028))))

    canvas = Image.alpha_composite(canvas, shadow)
    canvas.paste(cutout_rgba, (pad_x, pad_y), cutout_rgba)
    return canvas


def prepare_image(
    input_path,
    output_path,
    mode="card",
    crop_str=None,
    corners_str=None,
    closeup_region="art",
    card_aspect=None,
    target_width=1000,
    corner_ratio=0.042,
    replace_bg_preset=None,
    replace_bg_image=None,
    replace_bg_color=None,
    use_rmbg=True,
):
    input_path = Path(input_path).resolve()
    output_path = Path(output_path).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not input_path.exists():
        raise FileNotFoundError(f"Input image not found: {input_path}")

    rgb_pil = load_exif_rgb(input_path)
    orig_w, orig_h = rgb_pil.size
    bgr = cv2.cvtColor(np.array(rgb_pil), cv2.COLOR_RGB2BGR)

    strategy = mode
    detected_quad = None
    background_removed = False

    if corners_str:
        quad = parse_corners(corners_str, orig_w, orig_h)
        result_rgba = warp_card_from_quad(
            bgr, quad, card_aspect=card_aspect, target_width=target_width, corner_ratio=corner_ratio
        )
        detected_quad = quad.tolist()
        strategy = "manual_corners"
        background_removed = True

    elif mode == "none":
        result_rgba = rgb_pil.convert("RGBA")
        if crop_str:
            result_rgba = crop_normalized(result_rgba, parse_crop_box(crop_str), corner_ratio=0.0)
            strategy = "crop_only"

    elif mode == "crop":
        box = parse_crop_box(crop_str) if crop_str else (0.0, 0.0, 1.0, 1.0)
        result_rgba = crop_normalized(rgb_pil, box, corner_ratio=corner_ratio if corner_ratio > 0 else 0.0)
        strategy = "crop"

    elif mode == "closeup":
        # Straighten the card first if possible so the artwork window aligns cleanly
        quad, quad_strategy = detect_card_quad(bgr)
        if quad is not None:
            straight_rgba = warp_card_from_quad(
                bgr, quad, card_aspect=card_aspect, target_width=max(target_width, 1200), corner_ratio=0.0
            )
            base_img = straight_rgba.convert("RGB")
            detected_quad = quad.tolist()
            strategy = f"closeup_{quad_strategy}"
            background_removed = True
        else:
            base_img = rgb_pil
            strategy = "closeup_raw"
        box = parse_crop_box(crop_str) if crop_str else CLOSEUP_REGIONS.get(closeup_region, CLOSEUP_REGIONS["art"])
        result_rgba = crop_normalized(base_img, box, corner_ratio=0.025)

    elif mode == "cutout" or mode == "rmbg":
        rmbg_img = None
        if use_rmbg:
            rmbg_img = try_rmbg_sidecar(input_path, output_path) or try_v6_rmbg_module(input_path, output_path)
        if rmbg_img is not None:
            result_rgba = rmbg_img
            strategy = "rmbg_v6"
            background_removed = True
        else:
            result_rgba, ok = grabcut_general_cutout(rgb_pil, trim=True)
            strategy = "grabcut_cutout" if ok else "passthrough"
            background_removed = ok
        if crop_str:
            result_rgba = crop_normalized(result_rgba, parse_crop_box(crop_str), corner_ratio=0.0)

    else:
        # Default "card" mode: detect card edges -> perspective straighten -> clean rounded cutout
        quad, quad_strategy = detect_card_quad(bgr)
        if quad is not None:
            result_rgba = warp_card_from_quad(
                bgr,
                quad,
                card_aspect=card_aspect,
                target_width=target_width,
                corner_ratio=corner_ratio,
            )
            detected_quad = quad.tolist()
            strategy = quad_strategy
            background_removed = True
        else:
            # Safe fallback: general cutout if card quad couldn't be confirmed
            result_rgba, ok = grabcut_general_cutout(rgb_pil, trim=True)
            strategy = "grabcut_fallback" if ok else "passthrough"
            background_removed = ok
        if crop_str:
            result_rgba = crop_normalized(result_rgba, parse_crop_box(crop_str), corner_ratio=0.0)

    # Optional static background replacement
    background_replaced = False
    if replace_bg_preset or replace_bg_image or replace_bg_color:
        result_rgba = composite_on_backdrop(
            result_rgba,
            preset=replace_bg_preset,
            bg_image=replace_bg_image,
            bg_color=replace_bg_color,
        )
        background_replaced = True

    ext = output_path.suffix.lower()
    if ext in (".jpg", ".jpeg"):
        result_rgba.convert("RGB").save(output_path, "JPEG", quality=94)
    else:
        result_rgba.save(output_path, "PNG")

    alpha = np.array(result_rgba.split()[-1])
    fg_pixels = int(np.count_nonzero(alpha > 128))
    total_pixels = int(alpha.size)
    coverage_pct = round((fg_pixels / max(1, total_pixels)) * 100.0, 2)

    return {
        "ok": True,
        "input_path": str(input_path),
        "output_path": str(output_path),
        "mode": mode,
        "strategy": strategy,
        "orig_width": orig_w,
        "orig_height": orig_h,
        "width": result_rgba.size[0],
        "height": result_rgba.size[1],
        "background_removed": background_removed,
        "background_replaced": background_replaced,
        "detected_quad": detected_quad,
        "coverage_pct": coverage_pct,
    }


def main():
    parser = argparse.ArgumentParser(
        description="BossListers local background removal, card cutout, straighten & crop engine"
    )
    parser.add_argument("--input", required=True, help="Input image path")
    parser.add_argument("--output", required=True, help="Output PNG/JPG path")
    parser.add_argument(
        "--mode",
        default="card",
        choices=["card", "cutout", "rmbg", "crop", "closeup", "none"],
        help="Preparation mode (default: card)",
    )
    parser.add_argument("--crop", default=None, help="Normalized crop x,y,w,h (0..1)")
    parser.add_argument("--corners", default=None, help="Manual 4 corners x1,y1,x2,y2,x3,y3,x4,y4")
    parser.add_argument(
        "--region",
        default="art",
        choices=list(CLOSEUP_REGIONS.keys()),
        help="Close-up region for --mode closeup (default: art)",
    )
    parser.add_argument(
        "--card-aspect",
        default=None,
        choices=["standard", "slab", "landscape", "preserve"],
        help="Card aspect ratio target",
    )
    parser.add_argument("--width", type=int, default=1000, help="Target card width (default: 1000)")
    parser.add_argument(
        "--corner-radius",
        type=float,
        default=0.042,
        help="Rounded corner radius ratio (default: 0.042; 0 for square)",
    )
    parser.add_argument(
        "--replace-bg-preset",
        default=None,
        choices=list(STUDIO_BG_PRESETS.keys()),
        help="Optional studio backdrop preset to composite behind cutout",
    )
    parser.add_argument("--replace-bg-image", default=None, help="Optional backdrop image file")
    parser.add_argument("--replace-bg-color", default=None, help="Optional hex color (e.g. #0b1220)")
    parser.add_argument("--no-rmbg", action="store_true", help="Skip external RMBG-1.4 sidecar check")

    args = parser.parse_args()
    aspect = None if args.card_aspect == "standard" else args.card_aspect

    res = prepare_image(
        input_path=args.input,
        output_path=args.output,
        mode=args.mode,
        crop_str=args.crop,
        corners_str=args.corners,
        closeup_region=args.region,
        card_aspect=aspect,
        target_width=args.width,
        corner_ratio=args.corner_radius,
        replace_bg_preset=args.replace_bg_preset,
        replace_bg_image=args.replace_bg_image,
        replace_bg_color=args.replace_bg_color,
        use_rmbg=not args.no_rmbg,
    )
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
