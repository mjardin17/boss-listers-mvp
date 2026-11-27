#!/usr/bin/env python3
"""
scripts/crop_card.py
Find the trading card in a phone photo and output ONLY the card: flat,
perspective-corrected, 750x1050 (63x88 mm ratio), rounded corners on a
transparent background. Hands, tables and rooms are removed.

Usage:
  python scripts/crop_card.py <input.jpg> <output.png> [--debug overlay.jpg] [--report]

Exit codes:
  0  card found and written
  2  no card-shaped quadrilateral found -> caller must NOT fall back to the raw photo
  3  missing dependency (pip install opencv-python-headless numpy pillow)
  4  a hand/finger is on the card and could not be removed -> retake the photo.
     A crop with skin on it is NEVER handed back: the caller must ask for a
     retake instead of publishing a video with someone's hand in it.

Fingers that overlap the card's edges are found with a skin-colour mask
(YCrCb range AND orange hue in HSV) plus connected components: a skin blob
that reaches across the card's outline is a hand, and the part of it that
covers the card is mapped back into the flattened card. Small edge nubs are
inpainted (cv2.inpaint); bigger intrusions are cut off by cropping inward to
the largest clean rectangle that still holds the card art. Whatever survives
is checked again - if skin is still visible the script exits with code 4.
"""
import json
import sys

try:
    import cv2
    import numpy as np
    from PIL import Image, ImageOps, ImageDraw
except ImportError as e:  # pragma: no cover
    print(f"MISSING_DEPENDENCY {e}. Run: pip install opencv-python-headless numpy pillow", file=sys.stderr)
    sys.exit(3)

CARD_W, CARD_H = 750, 1050
RATIO = CARD_W / CARD_H
CORNER_RADIUS = 36  # ~3 mm at this scale

# ── Skin / finger detection ────────────────────────────────────────────────
# Human skin sits in a narrow YCrCb wedge. The hue cap keeps magenta/purple
# card artwork out of the mask (OpenCV hue is 0-179, skin is 0-30), and the
# Cr/Cb gap keeps warm grey desks and walls out of it: skin is always much
# redder than it is blue. The upper end of that gap keeps gold out - a gold
# card border or a gold frame is even redder than skin is.
SKIN_CR = (133, 178)
SKIN_CB = (77, 127)
SKIN_CR_MINUS_CB = 25
SKIN_CR_MINUS_CB_MAX = 65
# Skin is orange (red well above green), gold and card borders are yellow.
SKIN_ORANGE = 0.35
SKIN_H_MAX = 30
SKIN_S = (40, 195)
SKIN_V_MIN = 50
# Morphology of the skin mask. The opening is what keeps the tan/gold lines of
# card artwork out of the mask - a finger is always a fat blob.
SKIN_OPEN = 7
SKIN_CLOSE = 7
# A finished crop may keep at most this fraction of skin-looking pixels.
MAX_SKIN_FRACTION = 0.004
MAX_EDGE_OVERLAP_FRACTION = 0.15
MAX_EDGE_CROP_LOSS = 0.20
# A skin blob smaller than this (px in card space) is noise, not a finger.
MIN_FINGER_AREA = 100
# A skin blob this big (px in the small photo) is a hand, not card artwork.
MIN_HAND_AREA = 4000
# How forgiving the outline search may be when a hand broke the card's
# outline. The snapped quad still has to be card shaped afterwards.
RELAXED_RATIO = 0.25
RELAXED_FILL = 0.5
# Finger blobs below these limits are inpainted instead of cropped away.
INPAINT_MAX_FRACTION = 0.015
INPAINT_MAX_DEPTH = 0.05
# Cropping away more than this much of the card is not worth it -> retake.
MIN_KEPT_FRACTION = 0.55


def load_bgr(path):
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def order_quad(pts):
    s, d = pts.sum(1), np.diff(pts, axis=1).ravel()
    return np.array([pts[s.argmin()], pts[d.argmin()], pts[s.argmax()], pts[d.argmax()]], np.float32)


