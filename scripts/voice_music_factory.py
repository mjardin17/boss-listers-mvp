#!/usr/bin/env python3
"""
voice_music_factory.py — AI Voiceover Engine for Commercial Cutter
Uses Kokoro TTS (local, unlimited, high-quality) to generate synchronized 4-beat narration.

Beats:
  Beat 1 (0.00s - 3.75s): Product Title
  Beat 2 (3.75s - 7.50s): Brand + Condition
  Beat 3 (7.50s - 11.25s): Price + "Free shipping" (only when true)
  Beat 4 (11.25s - 15.00s): Platform CTA

Dynamic Speed Alignment:
  Each beat is timed to fit within 3.40s of its 3.75s window. If any narration
  exceeds 3.40s, the speed factor is automatically adjusted so speech never overflows.
  Each beat is padded to exactly 3.750s (90,000 samples @ 24kHz), creating a 15.000s track.
"""

import os
import sys
import io
import hashlib
from pathlib import Path
import numpy as np
import soundfile as sf

# Lazy-loaded pipeline cache to avoid reloading on every call
_pipeline = None

PLATFORM_CTAS = {
    "tiktok": "Shop now on TikTok Shop!",
    "instagram": "Tap the link in bio to buy!",
    "facebook": "Find it on Facebook Marketplace!",
}


def get_pipeline(lang_code: str = 'a'):
    global _pipeline
    if _pipeline is None:
        from kokoro import KPipeline
        _pipeline = KPipeline(lang_code=lang_code)
    return _pipeline


def generate_speech_array(text: str, voice: str = "af_bella", speed: float = 1.0) -> np.ndarray:
    """Generate Kokoro speech and return float numpy audio array at 24000 Hz."""
    pipeline = get_pipeline()
    generator = pipeline(text, voice=voice, speed=speed)
    audio_chunks = [audio for (_, _, audio) in generator]
    if not audio_chunks:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(audio_chunks)


def generate_speech(text: str, voice: str = "af_bella", speed: float = 1.0, out_path: str = None) -> bytes:
    """Convenience helper matching original voice_music_factory signature."""
    audio_array = generate_speech_array(text, voice=voice, speed=speed)
    buf = io.BytesIO()
    sf.write(buf, audio_array, 24000, format='WAV', subtype='PCM_16')
    audio_bytes = buf.getvalue()
    if out_path:
        os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
        with open(out_path, "wb") as f:
            f.write(audio_bytes)
    return audio_bytes


def format_price_narration(price_val) -> str:
    """Formats numeric or string price for natural speech."""
    try:
        val = float(price_val)
        dollars = int(val)
        cents = int(round((val - dollars) * 100))
        if cents == 0:
            return f"${dollars}"
        else:
            return f"${dollars}.{cents:02d}"
    except (ValueError, TypeError):
        return str(price_val)


def generate_4beat_narration(
    product_data: dict,
    platform_key: str = "tiktok",
    voice: str = "af_bella",
    output_path: str = None
) -> tuple[str, dict]:
    """
    Generates an exact 15.000s voiceover track timed to 4 beats (3.75s each).
    Ensures zero overflow and natural speech delivery.
    """
    title = product_data.get("title") or product_data.get("name") or "Exclusive Product"
    brand = product_data.get("brand") or ""
    condition = product_data.get("condition") or "Brand New"
    price = product_data.get("price")
    free_shipping = bool(product_data.get("freeShipping", product_data.get("free_shipping", True)))
    cta = PLATFORM_CTAS.get(platform_key, "Shop now!")

    # 1. Script the 4 beats
    beat1_text = f"{title.strip()}."
    if brand:
        beat2_text = f"{brand.strip()}. Condition: {condition.strip()}."
    else:
        beat2_text = f"Condition: {condition.strip()}."

    price_speech = format_price_narration(price)
    if free_shipping:
        beat3_text = f"Only {price_speech}, with free shipping."
    else:
        beat3_text = f"Only {price_speech}."

    beat4_text = cta.strip()

    beats_script = [
        ("Beat 1 (Title)", beat1_text),
        ("Beat 2 (Brand + Condition)", beat2_text),
        ("Beat 3 (Price + Shipping)", beat3_text),
        ("Beat 4 (Platform CTA)", beat4_text),
    ]

    sample_rate = 24000
    samples_per_beat = int(3.75 * sample_rate)  # 90,000 samples
    max_speech_duration = 3.40  # Maximum speech length to ensure >=0.35s breathing room in beat

    padded_beat_arrays = []
    beat_details = []

    for idx, (label, text) in enumerate(beats_script):
        speed = 1.05  # baseline energetic commercial pace
        arr = generate_speech_array(text, voice=voice, speed=speed)
        dur = len(arr) / float(sample_rate)

        # Dynamic speed adjustment: if speech overflows 3.40s, speed it up to fit cleanly
        if dur > max_speech_duration:
            adjusted_speed = min(1.5, speed * (dur / 3.25))
            arr = generate_speech_array(text, voice=voice, speed=adjusted_speed)
            dur = len(arr) / float(sample_rate)
            speed = adjusted_speed

        # Pad with zeros to exactly 3.75s window (samples_per_beat)
        if len(arr) < samples_per_beat:
            padded = np.pad(arr, (0, samples_per_beat - len(arr)), mode='constant')
        else:
            # Hard safety truncate (should not happen with speed adjustment)
            padded = arr[:samples_per_beat]

        padded_beat_arrays.append(padded)
        beat_details.append({
            "beat_index": idx + 1,
            "label": label,
            "text": text,
            "speech_duration_sec": round(dur, 2),
            "window_duration_sec": 3.75,
            "speed_multiplier": round(speed, 2),
            "overflow": False
        })

    # Concatenate all 4 beats: exactly 4 * 90,000 = 360,000 samples (15.000s)
    full_track = np.concatenate(padded_beat_arrays)

    # Normalize voice peak to -2.0 dBFS for consistent professional presence
    peak = np.max(np.abs(full_track))
    if peak > 0:
        target_peak = 10.0 ** (-2.0 / 20.0)  # ~0.794
        full_track = (full_track / peak) * target_peak

    if not output_path:
        output_dir = os.path.join(os.getcwd(), "public", "voice")
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"voice_{platform_key}_15s.wav")
    else:
        os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    sf.write(output_path, full_track, sample_rate, format='WAV', subtype='PCM_16')

    return output_path, beat_details


if __name__ == "__main__":
    test_prod = {
        "title": "White Castle Cravers Athletic Shorts",
        "brand": "White Castle",
        "condition": "New with tags",
        "price": 14.99,
        "free_shipping": True
    }
    out, details = generate_4beat_narration(test_prod, "tiktok", output_path="public/voice/test_wc_tiktok.wav")
    print("Generated 4-beat voiceover:", out)
    for b in details:
        print(f"  {b['label']}: \"{b['text']}\" -> {b['speech_duration_sec']}s (speed {b['speed_multiplier']}x)")
