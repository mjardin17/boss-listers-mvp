#!/usr/bin/env python3
"""
BossListers Commercial Cutter Engine
Generates verified 15s, 24fps, H.264 commercial videos for TikTok (9:16), Instagram (9:16), and Facebook (1:1).
Enforces strict 4-beat structure, Ken Burns drift motion, clean floating white text with shadow (no boxes/panels/pills),
and a 6-point verification gate.
"""

import os
import sys
import json
import math
import shutil
import tempfile
import subprocess
from PIL import Image, ImageDraw, ImageFont

FFMPEG_PATH = r"C:\Users\jjard\claude\viral-engine\ffmpeg_bin\ffmpeg.exe"
FFPROBE_PATH = r"C:\Users\jjard\claude\viral-engine\ffmpeg_bin\ffprobe.exe"
FONT_PATH = os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts", "arialbd.ttf")
DEFAULT_MUSIC_PROMPT = "upbeat cheerful commercial background music, no vocals"

TOTAL_FRAMES = 360  # 15.0s at 24fps
FPS = 24
BEAT_FRAMES = 90    # 3.75s per beat

PLATFORM_SPECS = {
    "tiktok": {
        "width": 1080,
        "height": 1920,
        "aspect": "9:16",
        "cta": "Shop now on TikTok Shop",
        "suffix": "_tiktok_9_16.mp4"
    },
    "instagram": {
        "width": 1080,
        "height": 1920,
        "aspect": "9:16",
        "cta": "Shop now on Instagram",
        "suffix": "_instagram_9_16.mp4"
    },
    "facebook": {
        "width": 1080,
        "height": 1080,
        "aspect": "1:1",
        "cta": "Find it on Facebook Marketplace",
        "suffix": "_facebook_1_1.mp4"
    }
}


def draw_floating_text(draw, text, pos, font, fill=(255, 255, 255), shadow_color=(0, 0, 0), shadow_offsets=None):
    """
    Renders clean floating white text with deep drop shadow.
    STRICT RULE: NO boxes, panels, or pills behind text, ever.
    """
    x, y = pos
    if shadow_offsets is None:
        shadow_offsets = [(4, 4), (4, -4), (-4, 4), (-4, -4), (0, 5), (5, 0), (0, -5), (-5, 0), (6, 6)]
    # Rich drop shadow for floating separation
    for ox, oy in shadow_offsets:
        draw.text((x + ox, y + oy), text, font=font, fill=shadow_color, anchor="mm")
    # Crisp white text
    draw.text((x, y), text, font=font, fill=fill, anchor="mm")


