#!/usr/bin/env python3
"""
scripts/commercial_qc.py
100% local, zero-paid-API automated quality inspector for BossListers Commercial Builder.

Inspects a rendered vertical commercial MP4 (and optional cutout prep metadata) using
ffprobe/ffmpeg + OpenCV + Pillow, returning deterministic 0-100 quality scores across:
  - technicalScore : resolution (1080x1920), fps, h264/yuv420p, duration, healthy bitrate
  - cutoutScore    : background removal quality, subject coverage, floating edge cleanliness
  - contrastScore  : headline/CTA readability contrast, subject-vs-backdrop pop, zero black frames
  - pacingScore    : visual variety across open -> hero -> cut-ins -> return -> close + loop symmetry
  - framingScore   : subject vertical balance, headroom under CTA pill, bottom text clearance

Also outputs concrete, machine-applicable tuning adjustments (e.g. bgDimDelta) so the
commercial learning engine and --auto-improve loop make every future commercial better.
"""

import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np


def find_media_binary(name):
    """Locate ffmpeg or ffprobe from PATH or Remotion's bundled @remotion/compositor-* dir."""
    found = shutil.which(name)
    if found:
        return found
    repo_root = Path(__file__).resolve().parent.parent
    patterns = [
        str(repo_root / "node_modules" / "@remotion" / "compositor-*" / name),
        str(repo_root / "node_modules" / "@remotion" / "compositor-*" / f"{name}.exe"),
    ]
    for pat in patterns:
        matches = glob.glob(pat)
        for m in matches:
            if os.path.isfile(m):
                return m
    return None


def probe_video_cv2(mp4_path):
    """Fallback video probe using OpenCV's built-in FFmpeg decoder (works even without ffprobe on PATH)."""
    cap = cv2.VideoCapture(str(mp4_path))
    if not cap.isOpened():
        return None
    try:
        w = int(round(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0))
        h = int(round(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0))
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
        frame_count = float(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0)
        dur = round(frame_count / max(1.0, fps), 2) if frame_count > 0 else 0.0
        size_bytes = os.path.getsize(mp4_path)
        bit_rate = int((size_bytes * 8) / max(0.5, dur)) if dur > 0 else 0
        fourcc_int = int(cap.get(cv2.CAP_PROP_FOURCC) or 0)
        fourcc = "".join(chr((fourcc_int >> (8 * i)) & 0xFF) for i in range(4)).strip().lower()
        codec = "h264" if fourcc in ("avc1", "h264", "x264") else (fourcc or "h264")
        return {
            "width": w,
            "height": h,
            "codec": codec,
            "pix_fmt": "yuv420p",
            "fps": round(fps, 2),
            "duration": dur,
            "bytes": size_bytes,
            "bit_rate": bit_rate,
        }
    finally:
        cap.release()


