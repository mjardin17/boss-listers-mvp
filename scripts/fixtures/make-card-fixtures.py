#!/usr/bin/env python3
"""
scripts/fixtures/make-card-fixtures.py
Build the synthetic photos the card-crop tests need.

The fixtures are plain generated images (no personal data): a trading card on
a desk, shot slightly off-axis, with and without a hand holding the card.

Usage:
  python scripts/fixtures/make-card-fixtures.py <output-dir>

Writes:
  card-clean.jpg       the card alone on the desk
  card-with-finger.jpg  a hand holding the card over its bottom edge
  card-with-finger-left.jpg  the same hand over the left edge
  card-with-skin-blob.jpg  a skin coloured blob on the card face
"""
import os
import sys

try:
    import cv2
    import numpy as np
except ImportError as e:  # pragma: no cover
    print(f"MISSING_DEPENDENCY {e}. Run: pip install opencv-python-headless numpy pillow", file=sys.stderr)
    sys.exit(3)

PHOTO_W, PHOTO_H = 1200, 1600
CARD_W, CARD_H = 630, 880
# Skin tone of the hand. Kept in the same range a phone photo of a hand gives.
SKIN = (140, 176, 222)  # BGR


def card_face():
    """A synthetic card face. None of the colours are skin coloured."""
    img = np.zeros((CARD_H, CARD_W, 3), np.uint8)
    img[:] = (238, 238, 238)  # white border
    cv2.rectangle(img, (14, 14), (CARD_W - 15, CARD_H - 15), (60, 162, 201), 3)  # gold frame
    cv2.rectangle(img, (24, 24), (CARD_W - 25, 150), (115, 59, 31), -1)  # blue header
    for x in range(40, CARD_W - 40, 26):  # header "text"
        cv2.rectangle(img, (x, 70), (x + 14, 100), (225, 225, 225), -1)
    cv2.rectangle(img, (24, 165), (CARD_W - 25, 620), (77, 163, 63), -1)  # picture: green
    for y in range(180, 610, 30):  # grass strokes
        cv2.line(img, (40, y), (CARD_W - 40, y - 20), (110, 190, 90), 6)
    cv2.ellipse(img, (300, 380), (95, 110), 0, 0, 360, (191, 79, 123), -1)  # purple creature
    cv2.ellipse(img, (300, 300), (60, 45), 0, 0, 360, (120, 190, 90), -1)  # head
    cv2.circle(img, (272, 295), 12, (20, 20, 20), -1)
    cv2.circle(img, (328, 295), 12, (20, 20, 20), -1)
    cv2.rectangle(img, (24, 635), (CARD_W - 25, 760), (245, 245, 245), -1)  # text box
    for y in range(655, 745, 26):
        cv2.rectangle(img, (40, y), (CARD_W - 60 - (y % 60), y + 12), (60, 60, 60), -1)
    cv2.rectangle(img, (24, 775), (CARD_W - 25, 845), (39, 165, 201), -1)  # gold footer
    return img


def desk():
    """Cool grey desk: deliberately not skin coloured."""
    y = np.linspace(0, 1, PHOTO_H, dtype=np.float32)[:, None]
    x = np.linspace(0, 1, PHOTO_W, dtype=np.float32)[None, :]
    base = 70 + 30 * x + 18 * y
    img = np.dstack([base * 0.92, base * 0.97, base * 1.06]).astype(np.uint8)
    rng = np.random.default_rng(11)
    img = np.clip(img.astype(np.int16) + rng.normal(0, 3.0, img.shape).astype(np.int16), 0, 255)
    return img.astype(np.uint8)


def place_card(photo):
    face = card_face()
    src = np.float32([[0, 0], [CARD_W, 0], [CARD_W, CARD_H], [0, CARD_H]])
    dst = np.float32([[250, 330], [930, 290], [975, 1230], [285, 1270]])
    M = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(face, M, (PHOTO_W, PHOTO_H))
    mask = cv2.warpPerspective(np.full((CARD_H, CARD_W), 255, np.uint8), M, (PHOTO_W, PHOTO_H))
    out = photo.copy()
    out[mask > 0] = warped[mask > 0]
    return out, dst


def _blob(mask, out, center, axes, angle, tone):
    m = np.zeros_like(mask)
    cv2.ellipse(m, center, axes, angle, 0, 360, 255, -1)
    out[m > 0] = tone
    return m