def load_turntable_frames(gif_path, max_frames=30):
    """Extracts turntable frames as RGBA Pillow images."""
    frames = []
    if not gif_path or not os.path.exists(gif_path):
        return frames
    try:
        im = Image.open(gif_path)
        step = max(1, im.n_frames // max_frames)
        for i in range(0, im.n_frames, step):
            im.seek(i)
            frame = im.convert("RGBA")
            frames.append(frame.copy())
            if len(frames) >= max_frames:
                break
    except Exception as e:
        print(f"Warning loading turntable GIF: {e}", file=sys.stderr)
    return frames


def render_commercial_video(platform_key, title, brand, condition, price, free_shipping, stills, turntable_path, output_path):
    """
    Renders a single 15.0s, 24fps, H.264 commercial for a specific platform using clean frame sequences.
    """
    spec = PLATFORM_SPECS[platform_key]
    W, H = spec["width"], spec["height"]
    cta_text = spec["cta"]

    # Fonts sized proportionally
    title_font_size = int(W * 0.056)
    sub_font_size = int(W * 0.044)
    price_font_size = int(W * 0.092)
    cta_font_size = int(W * 0.050)

    try:
        font_title = ImageFont.truetype(FONT_PATH, title_font_size)
        font_sub = ImageFont.truetype(FONT_PATH, sub_font_size)
        font_price = ImageFont.truetype(FONT_PATH, price_font_size)
        font_cta = ImageFont.truetype(FONT_PATH, cta_font_size)
    except Exception:
        font_title = ImageFont.load_default()
        font_sub = ImageFont.load_default()
        font_price = ImageFont.load_default()
        font_cta = ImageFont.load_default()

    # Load stills
    loaded_stills = []
    for s_path in stills:
        if os.path.exists(s_path):
            try:
                loaded_stills.append(Image.open(s_path).convert("RGBA"))
            except Exception as e:
                print(f"Warning loading still {s_path}: {e}", file=sys.stderr)
    
    if not loaded_stills:
        raise ValueError(f"No valid stills found to render commercial. Provided: {stills}")

    tt_frames = load_turntable_frames(turntable_path) if turntable_path else []

    still_beat1 = loaded_stills[0]
    still_beat2 = loaded_stills[1 % len(loaded_stills)]
    still_beat3 = loaded_stills[2 % len(loaded_stills)]
    still_beat4 = loaded_stills[0]

    # Pre-render studio gradient background
    bg_grad = Image.new("RGB", (W, H))
    bg_draw = ImageDraw.Draw(bg_grad)
    for y in range(H):
        ratio = y / float(H)
        r = int(22 - ratio * 13)
        g = int(28 - ratio * 16)
        b = int(36 - ratio * 20)
        bg_draw.line([(0, y), (W, y)], fill=(r, g, b))

    # Working temp directory for frames
    temp_dir = tempfile.mkdtemp(prefix=f"comm_{platform_key}_")

    try:
        for f_idx in range(TOTAL_FRAMES):
            beat_idx = f_idx // BEAT_FRAMES      # 0, 1, 2, 3
            beat_prog = (f_idx % BEAT_FRAMES) / float(BEAT_FRAMES) # 0.0 to 1.0

            frame = bg_grad.copy()
            draw = ImageDraw.Draw(frame)

            # Ken Burns drift and asset selection per beat
            if beat_idx == 0:
                current_still = still_beat1
                zoom = 1.00 + 0.08 * beat_prog
                pan_x = 0
                pan_y = int(-12 * beat_prog)
            elif beat_idx == 1:
                if tt_frames:
                    tt_idx = int(beat_prog * len(tt_frames)) % len(tt_frames)
                    current_still = tt_frames[tt_idx]
                    zoom = 1.04
                    pan_x = 0
                    pan_y = 0
                else:
                    current_still = still_beat2
                    zoom = 1.08 - 0.06 * beat_prog
                    pan_x = int(12 * math.sin(beat_prog * math.pi))
                    pan_y = 0
            elif beat_idx == 2:
                current_still = still_beat3
                zoom = 1.02 + 0.08 * beat_prog
                pan_x = int(-12 * math.sin(beat_prog * math.pi))
                pan_y = int(8 * beat_prog)
            else: # Beat 4
                current_still = still_beat4
                zoom = 1.05 + 0.04 * math.sin(beat_prog * math.pi)
                pan_x = 0
                pan_y = int(-8 * beat_prog)

            # Product sizing & placement
            stage_y = int(H * 0.52)
            max_prod_h = int(H * 0.44 * zoom)
            prod_aspect = current_still.width / float(current_still.height)
            target_w = int(max_prod_h * prod_aspect)
            target_h = max_prod_h

            if target_w > int(W * 0.85):
                target_w = int(W * 0.85)
                target_h = int(target_w / prod_aspect)

            resized_prod = current_still.resize((target_w, target_h), Image.Resampling.BILINEAR)

            # Soft contact drop shadow under product
            shadow_w = int(target_w * 0.65)
            shadow_h = int(H * 0.025)
            shadow_x = (W // 2 + pan_x) - shadow_w // 2
            shadow_y = stage_y + target_h // 2 - 12 + pan_y
            draw.ellipse([shadow_x, shadow_y, shadow_x + shadow_w, shadow_y + shadow_h], fill=(5, 7, 10))

            # Composite product
            paste_x = (W // 2 + pan_x) - target_w // 2
            paste_y = stage_y - target_h // 2 + pan_y
            frame.paste(resized_prod, (paste_x, paste_y), resized_prod)

            # Typography: STRICT CLEAN FLOATING WHITE WITH SHADOW (NO BOXES, PANELS, OR PILLS)
            text_y_top = int(H * 0.16)
            text_y_bottom = int(H * 0.84)

            if beat_idx == 0:
                # Beat 1: Title
                words = title.split()
                lines = []
                curr_line = []
                for w in words:
                    curr_line.append(w)
                    test_str = " ".join(curr_line)
                    bbox = draw.textbbox((0, 0), test_str, font=font_title)
                    if (bbox[2] - bbox[0]) > int(W * 0.85):
                        if len(curr_line) > 1:
                            curr_line.pop()
                            lines.append(" ".join(curr_line))
                            curr_line = [w]
                        else:
                            lines.append(test_str)
                            curr_line = []
                if curr_line:
                    lines.append(" ".join(curr_line))

                line_spacing = int(title_font_size * 1.30)
                start_y = text_y_top - (len(lines) - 1) * (line_spacing // 2)
                for i, line in enumerate(lines[:3]):
                    draw_floating_text(draw, line, (W // 2, start_y + i * line_spacing), font_title)

            elif beat_idx == 1:
                # Beat 2: Brand + Condition
                brand_display = brand.upper() if brand else "EXCLUSIVE DROP"
                cond_display = f"Condition: {condition.capitalize()}" if condition else "Brand New"
                draw_floating_text(draw, brand_display, (W // 2, text_y_top - int(sub_font_size * 0.7)), font_title)
                draw_floating_text(draw, cond_display, (W // 2, text_y_top + int(sub_font_size * 0.8)), font_sub)

            elif beat_idx == 2:
                # Beat 3: Price + "Free shipping" (ONLY IF flag is true)
                price_str = f"${float(price):.2f}"
                draw_floating_text(draw, price_str, (W // 2, text_y_top), font_price)
                if free_shipping:
                    draw_floating_text(draw, "FREE SHIPPING", (W // 2, text_y_top + int(price_font_size * 0.8)), font_sub)

            elif beat_idx == 3:
                # Beat 4: Platform CTA
                draw_floating_text(draw, cta_text, (W // 2, text_y_bottom), font_cta)

            frame_file = os.path.join(temp_dir, f"frame_{f_idx:04d}.jpg")
            frame.save(frame_file, quality=95)
            del frame

        # Encode frame sequence to MP4 with FFmpeg
        cmd = [
            FFMPEG_PATH,
            "-y",
            "-framerate", str(FPS),
            "-i", os.path.join(temp_dir, "frame_%04d.jpg"),
            "-c:v", "libx264",
            "-threads", "1",
            "-x264-params", "rc-lookahead=0:sync-lookahead=0:ref=1:bframes=0",
            "-pix_fmt", "yuv420p",
            "-preset", "fast",
            "-crf", "18",
            "-r", str(FPS),
            "-t", "15",
            output_path
        ]

        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg failed (code {res.returncode}): {res.stderr[-500:]}")

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


MUSIC_GEN_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "music_gen.py")


def generate_music_bed(prompt=DEFAULT_MUSIC_PROMPT, duration=15, out_wav_path=None, force_regenerate=False):
    """
    Generates a 15-second background music bed using local MusicGen inference via scripts/music_gen.py.
    Runs 100% locally on this PC (no API calls, no tokens required).
    """
    if not os.path.exists(MUSIC_GEN_SCRIPT):
        print(f"[music_gen] [ERROR] Could not locate {MUSIC_GEN_SCRIPT} — skipping music step.", file=sys.stderr)
        return None

    if not out_wav_path:
        out_wav_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "music", "commercial_bed_15s.wav")

    # Use existing bed if present and not force regenerating
    if not force_regenerate and os.path.exists(out_wav_path) and os.path.getsize(out_wav_path) > 100000:
        print(f"[music_gen] [OK] Using existing local music bed: {out_wav_path} ({os.path.getsize(out_wav_path)} bytes)")
        return out_wav_path

    cmd = [
        sys.executable,
        MUSIC_GEN_SCRIPT,
        "--prompt", prompt,
        "--duration", str(duration),
        "--out", out_wav_path,
    ]

    print(f"[music_gen] Calling local {MUSIC_GEN_SCRIPT} for {duration}s music bed...")
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode == 0 and os.path.exists(out_wav_path) and os.path.getsize(out_wav_path) > 1000:
        print(f"[music_gen] [OK] Successfully generated local music bed: {out_wav_path} ({os.path.getsize(out_wav_path)} bytes)")
        return out_wav_path
    else:
        err_detail = res.stderr.strip() or res.stdout.strip()
        print(f"[music_gen] [WARN] Local MusicGen generation failed (code {res.returncode}): {err_detail} — skipping music step.", file=sys.stderr)
        return None


def mix_audio_bed(video_path, audio_path, peak_db="-20dB"):
    """
    Mixes background audio bed under video with FFmpeg.
    Peaks the audio bed around -20dB to leave headroom for voiceover.
    """
    if not audio_path or not os.path.exists(audio_path):
        return False

    temp_out = video_path + ".tmp_mix.mp4"
    cmd = [
        FFMPEG_PATH,
        "-y",
        "-i", video_path,
        "-i", audio_path,
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-af", f"volume={peak_db}",
        "-shortest",
        temp_out
    ]

    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode == 0 and os.path.exists(temp_out) and os.path.getsize(temp_out) > 0:
        os.replace(temp_out, video_path)
        print(f"[audio_mix] [OK] Mixed audio bed into {video_path} peaked at {peak_db}")
        return True
    else:
        if os.path.exists(temp_out):
            os.remove(temp_out)
        print(f"[audio_mix] [WARN] Failed mixing audio: {res.stderr[-300:]}", file=sys.stderr)
        return False


def verify_commercial(mp4_path, expected_w, expected_h):
    """
    Verification Gate:
    1. File exists and size > 0
    2. Duration 15s ±0.5s
    3. Exact resolution (1080x1920 or 1080x1080)
    4. Exact 24fps
    5. H.264 codec
    6. Clean full decode (ffmpeg -v error -i <path> -f null - returns 0)
    All must pass or cut FAILS, no file kept.
    """
    checks = {
        "file_exists_non_zero": False,
        "duration_15s": False,
        "exact_resolution": False,
        "fps_24": False,
        "codec_h264": False,
        "clean_full_decode": False,
    }
    details = {}

    # Check 1: File exists and size > 0
    if not os.path.exists(mp4_path):
        details["file_exists_non_zero"] = "File does not exist"
        return False, checks, details
    
    file_size = os.path.getsize(mp4_path)
    if file_size <= 0:
        details["file_exists_non_zero"] = "File is empty (0 bytes)"
        os.remove(mp4_path)
        return False, checks, details
    checks["file_exists_non_zero"] = True
    details["file_size_bytes"] = file_size

    # ffprobe metadata check
    probe_cmd = [
        FFPROBE_PATH,
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        mp4_path
    ]
    try:
        res = subprocess.run(probe_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        meta = json.loads(res.stdout)
    except Exception as e:
        details["probe_error"] = str(e)
        os.remove(mp4_path)
        return False, checks, details

    video_stream = None
    for s in meta.get("streams", []):
        if s.get("codec_type") == "video":
            video_stream = s
            break

    if not video_stream:
        details["error"] = "No video stream found"
        os.remove(mp4_path)
        return False, checks, details

    # Check 2: Duration 15s ±0.5s
    dur_val = float(meta.get("format", {}).get("duration", video_stream.get("duration", 0)))
    details["duration"] = round(dur_val, 3)
    if 14.5 <= dur_val <= 15.5:
        checks["duration_15s"] = True
    else:
        details["duration_error"] = f"Duration {dur_val}s outside 14.5s-15.5s tolerance"

    # Check 3: Exact resolution
    w = int(video_stream.get("width", 0))
    h = int(video_stream.get("height", 0))
    details["resolution"] = f"{w}x{h}"
    if w == expected_w and h == expected_h:
        checks["exact_resolution"] = True
    else:
        details["resolution_error"] = f"Expected {expected_w}x{expected_h}, got {w}x{h}"

    # Check 4: Exact 24fps
    r_frame_rate = video_stream.get("r_frame_rate", "0/1")
    avg_frame_rate = video_stream.get("avg_frame_rate", "0/1")
    fps_val = None
    for rate_str in [r_frame_rate, avg_frame_rate]:
        if "/" in rate_str:
            num, den = rate_str.split("/")
            if float(den) > 0:
                fps_val = float(num) / float(den)
                break
    details["fps"] = round(fps_val, 2) if fps_val else 0
    if fps_val and abs(fps_val - 24.0) < 0.1:
        checks["fps_24"] = True
    else:
        details["fps_error"] = f"FPS {fps_val} is not 24"

    # Check 5: Codec is H.264
    codec_name = video_stream.get("codec_name", "").lower()
    details["codec"] = codec_name
    if codec_name in ["h264", "avc1"]:
        checks["codec_h264"] = True
    else:
        details["codec_error"] = f"Codec {codec_name} is not h264"

    # Check 6: Clean full decode
    decode_cmd = [
        FFMPEG_PATH,
        "-v", "error",
        "-i", mp4_path,
        "-f", "null",
        "-"
    ]
    decode_res = subprocess.run(decode_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if decode_res.returncode == 0 and len(decode_res.stderr.strip()) == 0:
        checks["clean_full_decode"] = True
        details["decode"] = "Clean (code 0, no errors)"
    else:
        details["decode_error"] = decode_res.stderr.strip() or f"Decode exited code {decode_res.returncode}"

    # Check Audio Stream
    audio_stream = None
    for s in meta.get("streams", []):
        if s.get("codec_type") == "audio":
            audio_stream = s
            break

    if audio_stream:
        details["audio_present"] = True
        details["audio_codec"] = audio_stream.get("codec_name")
        details["audio_channels"] = audio_stream.get("channels")
        details["audio_bitrate"] = audio_stream.get("bit_rate")
        details["audio_status"] = "Audio bed present (peaked at -20dB)"
    else:
        details["audio_present"] = False
        details["audio_status"] = "Silent video (audio bed not mixed)"

    all_passed = all(checks.values())
    if not all_passed:
        if os.path.exists(mp4_path):
            os.remove(mp4_path)

    return all_passed, checks, details


def cut_commercials(product_data, output_dir=None):
    """
    Main entrypoint: validates inputs (strict price requirement), renders 3 MP4s,
    generates/mixes background music bed (if HF_TOKEN configured),
    runs verification gate, and returns file paths + pass/fail status.
    """
    # Strict Price Requirement: STOP if no price set, never invent one
    price = product_data.get("price")
    if price is None or price == "" or (isinstance(price, (int, float)) and price <= 0):
        raise ValueError("CRITICAL: Product record has no price set. STOPPING — never invent a price.")

    title = product_data.get("title") or product_data.get("name") or "Product"
    brand = product_data.get("brand") or ""
    condition = product_data.get("condition") or "new"
    free_shipping = bool(product_data.get("freeShipping", product_data.get("free_shipping", True)))
    slug = product_data.get("slug") or "product"

    stills = product_data.get("stills") or []
    turntable_clip = product_data.get("turntable_clip") or product_data.get("turntable") or None

    if not output_dir:
        output_dir = os.path.join(os.getcwd(), "public", "commercials")
    os.makedirs(output_dir, exist_ok=True)

    # 15s Background Music Bed Generation
    print("\n--- Background Music Bed ---")
    music_bed_path = generate_music_bed(prompt=DEFAULT_MUSIC_PROMPT, duration=15)

    results = {}
    
    for p_key, spec in PLATFORM_SPECS.items():
        filename = f"{slug}{spec['suffix']}"
        out_path = os.path.join(output_dir, filename)
        web_url = f"/commercials/{filename}"

        print(f"\n--- Cutting {p_key.upper()} ({spec['width']}x{spec['height']}, 15s @ 24fps) ---")
        render_commercial_video(
            platform_key=p_key,
            title=title,
            brand=brand,
            condition=condition,
            price=price,
            free_shipping=free_shipping,
            stills=stills,
            turntable_path=turntable_clip,
            output_path=out_path
        )

        # Mix 15s audio bed under video if available
        if music_bed_path:
            mix_audio_bed(out_path, music_bed_path, peak_db="-20dB")

        passed, checks, details = verify_commercial(out_path, spec["width"], spec["height"])
        
        results[p_key] = {
            "passed": passed,
            "path": out_path if passed else None,
            "url": web_url if passed else None,
            "checks": checks,
            "details": details
        }
        print(f"Verification Gate for {p_key}: {'PASS' if passed else 'FAIL'}")
        for c_name, c_res in checks.items():
            print(f"  [{'PASS' if c_res else 'FAIL'}] {c_name}")
        if details.get("audio_present"):
            print(f"  [AUDIO] {details.get('audio_status')} ({details.get('audio_codec')})")
        else:
            print(f"  [AUDIO] {details.get('audio_status')}")

    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="BossListers Commercial Cutter")
    parser.add_argument("--json", type=str, help="JSON string or file path containing product record")
    args = parser.parse_args()

    if args.json:
        if os.path.exists(args.json):
            with open(args.json, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = json.loads(args.json)
        
        res = cut_commercials(data)
        print("\nSUMMARY_JSON:")
        print(json.dumps(res, indent=2))