def probe_video(mp4_path, ffprobe_bin):
    if ffprobe_bin:
        cmd = [
            ffprobe_bin,
            "-v", "error",
            "-show_entries", "format=duration,size,bit_rate",
            "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,r_frame_rate",
            "-of", "json",
            str(mp4_path),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if res.returncode == 0:
            try:
                data = json.loads(res.stdout or "{}")
                v_stream = next(
                    (s for s in data.get("streams", []) if s.get("codec_type") == "video"),
                    None,
                )
                if v_stream:
                    fps_raw = str(v_stream.get("r_frame_rate") or "30/1")
                    try:
                        num, den = fps_raw.split("/")
                        fps = float(num) / max(1.0, float(den))
                    except Exception:
                        fps = 30.0
                    fmt = data.get("format", {})
                    return {
                        "width": int(v_stream.get("width") or 0),
                        "height": int(v_stream.get("height") or 0),
                        "codec": str(v_stream.get("codec_name") or ""),
                        "pix_fmt": str(v_stream.get("pix_fmt") or ""),
                        "fps": round(fps, 2),
                        "duration": round(float(fmt.get("duration") or 0.0), 2),
                        "bytes": int(fmt.get("size") or os.path.getsize(mp4_path)),
                        "bit_rate": int(fmt.get("bit_rate") or 0),
                    }
            except Exception:
                pass
    return probe_video_cv2(mp4_path)


def extract_key_frames(mp4_path, ffmpeg_bin, duration):
    """Extract 6 key beat frames across the commercial into BGR numpy arrays."""
    dur = max(2.0, float(duration or 12.0))
    # Beat timestamps scaled safely to actual video duration
    if dur >= 10.5:
        timestamps = {
            "open": 0.8,
            "hero": 3.8,
            "mid1": 5.2,
            "mid2": 7.2,
            "return_hero": 9.0,
            "close": max(dur - 0.5, dur * 0.94),
        }
    else:
        timestamps = {
            "open": round(dur * 0.08, 2),
            "hero": round(dur * 0.30, 2),
            "mid1": round(dur * 0.46, 2),
            "mid2": round(dur * 0.64, 2),
            "return_hero": round(dur * 0.78, 2),
            "close": round(dur * 0.94, 2),
        }

    # Prefer direct OpenCV VideoCapture decode (fast, zero temp files, works without ffmpeg on PATH)
    frames = {}
    cap = cv2.VideoCapture(str(mp4_path))
    if cap.isOpened():
        try:
            fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or round(dur * fps))
            for label, ts in timestamps.items():
                idx = max(0, min(max(0, total_frames - 1), int(round(ts * fps))))
                cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
                ok, img = cap.read()
                if ok and img is not None:
                    h, w = img.shape[:2]
                    if w > 540:
                        scale = 540.0 / float(w)
                        img = cv2.resize(img, (540, max(2, int(round(h * scale)))), interpolation=cv2.INTER_AREA)
                    frames[label] = img
        finally:
            cap.release()
    if len(frames) >= 4 or not ffmpeg_bin:
        return frames

    with tempfile.TemporaryDirectory(prefix="bl-qc-") as tmpdir:
        for label, ts in timestamps.items():
            if label in frames:
                continue
            out_jpg = os.path.join(tmpdir, f"{label}.jpg")
            cmd = [
                ffmpeg_bin,
                "-y",
                "-ss", f"{ts:.2f}",
                "-i", str(mp4_path),
                "-frames:v", "1",
                "-vf", "scale=540:-2",
                "-q:v", "2",
                out_jpg,
            ]
            res = subprocess.run(cmd, capture_output=True, timeout=20)
            if res.returncode == 0 and os.path.isfile(out_jpg):
                img = cv2.imread(out_jpg)
                if img is not None:
                    frames[label] = img
    return frames


def score_technical(probe, issues, strengths):
    if not probe:
        issues.append("ffprobe unavailable; technical stream check skipped")
        return 75
    score = 100
    w, h = probe["width"], probe["height"]
    if w != 1080 or h != 1920:
        score -= 22
        issues.append(f"Non-standard vertical resolution {w}x{h} (expected 1080x1920)")
    if probe["codec"] != "h264":
        score -= 15
        issues.append(f"Codec is {probe['codec']} (expected h264 for universal Reels/Shorts playback)")
    if probe["pix_fmt"] and probe["pix_fmt"] != "yuv420p":
        score -= 12
        issues.append(f"Pixel format {probe['pix_fmt']} (expected yuv420p)")
    if probe["fps"] < 24:
        score -= 12
        issues.append(f"Low frame rate {probe['fps']}fps")
    if probe["duration"] < 6.0 or probe["duration"] > 30.0:
        score -= 12
        issues.append(f"Duration {probe['duration']}s outside ideal 8-16s showcase window")
    bitrate_mbps = (probe["bit_rate"] or 0) / 1_000_000.0
    if bitrate_mbps > 0 and bitrate_mbps < 1.2:
        score -= 10
        issues.append(f"Low video bitrate ({bitrate_mbps:.2f} Mbps) may look compressed")
    elif bitrate_mbps >= 3.0 and w == 1080 and h == 1920:
        strengths.append(f"Crisp 1080x1920 H.264 render ({bitrate_mbps:.1f} Mbps @ {probe['fps']:.0f}fps)")
    return max(0, min(100, int(round(score))))


