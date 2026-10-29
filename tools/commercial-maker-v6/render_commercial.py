#!/usr/bin/env python3
"""
render_commercial.py — The commercial maker: product in, finished commercial out.

Reads a mission JSON (from lib/commercial_generator.py, via
tools/bosslister_commercial_feeder.py) and renders a vertical 1080x1920
H.264 MP4 with 5 scenes, AI narration, and a music bed:

    python render_commercial.py --script mission.json --out commercial.mp4

Mission JSON may be the mission itself (has "render_script") or a full
MISSION_BOARD.json (uses first pending commercial mission).
"""

import argparse
import io
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

from tts import synthesize, wav_duration

W, H, FPS = 1080, 1920, 30
SR = 44100

ASPECTS = {"9:16": (1080, 1920), "1:1": (1080, 1080)}


def Y(v):
    """Scale a 9:16 y-coordinate to the current aspect height."""
    return int(v * H / 1920)


def FS(v):
    """Scale a 9:16 font size to the current aspect height."""
    return max(10, int(v * H / 1920))


def ffmpeg_bin():
    """System ffmpeg if present, else the imageio-ffmpeg bundled binary."""
    from shutil import which
    found = which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as e:
        raise SystemExit(
            "ffmpeg not found and imageio-ffmpeg isn't installed "
            f"({e}). pip install imageio-ffmpeg") from e


FFMPEG = None  # resolved in main()

NAVY = (11, 16, 38)
PURPLE = (43, 27, 77)
GOLD = (232, 182, 76)
WHITE = (255, 255, 255)
SOFT = (200, 205, 225)

FONT_DIR = "/usr/share/fonts/truetype/dejavu"


def load_font(size, bold=True):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    p = os.path.join(FONT_DIR, name)
    try:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
        p2 = os.path.join(FONT_DIR, "DejaVuSans.ttf")
        if os.path.exists(p2):
            return ImageFont.truetype(p2, size)
    except Exception:
        pass
    # last resort (minimal containers): bitmap default
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


# ─── image helpers ────────────────────────────────────────────────────────────

