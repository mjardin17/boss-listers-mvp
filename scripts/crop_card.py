#!/usr/bin/env python3
"""
scripts/crop_card.py
Find the trading card in a phone photo and output ONLY the card: flat,
perspective-corrected, 750x1050 (63x88 mm ratio), rounded corners on a
transparent background. Hands, tables and rooms are removed.

Usage:
  python scripts/crop_card.py <input.jpg> <output.png> [--debug overlay.jpg]

Exit codes:
  0  card found and written
  2  no card-shaped quadrilateral found -> caller must NOT fall back to the raw photo
  3  missing dependency (pip install opencv-python-headless numpy pillow)

Known limit: anything physically covering the card's face (e.g. a thumb on the
border) stays in the crop. Photograph cards flat on a plain surface for a clean result.
"""
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


def load_bgr(path):
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)


def order_quad(pts):
    s, d = pts.sum(1), np.diff(pts, axis=1).ravel()
    return np.array([pts[s.argmin()], pts[d.argmin()], pts[s.argmax()], pts[d.argmax()]], np.float32)


def rough_candidates(small):
    """Card-shaped quads in `small` coordinates, best first."""
    gray = cv2.bilateralFilter(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), 9, 50, 50)
    masks = [cv2.dilate(cv2.Canny(gray, lo, hi), np.ones((3, 3)), iterations=2)
             for lo, hi in ((30, 90), (50, 150), (75, 200))]
    sat = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)[:, :, 1]
    sat = cv2.threshold(sat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    masks.append(cv2.morphologyEx(sat, cv2.MORPH_CLOSE, np.ones((15, 15)), iterations=2))
    area_img = small.shape[0] * small.shape[1]
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
            wq = (np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2
            hq = (np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2
            ratio_err = abs(min(wq, hq) / max(wq, hq) - RATIO)
            qa = cv2.contourArea(q)
            if qa > 0 and ratio_err < 0.08 and a / qa > 0.85:
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


def refine_quad(small, quad, band_frac=0.06):
    """Fit each side to real edge pixels so occluders (fingers) don't drag the crop."""
    gray = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    ys, xs = np.nonzero(cv2.Canny(gray, 40, 120))
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


def crop_card(src_path):
    img = load_bgr(src_path)
    scale = 1000 / max(img.shape[:2])
    small = cv2.resize(img, None, fx=scale, fy=scale)
    cands = rough_candidates(small)
    if not cands:
        return None, None
    quad = refine_quad(small, cands[0]) / scale
    wq = np.linalg.norm(quad[1] - quad[0])
    hq = np.linalg.norm(quad[3] - quad[0])
    landscape = wq > hq
    tw, th = (CARD_H, CARD_W) if landscape else (CARD_W, CARD_H)
    M = cv2.getPerspectiveTransform(quad, np.float32([[0, 0], [tw, 0], [tw, th], [0, th]]))
    card = cv2.warpPerspective(img, M, (tw, th), flags=cv2.INTER_CUBIC)
    if landscape:
        card = cv2.rotate(card, cv2.ROTATE_90_CLOCKWISE)
    return card, (img, quad)


def to_rounded_png(card_bgr):
    rgba = Image.fromarray(cv2.cvtColor(card_bgr, cv2.COLOR_BGR2RGB)).convert("RGBA")
    mask = Image.new("L", rgba.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, rgba.size[0] - 1, rgba.size[1] - 1], CORNER_RADIUS, fill=255)
    rgba.putalpha(mask)
    return rgba


def main(argv):
    if len(argv) < 3:
        print(__doc__, file=sys.stderr)
        return 1
    src, dst = argv[1], argv[2]
    card, dbg = crop_card(src)
    if card is None:
        print(f"NO_CARD_FOUND {src}", file=sys.stderr)
        return 2
    to_rounded_png(card).save(dst, optimize=True)
    if len(argv) >= 5 and argv[3] == "--debug":
        img, quad = dbg
        cv2.polylines(img, [quad.astype(int)], True, (0, 255, 0), 8)
        cv2.imwrite(argv[4], img)
    print(f"OK {dst}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