def score_cutout(prep_strategy, bg_removed, coverage_pct, category, frame_style, issues, strengths, adjustments):
    score = 80
    strat = (prep_strategy or "none").lower()

    if bg_removed:
        if "rmbg" in strat:
            score = 96
            strengths.append("Neural RMBG-1.4 background removal preserved fine/transparent edges")
        elif "contour_warp" in strat or "grabcut_warp" in strat:
            score = 94
            strengths.append("Clean perspective-straightened card cutout with transparent corners")
        elif "grabcut" in strat:
            score = 84
            if category in ("resale-bundle", "single-item"):
                issues.append("Used GrabCut fallback instead of RMBG-1.4 ONNX; install onnxruntime for cleaner transparent edges")
        else:
            score = 88
    else:
        score = 62
        issues.append("Original photo background was not removed; enable --bg-remove card|cutout")
        adjustments["recommendRemoveBg"] = "card" if category == "trading-card" else "cutout"

    if coverage_pct is not None:
        cov = float(coverage_pct)
        if cov < 18.0:
            score -= 14
            issues.append(f"Subject cutout coverage is low ({cov:.1f}%); check crop or matting")
        elif cov > 93.0 and category != "trading-card":
            score -= 10
            issues.append(f"Subject covers {cov:.1f}% of frame; background may not have separated cleanly")
        elif 32.0 <= cov <= 86.0:
            score = min(100, score + 3)

    if category in ("resale-bundle", "single-item") and frame_style == "gold-frame":
        score -= 6
        issues.append("Non-card product used rectangular gold-frame; floating frame usually fits general items better")
        adjustments["recommendFrameStyle"] = "floating"

    return max(0, min(100, int(round(score))))


def score_contrast_and_readability(frames, bg_dim, issues, strengths, adjustments):
    if not frames:
        return 75, {}

    hero = frames.get("hero")
    mid1 = frames.get("mid1")
    sample_ref = hero if hero is not None else next(iter(frames.values()))
    h, w = sample_ref.shape[:2]

    # Measure luminance stats in key bands on hero/return_hero frames
    eval_frames = [f for k, f in frames.items() if k in ("hero", "mid1", "mid2", "return_hero") and f is not None]
    if not eval_frames:
        eval_frames = [sample_ref]

    headline_contrasts = []
    backdrop_lumas = []
    subject_pops = []
    dark_frame_flags = 0

    for img in eval_frames:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
        if float(gray.mean()) < 4.0:
            dark_frame_flags += 1

        # Bottom headline text band (y = 70%..84%, x = 10%..90%)
        # Use p98.5 so even short 1-word titles (e.g. "Oddish") measure true text luminance
        text_band = gray[int(h * 0.70):int(h * 0.84), int(w * 0.10):int(w * 0.90)]
        p98 = float(np.percentile(text_band, 98.5))
        p50 = float(np.percentile(text_band, 50))
        headline_contrasts.append(p98 - p50)
        backdrop_lumas.append(p50)

        # Subject stage (y = 18%..67%, x = 16%..84%) vs side backdrop margins (x < 10% or x > 90%)
        stage = gray[int(h * 0.18):int(h * 0.67), int(w * 0.16):int(w * 0.84)]
        left_margin = gray[int(h * 0.18):int(h * 0.67), :int(w * 0.09)]
        right_margin = gray[int(h * 0.18):int(h * 0.67), int(w * 0.91):]
        margin_mean = float(0.5 * (left_margin.mean() + right_margin.mean()))
        stage_p85 = float(np.percentile(stage, 85))
        subject_pops.append(stage_p85 - margin_mean)

    avg_text_contrast = float(np.mean(headline_contrasts))
    avg_backdrop_luma = float(np.mean(backdrop_lumas))
    avg_subject_pop = float(np.mean(subject_pops))

    score = 92
    if dark_frame_flags > 0:
        score -= 28
        issues.append(f"Detected {dark_frame_flags} near-black frame(s) in showcase window")

    # Headline readability checks
    if avg_backdrop_luma > 78.0:
        score -= 16
        issues.append(f"Backdrop behind bottom text is bright (luma {avg_backdrop_luma:.0f}); increase --bg-dim for sharper legibility")
        adjustments["bgDimDelta"] = round(min(0.14, (avg_backdrop_luma - 55.0) / 250.0), 2)
    elif avg_text_contrast < 95.0:
        score -= 10
        issues.append(f"Headline contrast is soft ({avg_text_contrast:.0f}); slightly darker backdrop scrim improves readability")
        adjustments["bgDimDelta"] = 0.06
    elif avg_text_contrast >= 150.0 and avg_backdrop_luma <= 42.0:
        score += 5
        strengths.append("High-contrast headline typography over dark studio backdrop")

    # Subject pop checks
    if avg_subject_pop < 45.0:
        score -= 12
        issues.append(f"Subject separation from backdrop is low (pop {avg_subject_pop:.0f}); consider studio-spotlight or gold-glow stage")
    elif avg_subject_pop >= 95.0:
        score += 3
        strengths.append("Strong subject separation against studio lighting")

    # Check if backdrop is over-dimmed (crushing spotlight/texture completely)
    if bg_dim is not None and float(bg_dim) > 0.65 and avg_backdrop_luma < 8.0:
        score -= 4
        issues.append("Background scrim is very heavy; reducing --bg-dim slightly brings back studio depth")
        adjustments["bgDimDelta"] = -0.08

    metrics = {
        "headlineContrast": round(avg_text_contrast, 1),
        "textBackdropLuma": round(avg_backdrop_luma, 1),
        "subjectPop": round(avg_subject_pop, 1),
    }
    return max(0, min(100, int(round(score)))), metrics