def rough_candidates(small, hand=None):
    """Card-shaped quads in `small` coordinates, best first.

    A hand that lies over the card breaks the card's outline: the contour of
    the card runs into the fingers and the detector latches onto the card's
    artwork instead of the card. When that happens the hand is taken out of
    the masks, a rough quad is looked for and its sides are snapped to the
    real card edges.
    """
    masks = _edge_masks(small)
    masks.append(_sat_mask(small))
    area_img = small.shape[0] * small.shape[1]
    out = _quad_candidates(masks, area_img, 0.08, 0.85)
    if not out and hand is not None and hand.any():
        out = _hand_free_candidates(small, masks, area_img, hand)
    return out


def _hand_free_candidates(small, masks, area_img, hand):
    """Find the card when a hand broke its outline.

    The hand is taken out of the masks. The biggest shape that is left is the
    card's outline; its corners are then snapped to the real card edges.
    """
    blocked = cv2.dilate(hand, np.ones((9, 9), np.uint8))
    for m in masks:
        free = cv2.bitwise_and(m, 255 - blocked)
        count, lbl = cv2.connectedComponents(free, connectivity=8)
        if count < 2:
            continue
        sizes = [(int(np.count_nonzero(lbl == i)), i) for i in range(1, count)]
        size, label = max(sizes)
        comp = (lbl == label).astype(np.uint8) * 255
        cnts, _ = cv2.findContours(comp, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        if not cnts:
            continue
        hull = cv2.convexHull(max(cnts, key=cv2.contourArea))
        box = order_quad(cv2.boxPoints(cv2.minAreaRect(hull)).astype(np.float32))
        if _ratio_error(box) > RELAXED_RATIO:
            continue
        snapped = refine_quad(small, box, band_frac=0.06, exclude=blocked)
        if _ratio_error(snapped) < 0.08:
            return [snapped]
    out = []
    free = [cv2.bitwise_and(m, 255 - blocked) for m in masks]
    for q in _quad_candidates(free, area_img, RELAXED_RATIO, RELAXED_FILL)[:6]:
        snapped = refine_quad(small, q, band_frac=0.06, exclude=blocked)
        if _ratio_error(snapped) < 0.08:
            out.append(snapped)
            break
    return out


def _edge_masks(small):
    gray = cv2.bilateralFilter(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), 9, 50, 50)
    return [cv2.dilate(cv2.Canny(gray, lo, hi), np.ones((3, 3)), iterations=2)
            for lo, hi in ((30, 90), (50, 150), (75, 200))]