def resolve_image(ref, workdir):
    """Local path or http(s) URL -> local file path."""
    if not ref:
        return None
    ref = str(ref)
    if ref.startswith("http://") or ref.startswith("https://"):
        dest = os.path.join(workdir, "product.jpg")
        try:
            req = urllib.request.Request(ref, headers={"User-Agent": "commercial-maker/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r, open(dest, "wb") as f:
                shutil.copyfileobj(r, f)
            return dest
        except Exception as e:
            print(f"  [img] download failed ({e}), using placeholder")
            return None
    p = Path(ref)
    return str(p) if p.exists() else None


def cover(img, w, h):
    """Resize/crop image to cover w x h."""
    iw, ih = img.size
    scale = max(w / iw, h / ih)
    img = img.resize((int(iw * scale) + 1, int(ih * scale) + 1), Image.LANCZOS)
    x = (img.width - w) // 2
    y = (img.height - h) // 2
    return img.crop((x, y, x + w, y + h))


def kenburns_frame(img, progress, zoom_from=1.0, zoom_to=1.15, pan=(0.5, 0.3)):
    """One Ken Burns frame: crop window shrinks/grows with zoom, slides with pan."""
    zoom = zoom_from + (zoom_to - zoom_from) * progress
    ww = min(int(W / zoom), img.width)
    hh = min(int(H / zoom), img.height)
    max_x = img.width - ww
    max_y = img.height - hh
    x = int(max_x * (0.5 + (pan[0] - 0.5) * progress))
    y = int(max_y * (0.5 + (pan[1] - 0.5) * progress))
    x = min(max(x, 0), max_x)
    y = min(max(y, 0), max_y)
    return img.crop((x, y, x + ww, y + hh)).resize((W, H), Image.LANCZOS)


def prepare_kenburns(img_path):
    img = Image.open(img_path).convert("RGB")
    return cover(img, int(W * 1.05), int(H * 1.05))


def gradient_bg(c1=NAVY, c2=PURPLE):
    """Vertical gradient base frame."""
    arr = np.zeros((H, W, 3), dtype=np.float32)
    t = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    top = np.array(c1, dtype=np.float32)[None, None, :]
    bot = np.array(c2, dtype=np.float32)[None, None, :]
    arr[:] = top * (1 - t) + bot * t
    return Image.fromarray(arr.astype(np.uint8))


def dark_bottom(img, strength=0.75):
    """Darken lower third for caption legibility."""
    arr = np.asarray(img).astype(np.float32)
    h = arr.shape[0]
    t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    mask = np.clip((t - 0.45) / 0.55, 0, 1) * strength
    arr *= (1 - mask)
    return Image.fromarray(arr.astype(np.uint8))


def wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for wd in words:
        trial = (cur + " " + wd).strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = wd
    if cur:
        lines.append(cur)
    return lines


def centered(draw, cx, y, text, font, fill):
    draw.text((cx, y), text, font=font, fill=fill, anchor="ma")


def fit_font(draw, text, start_size, max_w, bold=True):
    size = start_size
    while size > 20:
        f = load_font(size, bold)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 4
    return load_font(20, bold)


# ─── ads4now-style scene design: AI background + product card + bold captions ───

BG_DIR = Path(__file__).parent / "assets" / "backgrounds"
BG_OVERRIDE = None  # set from --bg-dir: per-product graded backgrounds
SCENE_BG = {
    "title": "bg-hook.jpg",
    "showcase": "bg-showcase.jpg",
    "description": "bg-features.jpg",
    "price_cta": "bg-cta.jpg",
    "product_loop": "bg-proof.jpg",
}


def load_bg(scene_name):
    base = BG_OVERRIDE or BG_DIR
    # v6 diffusion scenes land as scene-<name>.jpg; legacy graded
    # backgrounds keep the old names. Prefer the diffusion scene.
    candidates = [f"scene-{scene_name}.jpg", SCENE_BG.get(scene_name, "")]
    for cand in candidates:
        if not cand:
            continue
        p = base / cand
        try:
            if p.exists():
                return cover(Image.open(p).convert("RGB"),
                             int(W * 1.1), int(H * 1.1))
        except Exception as e:
            print(f"  [bg] {p.name} failed ({e})")
    return None


def make_card(img_path, size=700):
    """Product photo as a rounded polaroid-style card (RGBA)."""
    img = Image.open(img_path).convert("RGB")
    iw, ih = img.size
    s = size / max(iw, ih)
    img = img.resize((int(iw * s), int(ih * s)), Image.LANCZOS)
    pad = 28
    cw, ch = size + pad * 2, size + pad * 2
    card = Image.new("RGB", (cw, ch), (246, 246, 248))
    card.paste(img, ((cw - img.width) // 2, (ch - img.height) // 2))
    mask = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw, ch], radius=56, fill=255)
    card.putalpha(mask)
    return card


def paste_card(frame, card, cx, cy):
    frame = frame.convert("RGBA")
    x, y = cx - card.width // 2, cy - card.height // 2
    sh = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [x + 16, y + 22, x + card.width + 16, y + card.height + 22],
        radius=56, fill=(0, 0, 0, 120))
    sh = sh.filter(ImageFilter.GaussianBlur(22))
    frame = Image.alpha_composite(frame, sh)
    frame.alpha_composite(card, (x, y))
    return frame.convert("RGB")


def load_cutout(path, size=760):
    """Background-removed product PNG (RGBA) scaled to fit."""
    img = Image.open(path).convert("RGBA")
    iw, ih = img.size
    s = size / max(iw, ih)
    return img.resize((int(iw * s), int(ih * s)), Image.LANCZOS)


def paste_cutout(frame, cutout, cx, cy):
    """Paste a cutout with a soft shadow shaped to the product's alpha."""
    frame = frame.convert("RGBA")
    x, y = cx - cutout.width // 2, cy - cutout.height // 2
    alpha = cutout.split()[3]
    sh = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    blob = Image.new("RGBA", cutout.size, (0, 0, 0, 130))
    blob.putalpha(alpha)
    blob = blob.filter(ImageFilter.GaussianBlur(26))
    sh.alpha_composite(blob, (x + 14, y + 26))
    frame = Image.alpha_composite(frame, sh)
    frame.alpha_composite(cutout, (x, y))
    return frame.convert("RGB")


def stroked(d, cx, y, text, font, fill, sw=3):
    d.text((cx, y), text, font=font, fill=fill, anchor="ma",
           stroke_width=sw, stroke_fill=(0, 0, 0))


def ov_title(img, scene, product):
    d = ImageDraw.Draw(img)
    stroked(d, W // 2, Y(430), "BOSS LISTERS", load_font(FS(54)), GOLD, 2)
    d.line([(W // 2 - 120, Y(510)), (W // 2 + 120, Y(510))], fill=GOLD, width=4)
    name = product["name"]
    font = fit_font(d, name if len(name) < 40 else name[:40], FS(104), W - 140)
    lines = wrap(d, name, font, W - 140)
    y = Y(650)
    for ln in lines[:3]:
        stroked(d, W // 2, y, ln, font, WHITE)
        y += int(font.size * 1.22)
    sub = scene.get("subhead", "")
    if sub:
        stroked(d, W // 2, y + Y(30), sub, load_font(FS(46), bold=False), SOFT, 2)
    return img


def ov_showcase(img, scene, product):
    d = ImageDraw.Draw(img)
    cap = scene.get("caption", "")
    if cap:
        font = load_font(FS(68))
        lines = wrap(d, cap.upper(), font, W - 120)
        y = Y(170)
        for ln in lines[:3]:
            stroked(d, W // 2, y, ln, font, WHITE)
            y += FS(82)
        d.line([(W // 2 - 90, y + 8), (W // 2 + 90, y + 8)], fill=GOLD, width=5)
    return img


def ov_description(img, scene, product):
    d = ImageDraw.Draw(img)
    stroked(d, W // 2, Y(150), "WHY YOU'LL LOVE IT", load_font(FS(60)), WHITE)
    font = load_font(FS(48), bold=False)
    lines = wrap(d, product["description"], font, W - 280)
    while len(lines) > 14 and font.size > FS(28):
        font = load_font(font.size - max(2, FS(4)), bold=False)
        lines = wrap(d, product["description"], font, W - 280)
    lines = lines[:14]
    line_h = int(font.size * 1.5)
    top, bottom = Y(300), Y(300) + Y(90) + len(lines) * line_h + Y(80)
    d.rounded_rectangle([70, top, W - 70, bottom], radius=40, fill=(10, 12, 28))
    d.rounded_rectangle([70, top, W - 70, bottom], radius=40, outline=GOLD, width=4)
    y = top + Y(90)
    for ln in lines:
        centered(d, W // 2, y, ln, font, WHITE)
        y += line_h
    return img


def ov_price(img, scene, product):
    d = ImageDraw.Draw(img)
    stroked(d, W // 2, Y(600), product["price_text"], load_font(FS(150)), GOLD)
    stroked(d, W // 2, Y(820), scene.get("store_text", ""),
            load_font(FS(46), bold=False), WHITE, 2)
    bw, bh = FS(620), FS(160)
    x0, y0 = (W - bw) // 2, Y(980)
    d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=FS(80), fill=GOLD)
    centered(d, W // 2, y0 + FS(42), scene.get("cta_text", "SHOP NOW"),
             load_font(FS(68)), NAVY)
    return img


def ov_loop(img, scene, product):
    img = dark_bottom(img, 0.55)
    d = ImageDraw.Draw(img)
    stroked(d, W // 2, Y(170), "BOSS LISTERS", load_font(FS(58)), WHITE, 2)
    tag = scene.get("tagline", "")
    if tag:
        font = fit_font(d, tag, FS(46), W - 120, bold=False)
        stroked(d, W // 2, H - Y(220), tag, font, GOLD, 2)
    quote = scene.get("proof_quote", "")
    if quote:
        qfont = fit_font(d, f'"{quote}"', FS(34), W - 160, bold=False)
        qlines = wrap(d, f'"{quote}"', qfont, W - 160)
        y = H - Y(420)
        for ln in qlines[:2]:
            stroked(d, W // 2, y, ln, qfont, WHITE, 2)
            y += int(qfont.size * 1.3)
    return img


OVERLAYS = {
    "title": ov_title,
    "showcase": ov_showcase,
    "description": ov_description,
    "price_cta": ov_price,
    "product_loop": ov_loop,
}


# ─── audio ────────────────────────────────────────────────────────────────────

def synth_music(duration):
    """Upbeat 4-chord loop: pads + bass + hats + kick. Returns float32 mono @ SR."""
    n = int(duration * SR)
    t = np.arange(n) / SR
    # C - G - Am - F, 2 beats each at 120bpm -> 4s per loop
    chords = [
        [261.63, 329.63, 392.00],  # C
        [196.00, 246.94, 392.00],  # G
        [220.00, 261.63, 329.63],  # Am
        [174.61, 220.00, 349.23],  # F
    ]
    beat = 0.5  # 120 bpm
    out = np.zeros(n, dtype=np.float64)
    chord_len = beat * 2
    idx = 0
    ci = 0
    while idx < n:
        cl = min(int(chord_len * SR), n - idx)
        seg = np.arange(cl) / SR
        env = np.minimum(1, seg / 0.05) * np.minimum(1, (chord_len - seg) / 0.3)
        for f in chords[ci % 4]:
            out[idx:idx + cl] += 0.10 * np.sin(2 * np.pi * f * seg) * env
            out[idx:idx + cl] += 0.03 * np.sin(2 * np.pi * f * 2 * seg) * env
        # bass root
        root = chords[ci % 4][0] / 2
        out[idx:idx + cl] += 0.16 * np.sin(2 * np.pi * root * seg) * np.minimum(1, seg / 0.02)
        # kick on beats
        for b in range(2):
            k0 = int(b * beat * SR)
            kl = int(0.12 * SR)
            if idx + k0 + kl < n:
                ks = np.arange(kl) / SR
                out[idx + k0:idx + k0 + kl] += 0.35 * np.sin(2 * np.pi * (120 - 80 * ks / 0.12) * ks) * np.exp(-ks * 30)
        # hats on 8ths
        for e in range(4):
            h0 = int(e * beat / 2 * SR)
            hl = int(0.04 * SR)
            if idx + h0 + hl < n:
                out[idx + h0:idx + h0 + hl] += 0.05 * np.random.randn(hl) * np.exp(-np.arange(hl) / (0.008 * SR))
        idx += cl
        ci += 1
    # master fade in/out + gentle limit
    fi, fo = int(1.0 * SR), int(3.0 * SR)
    out[:fi] *= np.linspace(0, 1, fi)
    out[-fo:] *= np.linspace(1, 0, fo)
    peak = np.max(np.abs(out)) or 1.0
    return (out / peak * 0.5).astype(np.float32)


def place_clip(mix, clip, at_sec):
    s = int(at_sec * SR)
    e = min(len(mix), s + len(clip))
    if s < len(mix) and e > s:
        mix[s:e] += clip[:e - s]


def duck_music(music, duck_ranges, duck_to=0.25):
    """Lower music volume during narration ranges [(start, end)]."""
    env = np.ones(len(music), dtype=np.float32)
    for a, b in duck_ranges:
        s, e = int(a * SR), int(b * SR)
        r = int(0.4 * SR)
        s0, e0 = max(0, s - r), min(len(music), e + r)
        env[s0:e0] = duck_to
        # smooth edges
        if s - s0 > 0:
            env[s0:s] = np.linspace(1, duck_to, s - s0)
        if e0 - e > 0:
            env[e:e0] = np.linspace(duck_to, 1, e0 - e)
    return music * env


# ─── render ───────────────────────────────────────────────────────────────────

def load_mission(path):
    data = json.load(open(path))
    if "render_script" in data:
        return data
    for m in data.get("missions", []):
        if m.get("type") == "commercial" and m.get("status") in ("pending", "queued"):
            return m
    raise SystemExit("No pending commercial mission found in " + path)


def main():
    ap = argparse.ArgumentParser(description="Commercial maker: product in, MP4 out")
    ap.add_argument("--script", required=True, help="mission JSON file")
    ap.add_argument("--out", required=True, help="output MP4 path")
    ap.add_argument("--voice", default="af_heart", help="TTS voice")
    ap.add_argument("--no-music", action="store_true")
    ap.add_argument("--bg-dir", default=None,
                    help="override background directory (product-graded backgrounds)")
    ap.add_argument("--cutout", default=None,
                    help="background-removed product PNG (RGBA); overrides the card")
    ap.add_argument("--aspect", default="9:16", choices=list(ASPECTS),
                    help="output aspect ratio (default 9:16)")
    args = ap.parse_args()
    global BG_OVERRIDE, W, H, FFMPEG
    W, H = ASPECTS[args.aspect]
    FFMPEG = ffmpeg_bin()
    if args.bg_dir:
        BG_OVERRIDE = Path(args.bg_dir)

    mission = load_mission(args.script)
    rs = mission["render_script"]
    product = mission["product"]
    scenes = rs["scenes"]
    print(f"[maker] {mission['id']} — {product['name']} ({product['price_text']})")

    workdir = tempfile.mkdtemp(prefix="commercial_")
    img_path = resolve_image((product.get("images") or [None])[0], workdir)
    kb_img = prepare_kenburns(img_path) if img_path else None

    # narration first (durations may stretch scenes to fit)
    tts_files = {}
    for sc in scenes:
        nar = sc.get("narration")
        if nar:
            wav = os.path.join(workdir, f"narr_{sc['id']}.wav")
            print(f"  [tts] scene {sc['id']}: {nar[:60]}...")
            synthesize(nar, wav, args.voice)
            dur = wav_duration(wav)
            tts_files[sc["id"]] = (wav, dur)
            need = dur + 1.2
            if sc["duration"] < need:
                print(f"  [tts] stretching scene {sc['id']} {sc['duration']:.1f}s -> {need:.1f}s to fit narration")
                sc["duration"] = need

    # per-scene assets: AI background + product card (or background-removed cutout)
    bg_imgs = {sc["name"]: load_bg(sc["name"]) for sc in scenes}
    cutout_src = args.cutout or (mission.get("product") or {}).get("cutout")
    cutout = None
    # asset sizes scale with frame height so 1:1 layouts don't collide
    ascale = H / 1920
    if cutout_src and Path(cutout_src).exists():
        try:
            cutout = load_cutout(cutout_src, int(760 * ascale))
            cutout_small = load_cutout(cutout_src, int(420 * ascale))
            print(f"  [cutout] using background-removed product")
        except Exception as e:
            print(f"  [cutout] failed ({e}); falling back to card")
            cutout = None
    card = make_card(img_path, int(700 * ascale)) if img_path else None
    card_small = make_card(img_path, int(380 * ascale)) if img_path else None
    if cutout is not None:
        card_geom = {  # scene name -> (kind, asset, cx, cy)
            "showcase": ("cutout", cutout, W // 2, Y(1100)),
            "price_cta": ("cutout", cutout_small, W // 2, Y(280)),
            "product_loop": ("cutout", cutout, W // 2, Y(950)),
        }
    else:
        card_geom = {  # scene name -> (kind, asset, cx, cy)
            "showcase": ("card", card, W // 2, Y(1100)),
            "price_cta": ("card", card_small, W // 2, Y(280)),
            "product_loop": ("card", card, W // 2, Y(950)),
        }

    # encode video via frame pipe
    total_dur = sum(sc["duration"] for sc in scenes)
    total_frames = int(total_dur * FPS)
    print(f"  [vid] {total_dur:.1f}s, {total_frames} frames @ {W}x{H}")
    ff = subprocess.Popen(
        [FFMPEG, "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
         "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium",
         "-movflags", "+faststart", os.path.join(workdir, "silent.mp4")],
        stdin=subprocess.PIPE,
    )
    XFADE = int(0.4 * FPS)
    t = 0.0
    prev_final = None
    for i, sc in enumerate(scenes):
        nframes = int(sc["duration"] * FPS)
        bg = bg_imgs.get(sc["name"])
        overlay = OVERLAYS.get(sc["name"], ov_showcase)
        geom = card_geom.get(sc["name"])
        for f in range(nframes):
            prog = f / max(nframes - 1, 1)
            if bg is not None:
                frame = kenburns_frame(bg, prog, zoom_from=1.0, zoom_to=1.09,
                                       pan=(0.5, 0.35))
            else:
                frame = gradient_bg()
                if nframes > 1:  # gentle push-in fallback
                    z = 1.0 + 0.03 * prog
                    cw, ch = int(W / z), int(H / z)
                    x, y = (W - cw) // 2, (H - ch) // 2
                    frame = frame.crop((x, y, x + cw, y + ch)).resize((W, H), Image.LANCZOS)
            if geom and geom[1] is not None:
                kind, asset, cx, cy = geom
                frame = (paste_cutout(frame, asset, cx, cy) if kind == "cutout"
                         else paste_card(frame, asset, cx, cy))
            frame = overlay(frame, sc, product)
            if i > 0 and f < XFADE and prev_final is not None:
                frame = Image.blend(prev_final, frame, f / XFADE)
            ff.stdin.write(frame.tobytes())
        prev_final = frame
        t += sc["duration"]
        print(f"  [vid] scene {sc['id']} '{sc['name']}' done")
    ff.stdin.close()
    ff.wait()
    if ff.returncode != 0:
        raise SystemExit("ffmpeg video encode failed")

    # audio mix
    total_n = int(total_dur * SR)
    mix = np.zeros(total_n, dtype=np.float32)
    duck_ranges = []
    t = 0.0
    for sc in scenes:
        if sc["id"] in tts_files:
            wav, dur = tts_files[sc["id"]]
            pcm = subprocess.run(
                [FFMPEG, "-v", "error", "-i", wav, "-ar", str(SR), "-ac", "1",
                 "-f", "f32le", "-"], capture_output=True, check=True).stdout
            clip = np.frombuffer(pcm, dtype=np.float32)
            at = t + 0.5
            place_clip(mix, clip, at)
            duck_ranges.append((at, at + dur + 0.4))
        t += sc["duration"]
    music = synth_music(total_dur) if not args.no_music else np.zeros(total_n, dtype=np.float32)
    music = duck_music(music, duck_ranges)
    mix = mix + music[: len(mix)]
    peak = np.max(np.abs(mix)) or 1.0
    mix = (mix / peak * 0.92).astype(np.float32)

    wav_mix = os.path.join(workdir, "mix.wav")
    subprocess.run(
        [FFMPEG, "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1",
         "-i", "-", "-c:a", "pcm_s16le", wav_mix],
        input=mix.tobytes(), check=True,
    )
    subprocess.run(
        [FFMPEG, "-y", "-v", "error", "-i", os.path.join(workdir, "silent.mp4"),
         "-i", wav_mix, "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
         "-shortest", args.out],
        check=True,
    )
    print(f"[maker] DONE -> {args.out}")
    shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    main()