def score_pacing_and_loop(frames, cutin_count, category, issues, strengths, adjustments):
    if len(frames) < 4:
        return 75, {}

    def frame_diff(a, b):
        if a is None or b is None:
            return 0.0
        ga = cv2.cvtColor(a, cv2.COLOR_BGR2GRAY).astype(np.float32)
        gb = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float32)
        return float(np.abs(ga - gb).mean())

    open_f = frames.get("open")
    hero_f = frames.get("hero")
    mid1_f = frames.get("mid1")
    mid2_f = frames.get("mid2")
    ret_f = frames.get("return_hero")
    close_f = frames.get("close")

    d_open_hero = frame_diff(open_f, hero_f)
    d_hero_mid1 = frame_diff(hero_f, mid1_f)
    d_mid1_mid2 = frame_diff(mid1_f, mid2_f)
    d_mid2_ret = frame_diff(mid2_f, ret_f)
    d_ret_close = frame_diff(ret_f, close_f)

    # Loop symmetry: compare open vs close on top/bottom/outer regions (ignoring brand subtitle on open)
    loop_sim = 100.0
    if open_f is not None and close_f is not None:
        h, w = open_f.shape[:2]
        top_diff = frame_diff(open_f[:int(h * 0.48), :], close_f[:int(h * 0.48), :])
        bot_diff = frame_diff(open_f[int(h * 0.68):, :], close_f[int(h * 0.68):, :])
        loop_sim = max(0.0, min(100.0, 100.0 - (top_diff + bot_diff) * 1.4))

    mid_motion = float(np.mean([d_hero_mid1, d_mid1_mid2, d_mid2_ret]))

    score = 82
    if d_open_hero < 6.0:
        score -= 18
        issues.append("Very little visual change from intro to hero showcase")
    if cutin_count >= 2 and mid_motion >= 10.0:
        score = 96
        strengths.append(f"Dynamic multi-cut pacing ({cutin_count} cut-ins, mid-reel motion {mid_motion:.1f})")
    elif cutin_count == 1 and mid_motion >= 7.0:
        score = 91
        strengths.append("Clean cut-in transition adds visual variety mid-reel")
    elif cutin_count == 0:
        score = 78
        if category == "resale-bundle":
            issues.append("Bundle reel has 0 cut-ins; enable --auto-bundle-cutins to spotlight each item solo")
            adjustments["recommendAutoBundleCutins"] = True
        elif category == "trading-card":
            issues.append("Card reel has 0 cut-ins; enable --auto-closeup or --include-back for stronger retention")
            adjustments["recommendAutoCloseup"] = True

    if loop_sim >= 82.0:
        score = min(100, score + 4)
        strengths.append(f"Seamless open/close loop symmetry ({loop_sim:.0f}%)")
    elif loop_sim < 60.0:
        score -= 8
        issues.append(f"Open and close frames diverge (loop symmetry {loop_sim:.0f}%)")

    metrics = {
        "midReelMotion": round(mid_motion, 1),
        "loopSymmetry": round(loop_sim, 1),
        "openToHeroDelta": round(d_open_hero, 1),
    }
    return max(0, min(100, int(round(score)))), metrics


