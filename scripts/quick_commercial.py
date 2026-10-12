#!/usr/bin/env python3
"""
scripts/quick_commercial.py
Free, local 15s product commercial from ONE listing photo: no background removal, no paid APIs.

Look: a blurred, darkened copy of the product photo as backdrop, the real photo large and centered with a
soft shadow, slow zoom, big readable text, and a Kokoro voiceover (local TTS).
Four 3.75s beats: hook -> detail -> price -> call to action.

Usage:
  python scripts/quick_commercial.py --title "..." --price 19.99 --image-url https://i.ebayimg.com/.../s-l140.jpg \
      --condition "New" --out-dir out/commercials [--platform tiktok|instagram|facebook]
"""
import argparse
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

FFMPEG = os.environ.get("FFMPEG_PATH", r"C:\Users\jjard\claude\viral-engine\ffmpeg_bin\ffmpeg.exe")
FONT = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "arialbd.ttf")
GOLD = (255, 215, 90)
BEAT_SECONDS = 3.75
FPS = 24
SIZES = {"tiktok": (1080, 1920, "Shop now on TikTok Shop"),
         "instagram": (1080, 1920, "Tap to shop"),
         "facebook": (1080, 1080, "Shop now")}


def upgrade_ebay_url(url):
    """eBay thumbnails (s-l140) exist at s-l1600; other URLs pass through."""
    if re.search(r"i\.ebayimg\.com/.*/s-l\d+\.", url or ""):
        return re.sub(r"/s-l\d+\.", "/s-l1600.", url)
    return url


def load_image(url=None, path=None):
    if path:
        return Image.open(path).convert("RGB")
    req = urllib.request.Request(upgrade_ebay_url(url), headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")


def short_title(title, limit=48):
    title = re.sub(r"\s+", " ", re.sub(r"\b(brand new|new with tags|nwt|nib|nwot)\b[\s,-]*", "", title, flags=re.I)).strip(" -,")
    if len(title) <= limit:
        return title
    cut = title[:limit].rsplit(" ", 1)[0]
    return cut


def wrap(draw, text, font, max_w):
    lines, line = [], ""
    for word in text.split():
        test = f"{line} {word}".strip()
        if draw.textlength(test, font=font) <= max_w:
            line = test
        else:
            if line:
                lines.append(line)
            line = word
    return lines + ([line] if line else [])


def draw_text(canvas, text, y, size, color="white", max_w=None):
    w = canvas.width
    d = ImageDraw.Draw(canvas)
    font = ImageFont.truetype(FONT, size)
    for line in wrap(d, text, font, max_w or int(w * 0.88)):
        x = (w - d.textlength(line, font=font)) / 2
        d.text((x + 3, y + 4), line, font=font, fill=(0, 0, 0))
        d.text((x, y), line, font=font, fill=color)
        y += int(size * 1.22)
    return y


def backdrop(im, w, h):
    scale = max(w / im.width, h / im.height)
    bg = im.resize((int(im.width * scale) + 1, int(im.height * scale) + 1)).filter(ImageFilter.GaussianBlur(45))
    left, top = (bg.width - w) // 2, (bg.height - h) // 2
    bg = bg.crop((left, top, left + w, top + h))
    return Image.blend(bg, Image.new("RGB", (w, h), (8, 12, 24)), 0.62)


def place_product(canvas, im, top, max_w, max_h):
    scale = min(max_w / im.width, max_h / im.height)
    pic = im.resize((int(im.width * scale), int(im.height * scale)))
    x, y = (canvas.width - pic.width) // 2, top
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((x + 8, y + 26, x + pic.width + 8, y + pic.height + 26), 36, fill=(0, 0, 0, 170))
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    canvas.paste(shadow, (0, 0), shadow)
    mask = Image.new("L", pic.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, pic.width, pic.height), 32, fill=255)
    canvas.paste(pic, (x, y), mask)
    return y + pic.height