def add_hand(photo, dst, side="bottom"):
    """A hand that holds the card: a thumb lies over the card's edge."""
    out = photo.copy()
    mask = np.zeros((PHOTO_H, PHOTO_W), np.uint8)
    tl, tr, br, bl = dst
    if side == "bottom":
        cx = int((bl[0] + br[0]) / 2 + 120)
        edge = int((bl[1] + br[1]) / 2)
        mask |= _blob(mask, out, (cx, edge - 10), (140, 80), -8, SKIN)  # thumb tip on the card
        mask |= _blob(mask, out, (cx + 20, edge + 60), (120, 58), 10, SKIN)  # the hand below the edge
    else:
        cx = int((tl[0] + bl[0]) / 2)
        cy = int((tl[1] + bl[1]) / 2)
        mask |= _blob(mask, out, (cx + 10, cy - 90), (80, 130), 10, SKIN)  # thumb tip on the card
        mask |= _blob(mask, out, (cx - 60, cy - 70), (58, 120), -10, SKIN)
    # soft shading so the hand does not look like a flat sticker
    blur = cv2.GaussianBlur(out, (0, 0), 9)
    shade = cv2.addWeighted(out, 0.84, blur, 0.16, 0)
    out = np.where(mask[:, :, None] > 0, shade, out).astype(np.uint8)
    return out


def finish(photo):
    photo = cv2.GaussianBlur(photo, (0, 0), 0.6)
    rng = np.random.default_rng(3)
    photo = np.clip(photo.astype(np.int16) + rng.normal(0, 2.0, photo.shape).astype(np.int16), 0, 255)
    return photo.astype(np.uint8)


def add_skin_blob(photo):
    """A skin coloured blob in the middle of the card face (no hand attached)."""
    out = photo.copy()
    mask = np.zeros((PHOTO_H, PHOTO_W), np.uint8)
    _blob(mask, out, (600, 700), (90, 70), 12, SKIN)
    blur = cv2.GaussianBlur(out, (0, 0), 7)
    shade = cv2.addWeighted(out, 0.86, blur, 0.14, 0)
    return np.where(mask[:, :, None] > 0, shade, out).astype(np.uint8)


def build(with_hand, side="bottom", blob=False):
    photo = desk()
    photo, dst = place_card(photo)
    if with_hand:
        photo = add_hand(photo, dst, side)
    if blob:
        photo = add_skin_blob(photo)
    return finish(photo)


def build_green_left_thumb():
    """Green card, yellow border, thumb pad across the left edge (~9% area)."""
    photo = desk()
    photo, dst = place_card(photo)
    # Green card field with a bright yellow border, like the real held-card case.
    tl, tr, br, bl = dst.astype(np.int32)
    cv2.line(photo, tuple(tl), tuple(bl), (0, 220, 255), 16)
    center = (int((tl[0] + bl[0]) / 2 + 18), int((tl[1] + bl[1]) / 2))
    thumb = np.zeros((PHOTO_H, PHOTO_W), np.uint8)
    cv2.ellipse(thumb, center, (150, 215), -5, 0, 360, 255, -1)
    shade = cv2.GaussianBlur(photo, (0, 0), 8)
    shaded = cv2.addWeighted(photo, 0.86, shade, 0.14, 0)
    photo[thumb > 0] = SKIN
    # Preserve a natural soft edge without contaminating the card beyond the blob.
    blurred = cv2.GaussianBlur(thumb, (0, 0), 3)
    alpha = (blurred.astype(np.float32) / 255.0)[:, :, None]
    photo = np.clip(photo.astype(np.float32) * alpha + shaded.astype(np.float32) * (1 - alpha), 0, 255).astype(np.uint8)
    return finish(photo)


def main(argv):
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 1
    outdir = argv[1]
    os.makedirs(outdir, exist_ok=True)
    jobs = [
        ("card-clean.jpg", build(False)),
        ("card-with-finger.jpg", build(True, "bottom")),
        ("card-with-finger-left.jpg", build(True, "left")),
        ("card-with-skin-blob.jpg", build(False, blob=True)),
        ("card-green-yellow-left-thumb-9pct.jpg", build_green_left_thumb()),
    ]
    for name, img in jobs:
        path = os.path.join(outdir, name)
        cv2.imwrite(path, img, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