def _sat_mask(small):
    sat = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)[:, :, 1]
    sat = cv2.threshold(sat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    return cv2.morphologyEx(sat, cv2.MORPH_CLOSE, np.ones((15, 15)), iterations=2)


def _ratio_error(q):
    wq = (np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2
    hq = (np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2
    if wq <= 0 or hq <= 0:
        return 1.0
    return abs(min(wq, hq) / max(wq, hq) - RATIO)


def _quad_candidates(masks, area_img, max_ratio_err, min_fill):
    out = []
    for m in masks:
        cnts, _ = cv2.findContours(m, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        for c in cnts:
            a = cv2.contourArea(c)
            if not (0.08 * area_img < a < 0.97 * area_img):
                continue
            hull = cv2.convexHull(c)
            peri = cv2.arcLength(hull, True)
            quad = None
            for eps in (0.01, 0.02, 0.03, 0.05):
                ap = cv2.approxPolyDP(hull, eps * peri, True)
                if len(ap) == 4:
                    quad = ap.reshape(4, 2).astype(np.float32)
                    break
            if quad is None:
                quad = cv2.boxPoints(cv2.minAreaRect(hull)).astype(np.float32)
            q = order_quad(quad)
            ratio_err = _ratio_error(q)
            qa = cv2.contourArea(q)
            if qa > 0 and ratio_err < max_ratio_err and a / qa > min_fill:
                out.append((a / area_img - 2 * ratio_err, q))
    return [q for _, q in sorted(out, key=lambda t: -t[0])]


def _ransac_line(pts, iters=400, tol=2.5):
    rng = np.random.default_rng(0)
    n = len(pts)
    if n < 20:
        return None
    best = None
    for _ in range(iters):
        i, j = rng.choice(n, 2, replace=False)
        d = pts[j] - pts[i]
        L = np.hypot(*d)
        if L < 20:
            continue
        nrm = np.array([-d[1], d[0]]) / L
        inl = np.abs((pts - pts[i]) @ nrm) < tol
        if best is None or inl.sum() > best.sum():
            best = inl
    if best is None or best.sum() < 20:
        return None
    vx, vy, x0, y0 = cv2.fitLine(pts[best].astype(np.float32), cv2.DIST_L2, 0, 0.01, 0.01).ravel()
    return np.array([x0, y0]), np.array([vx, vy])


def _intersect(l1, l2):
    (p, d), (q, e) = l1, l2
    t = np.linalg.solve(np.array([d, -e]).T, q - p)
    return p + t[0] * d


def refine_quad(small, quad, band_frac=0.06, exclude=None):
    """Fit each side to real edge pixels so occluders (fingers) don't drag the crop."""
    gray = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    ys, xs = np.nonzero(cv2.Canny(gray, 40, 120))
    if exclude is not None:
        keep = exclude[ys, xs] == 0
        ys, xs = ys[keep], xs[keep]
    P = np.stack([xs, ys], 1).astype(np.float64)
    band = band_frac * max(np.ptp(quad[:, 0]), np.ptp(quad[:, 1]))
    lines = []
    for k in range(4):
        a, b = quad[k].astype(np.float64), quad[(k + 1) % 4].astype(np.float64)
        L = np.hypot(*(b - a))
        u = (b - a) / L
        nrm = np.array([-u[1], u[0]])
        t, s = (P - a) @ u, (P - a) @ nrm
        fit = _ransac_line(P[(np.abs(s) < band) & (t > 0.05 * L) & (t < 0.95 * L)])
        if fit is None or abs(np.dot(fit[1] / np.linalg.norm(fit[1]), u)) < 0.97:
            lines.append((a, u))
        else:
            lines.append(fit)
    return order_quad(np.array([_intersect(lines[k - 1], lines[k]) for k in range(4)], np.float32))


# ── Skin ────────────────────────────────────────────────────────────────────

def skin_mask(bgr):
    """Pixels that look like human skin: YCrCb range AND orange hue in HSV.

    Both tests must agree, so card artwork (greens, blues, purples, golds)
    does not trip the mask. Only the orange side of the hue circle is used,
    which keeps magenta/purple artwork out of the way.
    """
    ycrcb = cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb)
    cr = ycrcb[:, :, 1]
    cb = ycrcb[:, :, 2]
    gap = cr.astype(np.int16) - cb.astype(np.int16)
    ycc = ((cr >= SKIN_CR[0]) & (cr <= SKIN_CR[1]) &
           (cb >= SKIN_CB[0]) & (cb <= SKIN_CB[1]) &
           (gap >= SKIN_CR_MINUS_CB) & (gap <= SKIN_CR_MINUS_CB_MAX)).astype(np.uint8) * 255
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    hsv_ok = ((h <= SKIN_H_MAX) &
              (s >= SKIN_S[0]) & (s <= SKIN_S[1]) &
              (v >= SKIN_V_MIN)).astype(np.uint8) * 255
    b = bgr[:, :, 0].astype(np.float32)
    g = bgr[:, :, 1].astype(np.float32)
    r = bgr[:, :, 2].astype(np.float32)
    orange = ((r - g) / np.maximum(r - b, 1.0)) >= SKIN_ORANGE
    mask = cv2.bitwise_and(cv2.bitwise_and(ycc, hsv_ok), orange.astype(np.uint8) * 255)
    # The opening drops hair-thin "skin" lines: card borders and artwork edges
    # are often tan/gold and read as skin, but a finger is always a fat blob.
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((SKIN_OPEN, SKIN_OPEN), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((SKIN_CLOSE, SKIN_CLOSE), np.uint8))
    return mask


def _border_mask(shape):
    border = np.zeros(shape, np.uint8)
    border[0, :] = 255
    border[-1, :] = 255
    border[:, 0] = 255
    border[:, -1] = 255
    return border


def residual_skin(card_bgr):
    """(skin pixels, skin pixels on the card border) of a flattened card."""
    skin = skin_mask(card_bgr)
    total = int(np.count_nonzero(skin))
    border_px = 0
    count, lbl = cv2.connectedComponents(skin, connectivity=8)
    if count > 1:
        border = _border_mask(skin.shape)
        for i in range(1, count):
            comp = lbl == i
            if (comp & (border > 0)).any():
                border_px += int(np.count_nonzero(comp))
    return total, border_px


SOLID_BLOB_MIN_AREA = 2000
SOLID_BLOB_MIN_SOLIDITY = 0.85


def solid_interior_skin(card_bgr):
    """Pixels of compact, solid skin blobs that do not touch the card edge.

    A fingertip is a rounded solid blob (solidity near 1). Skin-coloured card
    artwork such as grass or trim is ragged (solidity well below 0.85).
    """
    skin = skin_mask(card_bgr)
    border = _border_mask(skin.shape)
    contours, _ = cv2.findContours(skin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    total = 0
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < SOLID_BLOB_MIN_AREA:
            continue
        hull = cv2.contourArea(cv2.convexHull(cnt))
        if hull <= 0 or area / hull < SOLID_BLOB_MIN_SOLIDITY:
            continue
        comp = np.zeros(skin.shape, np.uint8)
        cv2.drawContours(comp, [cnt], -1, 255, -1)
        if (comp & border).any():
            continue  # edge skin is already counted as a finger
        total += int(area)
    return total


# ── Finger mask ─────────────────────────────────────────────────────────────

def hand_from_skin(skin):
    """The skin blobs that are big enough to be a hand."""
    count, lbl = cv2.connectedComponents(skin, connectivity=8)
    hand = np.zeros(skin.shape, np.uint8)
    for i in range(1, count):
        if int(np.count_nonzero(lbl == i)) >= MIN_HAND_AREA:
            hand |= (lbl == i).astype(np.uint8) * 255
    return hand


def finger_mask(small, quad_small, M, scale, card_size, skin=None):
    """Map the skin of a hand that reaches over the card into card space.

    A skin blob in the photo that has pixels on the card AND pixels off the
    card is a hand holding the card: the part on the card is the finger.
    Skin that ends up on the border of the flattened card is a hand too.
    """
    tw, th = card_size
    if skin is None:
        skin = skin_mask(small)
    count, lbl = cv2.connectedComponents(skin, connectivity=8)
    poly = np.zeros(small.shape[:2], np.uint8)
    cv2.fillPoly(poly, [quad_small.astype(np.int32)], 255)
    poly_grown = cv2.dilate(poly, np.ones((9, 9), np.uint8))
    reach = np.zeros(small.shape[:2], np.uint8)
    for i in range(1, count):
        comp = lbl == i
        if int(np.count_nonzero(comp)) < MIN_FINGER_AREA:
            continue
        on_card = comp & (poly_grown > 0)
        off_card = comp & (poly_grown == 0)
        if on_card.any() and off_card.any():
            reach |= on_card.astype(np.uint8) * 255
    # small coords -> card coords (the quad was scaled down with the photo)
    m_small = M @ np.diag([1.0 / scale, 1.0 / scale, 1.0]).astype(np.float32)
    finger = cv2.warpPerspective(reach, m_small, (tw, th), flags=cv2.INTER_NEAREST)
    skin_card = cv2.warpPerspective(skin, m_small, (tw, th), flags=cv2.INTER_NEAREST)
    count2, lbl2 = cv2.connectedComponents(skin_card, connectivity=8)
    if count2 > 1:
        border = _border_mask(skin_card.shape)
        for i in range(1, count2):
            comp = lbl2 == i
            if int(np.count_nonzero(comp)) < MIN_FINGER_AREA:
                continue
            if (comp & (border > 0)).any():
                finger |= comp.astype(np.uint8) * 255
    return finger


# ── Removing the fingers ────────────────────────────────────────────────────

def largest_clean_rect(w, h, mask):
    """Largest axis-aligned rectangle inside the card that holds no mask pixel.

    Returns (x0, y0, x1, y1) with x1/y1 exclusive, or None if the mask eats
    the whole card.
    """
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return (0, 0, w, h)
    dist = np.vstack([xs, ys, w - 1 - xs, h - 1 - ys]).astype(np.float64)
    nearest = np.argmin(dist, axis=0)
    insets = [0, 0, 0, 0]  # left, top, right, bottom
    for side in range(4):
        sel = nearest == side
        if sel.any():
            insets[side] = int(dist[side][sel].max()) + 1
    for _ in range(64):
        x0, y0 = insets[0], insets[1]
        x1, y1 = w - insets[2], h - insets[3]
        if x1 <= x0 or y1 <= y0:
            return None
        inside = mask[y0:y1, x0:x1]
        if not inside.any():
            break
        ys2, xs2 = np.nonzero(inside)
        ys2 = ys2 + y0
        xs2 = xs2 + x0
        need = [int(xs2.max()) + 1, int(ys2.max()) + 1, int(w - xs2.min()), int(h - ys2.min())]
        dims = [w, h, w, h]
        cost = [(max(0, need[s] - insets[s]) / float(dims[s])) for s in range(4)]
        side = int(np.argmin(cost))
        insets[side] = need[side]
    x0, y0 = insets[0], insets[1]
    x1, y1 = w - insets[2], h - insets[3]
    if x1 <= x0 or y1 <= y0:
        return None
    if mask[y0:y1, x0:x1].any():
        return None
    return (x0, y0, x1, y1)


def remove_fingers(card_bgr, finger):
    """Take the fingers off the flattened card.

    Small edge nubs are inpainted so the whole card survives. A bigger
    intrusion is cut off: the card is cropped inward to the largest clean
    rectangle that still holds the art. Returns (card, info); card is None
    when the hand covers so much that the card is not worth publishing.
    """
    h, w = finger.shape[:2]
    # The projective warp can fragment a thumb at the card boundary. Recover
    # edge-connected skin in card coordinates before deciding whether it is safe.
    edge_skin = np.zeros((h, w), np.uint8)
    skin = skin_mask(card_bgr)
    n, labels = cv2.connectedComponents(skin, connectivity=8)
    border = _border_mask(skin.shape) > 0
    for label in range(1, n):
        component = labels == label
        if (component & border).any():
            edge_skin[component] = 255
    finger = cv2.bitwise_or(finger, edge_skin)
    count = int(np.count_nonzero(finger))
    frac = count / float(w * h)
    info = {"finger_pixels": count, "finger_fraction": round(frac, 6), "action": "none"}
    if count == 0:
        return card_bgr, info
    if frac > MAX_EDGE_OVERLAP_FRACTION:
        info["action"] = "failed"
        info["kept_fraction"] = round(1.0 - frac, 4)
        return None, info
    mask = cv2.dilate(finger, np.ones((9, 9), np.uint8))
    ys, xs = np.nonzero(mask)
    # How deep the finger reaches into the card, measured per side: a pixel
    # belongs to the side it is closest to.
    dist = np.vstack([xs, ys, w - 1 - xs, h - 1 - ys]).astype(np.float64)
    nearest = np.argmin(dist, axis=0)
    dims = [w, h, w, h]
    depths = []
    for side in range(4):
        sel = nearest == side
        if sel.any():
            depths.append((int(dist[side][sel].max()) + 1) / float(dims[side]))
    depth = max(depths) if depths else 0.0
    info["finger_depth"] = round(depth, 6)
    if frac <= INPAINT_MAX_FRACTION and max(depths) <= INPAINT_MAX_DEPTH:
        out = cv2.inpaint(card_bgr, mask, 6, cv2.INPAINT_TELEA)
        skin_px, border_px = residual_skin(out)
        if skin_px == 0 or skin_px <= MAX_SKIN_FRACTION * w * h:
            info["action"] = "inpaint"
            return out, info
    rect = largest_clean_rect(w, h, mask)
    if rect is None:
        info["action"] = "failed"
        return None, info
    x0, y0, x1, y1 = rect
    kept = float((x1 - x0) * (y1 - y0)) / float(w * h)
    info["kept_fraction"] = round(kept, 4)
    if kept < MIN_KEPT_FRACTION:
        info["action"] = "failed"
        return None, info
    info["action"] = "crop"
    out = card_bgr[y0:y1, x0:x1].copy()
    residual = mask[y0:y1, x0:x1]
    if residual.any():
        out = cv2.inpaint(out, residual, 6, cv2.INPAINT_TELEA)
    return out, info


# ── Card crop ───────────────────────────────────────────────────────────────

def crop_card(src_path):
    """Return (flat card, finger mask, debug info) or (None, None, None)."""
    img = load_bgr(src_path)
    scale = 1000 / max(img.shape[:2])
    small = cv2.resize(img, None, fx=scale, fy=scale)
    skin = skin_mask(small)
    hand = hand_from_skin(skin)
    cands = rough_candidates(small, hand)
    if not cands:
        return None, None, None
    quad_small = refine_quad(small, cands[0])
    quad = quad_small / scale
    wq = np.linalg.norm(quad[1] - quad[0])
    hq = np.linalg.norm(quad[3] - quad[0])
    landscape = wq > hq
    tw, th = (CARD_H, CARD_W) if landscape else (CARD_W, CARD_H)
    M = cv2.getPerspectiveTransform(np.asarray(quad, np.float32),
                                    np.float32([[0, 0], [tw, 0], [tw, th], [0, th]]))
    card = cv2.warpPerspective(img, M, (tw, th), flags=cv2.INTER_CUBIC)
    finger = finger_mask(small, quad_small, M, scale, (tw, th), skin)
    if landscape:
        card = cv2.rotate(card, cv2.ROTATE_90_CLOCKWISE)
        finger = cv2.rotate(finger, cv2.ROTATE_90_CLOCKWISE)
    return card, finger, (img, quad)


def to_rounded_png(card_bgr):
    """Flat card on a transparent 750x1050 canvas with rounded corners.

    A card that had to be cropped is fitted onto the canvas with its
    proportions intact instead of being stretched.
    """
    card = Image.fromarray(cv2.cvtColor(card_bgr, cv2.COLOR_BGR2RGB)).convert("RGBA")
    scale = min(CARD_W / float(card.size[0]), CARD_H / float(card.size[1]))
    new = (max(1, round(card.size[0] * scale)), max(1, round(card.size[1] * scale)))
    if new != card.size:
        card = card.resize(new, Image.LANCZOS)
    canvas = Image.new("RGBA", (CARD_W, CARD_H), (0, 0, 0, 0))
    off = ((CARD_W - new[0]) // 2, (CARD_H - new[1]) // 2)
    canvas.paste(card, off, card)
    mask = Image.new("L", (CARD_W, CARD_H), 0)
    radius = max(1, round(CORNER_RADIUS * scale))
    ImageDraw.Draw(mask).rounded_rectangle(
        [off[0], off[1], off[0] + new[0] - 1, off[1] + new[1] - 1], radius, fill=255)
    canvas.putalpha(mask)
    return canvas


def main(argv):
    if len(argv) < 3:
        print(__doc__, file=sys.stderr)
        return 1
    src, dst = argv[1], argv[2]
    debug_path = None
    report = False
    rest = argv[3:]
    i = 0
    while i < len(rest):
        if rest[i] == "--debug" and i + 1 < len(rest):
            debug_path = rest[i + 1]
            i += 2
        elif rest[i] == "--report":
            report = True
            i += 1
        else:
            i += 1
    card, finger, dbg = crop_card(src)
    if card is None:
        print(f"NO_CARD_FOUND {src}", file=sys.stderr)
        return 2
    out, info = remove_fingers(card, finger)
    if out is None:
        print(
            f"HAND_ON_CARD {src} a hand covers too much of the card "
            f"(kept_fraction={info.get('kept_fraction')}). "
            f"Retake the photo with the card flat on a plain surface, no fingers on it.",
            file=sys.stderr)
        return 4
    skin_px, border_px = residual_skin(out)
    # Skin touching the card edge is a finger. In the middle, only a solid rounded
    # blob counts as skin: ragged skin-coloured artwork (tan grass, gold trim) does not.
    frac = (border_px + solid_interior_skin(out)) / float(out.shape[0] * out.shape[1])
    info.update({
        "source": src,
        "output": dst,
        "card_size": [int(out.shape[1]), int(out.shape[0])],
        "skin_pixels": skin_px,
        "skin_border_pixels": border_px,
        "skin_fraction": round(frac, 6),
    })
    if frac > MAX_SKIN_FRACTION:
        print(
            f"HAND_ON_CARD {src} skin is still on the card "
            f"(skin_fraction={frac:.4f}). "
            f"Retake the photo with the card flat on a plain surface, no fingers on it.",
            file=sys.stderr)
        return 4
    to_rounded_png(out).save(dst, optimize=True)
    if debug_path:
        img, quad = dbg
        cv2.polylines(img, [quad.astype(int)], True, (0, 255, 0), 8)
        cv2.imwrite(debug_path, img)
    print(f"OK {dst}")
    if report:
        print(json.dumps(info))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