def build_beats(im, product, platform):
    w, h, cta = SIZES[platform]
    title = short_title(product["title"])
    price = product.get("price")
    price_txt = f"${float(price):,.2f}" if price not in (None, "") else None
    cond = (product.get("condition") or "").replace("_", " ").title()
    cond = None if cond.lower() in ("", "unknown") else cond
    s = h / 1920.0
    pic_h = int(h * 0.52)
    beats = []

    c = backdrop(im, w, h)
    y = draw_text(c, title, int(150 * s), int(78 * s))
    place_product(c, im, int(max(y + 40 * s, 520 * s)), int(w * 0.9), pic_h)
    beats.append((c, f"{title}."))

    c = backdrop(im, w, h)
    y = draw_text(c, "Condition: " + cond if cond else "In stock now", int(170 * s), int(70 * s), GOLD)
    end = place_product(c, im, int(max(y + 50 * s, 440 * s)), int(w * 0.9), pic_h)
    draw_text(c, "Real photos. Fast shipping.", end + int(70 * s), int(54 * s))
    beats.append((c, ("It's " + cond.lower() + ". " if cond else "") + "Ready to ship fast."))

    c = backdrop(im, w, h)
    y = draw_text(c, price_txt or "Great price", int(150 * s), int(120 * s), GOLD)
    place_product(c, im, int(max(y + 40 * s, 460 * s)), int(w * 0.9), pic_h)
    beats.append((c, (f"Just {price_txt.replace('$', '').replace('.', ' ')} dollars." if price_txt else "A great price.")))

    c = backdrop(im, w, h)
    end = place_product(c, im, int(300 * s), int(w * 0.85), int(h * 0.42))
    y = draw_text(c, "Grab it today", end + int(90 * s), int(96 * s))
    draw_text(c, cta, y + int(20 * s), int(58 * s), GOLD)
    beats.append((c, "Grab it today before it's gone."))
    return beats


def make_voice(lines, pipeline_fn):
    """One 3.75s slot per beat, padded or trimmed, 24 kHz mono."""
    sr = 24000
    slot = int(BEAT_SECONDS * sr)
    parts = []
    for text in lines:
        arr = np.asarray(pipeline_fn(text), dtype=np.float32)
        parts.append(np.pad(arr[:slot], (0, max(0, slot - len(arr[:slot])))))
    return np.concatenate(parts), sr


def render(product, out_dir, platform="tiktok", speech=None, tag=None):
    w, h, _ = SIZES[platform]
    im = load_image(product.get("image_url"), product.get("image_path"))
    beats = build_beats(im, product, platform)
    work = tempfile.mkdtemp(prefix="qc_")
    try:
        segs = []
        for i, (frame, _) in enumerate(beats):
            png, seg = os.path.join(work, f"b{i}.png"), os.path.join(work, f"s{i}.mp4")
            frame.save(png)
            zoom = "min(zoom+0.0006,1.07)" if i % 2 == 0 else "if(eq(on,1),1.07,max(zoom-0.0006,1.0))"
            subprocess.run([FFMPEG, "-loglevel", "error", "-y", "-loop", "1", "-i", png, "-vf",
                            f"zoompan=z='{zoom}':d=90:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s={w}x{h}:fps={FPS},format=yuv420p",
                            "-t", str(BEAT_SECONDS), "-c:v", "libx264", "-crf", "18", seg], check=True)
            segs.append(seg)
        with open(os.path.join(work, "list.txt"), "w") as f:
            f.writelines(f"file '{s}'\n".replace("\\", "/") for s in segs)
        silent = os.path.join(work, "silent.mp4")
        subprocess.run([FFMPEG, "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i",
                        os.path.join(work, "list.txt"), "-c", "copy", silent], check=True)
        os.makedirs(out_dir, exist_ok=True)
        name = tag or re.sub(r"[^a-z0-9]+", "-", product["title"].lower())[:40].strip("-")
        out = os.path.join(out_dir, f"{name}_{platform}.mp4")
        if speech is not None:
            wav = os.path.join(work, "voice.wav")
            audio, sr = make_voice([t for _, t in beats], speech)
            sf.write(wav, audio, sr)
            subprocess.run([FFMPEG, "-loglevel", "error", "-y", "-i", silent, "-i", wav, "-c:v", "copy",
                            "-c:a", "aac", "-b:a", "160k", "-shortest", out], check=True)
        else:
            shutil.copy(silent, out)
        return out
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--title", required=True)
    ap.add_argument("--price")
    ap.add_argument("--condition")
    ap.add_argument("--image-url")
    ap.add_argument("--image-path")
    ap.add_argument("--platform", default="tiktok", choices=list(SIZES))
    ap.add_argument("--out-dir", default="out/commercials")
    ap.add_argument("--no-voice", action="store_true")
    a = ap.parse_args()
    speech = None
    if not a.no_voice:
        from scripts.voice_music_factory import generate_speech_array
        speech = generate_speech_array
    print(render({"title": a.title, "price": a.price, "condition": a.condition,
                  "image_url": a.image_url, "image_path": a.image_path}, a.out_dir, a.platform, speech))


if __name__ == "__main__":
    main()