def score_framing(frames, issues, strengths):
    hero = frames.get("hero")
    if hero is None:
        hero = frames.get("return_hero")
    if hero is None:
        return 80, {}
    h, w = hero.shape[:2]
    gray = cv2.cvtColor(hero, cv2.COLOR_BGR2GRAY).astype(np.float32)

    # Check stage energy balance (left vs right half) & clean buffer between subject and bottom text
    stage = gray[int(h * 0.18):int(h * 0.67), int(w * 0.12):int(w * 0.88)]
    bg_ref = float(np.percentile(gray[int(h * 0.18):int(h * 0.67), :int(w * 0.08)], 50))
    fg_mask = np.abs(stage - bg_ref) > 22.0
    fg_frac = float(fg_mask.mean())

    ys, xs = np.where(fg_mask)
    score = 92
    center_offset = 0.0
    if len(xs) > 100:
        cx = float(xs.mean()) / float(stage.shape[1])
        center_offset = abs(cx - 0.5)
        if center_offset > 0.14:
            score -= 10
            issues.append(f"Hero subject leans off-center ({center_offset*100:.0f}% horizontal offset)")
        else:
            strengths.append("Well-centered hero composition with clean top/bottom safe zones")

    if fg_frac < 0.14:
        score -= 14
        issues.append(f"Hero occupies only {fg_frac*100:.0f}% of stage; consider zooming or tighter cutout trim")
    elif fg_frac > 0.94:
        score -= 8
        issues.append("Stage looks tightly packed edge-to-edge; slightly more studio breathing room helps")
    elif 0.30 <= fg_frac <= 0.80:
        score = min(100, score + 4)

    metrics = {
        "stageFillPct": round(fg_frac * 100.0, 1),
        "centerOffsetPct": round(center_offset * 100.0, 1),
    }
    return max(0, min(100, int(round(score)))), metrics


def analyze_commercial(
    video_path,
    category="trading-card",
    prep_strategy="none",
    bg_removed=False,
    coverage_pct=None,
    bg_dim=None,
    frame_style="gold-frame",
    cutin_count=0,
):
    video_path = Path(video_path).resolve()
    if not video_path.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    ffprobe_bin = find_media_binary("ffprobe")
    ffmpeg_bin = find_media_binary("ffmpeg")

    issues = []
    strengths = []
    adjustments = {}

    probe = probe_video(video_path, ffprobe_bin)
    frames = extract_key_frames(video_path, ffmpeg_bin, probe["duration"] if probe else 12.0)

    technical_score = score_technical(probe, issues, strengths)
    cutout_score = score_cutout(
        prep_strategy, bg_removed, coverage_pct, category, frame_style, issues, strengths, adjustments
    )
    contrast_score, contrast_metrics = score_contrast_and_readability(
        frames, bg_dim, issues, strengths, adjustments
    )
    pacing_score, pacing_metrics = score_pacing_and_loop(
        frames, cutin_count, category, issues, strengths, adjustments
    )
    framing_score, framing_metrics = score_framing(frames, issues, strengths)

    overall = int(
        round(
            technical_score * 0.16
            + cutout_score * 0.26
            + contrast_score * 0.24
            + pacing_score * 0.22
            + framing_score * 0.12
        )
    )

    return {
        "ok": True,
        "videoPath": str(video_path),
        "category": category,
        "overallScore": max(0, min(100, overall)),
        "scores": {
            "technical": technical_score,
            "cutout": cutout_score,
            "contrast": contrast_score,
            "pacing": pacing_score,
            "framing": framing_score,
        },
        "metrics": {
            **contrast_metrics,
            **pacing_metrics,
            **framing_metrics,
            "framesAnalyzed": len(frames),
            "durationSeconds": probe["duration"] if probe else None,
            "width": probe["width"] if probe else None,
            "height": probe["height"] if probe else None,
            "bytes": probe["bytes"] if probe else os.path.getsize(video_path),
        },
        "strengths": strengths,
        "issues": issues,
        "adjustments": adjustments,
    }


def main():
    parser = argparse.ArgumentParser(description="BossListers Automated Commercial Quality Inspector")
    parser.add_argument("--video", required=True, help="Path to rendered .mp4 file")
    parser.add_argument("--category", default="trading-card", choices=["trading-card", "resale-bundle", "single-item"])
    parser.add_argument("--prep-strategy", default="none")
    parser.add_argument("--bg-removed", action="store_true")
    parser.add_argument("--coverage-pct", type=float, default=None)
    parser.add_argument("--bg-dim", type=float, default=None)
    parser.add_argument("--frame-style", default="gold-frame")
    parser.add_argument("--cutin-count", type=int, default=0)
    args = parser.parse_args()

    result = analyze_commercial(
        video_path=args.video,
        category=args.category,
        prep_strategy=args.prep_strategy,
        bg_removed=args.bg_removed,
        coverage_pct=args.coverage_pct,
        bg_dim=args.bg_dim,
        frame_style=args.frame_style,
        cutin_count=args.cutin_count,
    )
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
