"""
music_gen.py — Auto-generate background music beds using local MusicGen inference.
Runs 100% locally via HuggingFace transformers — no API calls, no tokens required.

Default model: facebook/musicgen-stereo-small
"""

import argparse
import os
import sys
import time

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import numpy as np
import torch
import scipy.io.wavfile
from transformers import AutoProcessor, MusicgenForConditionalGeneration

# Default model: facebook/musicgen-stereo-small (stereo, optimized for systems with < 10GB VRAM)
MODEL_ID = "facebook/musicgen-stereo-small"

CHANNEL_PROMPTS = {
    "COMMERCIAL": "upbeat cheerful commercial background music, no vocals",
    "GG": (
        "epic cinematic orchestral battle music, powerful brass fanfare, war drums, "
        "dramatic strings, majestic and powerful, no vocals, history documentary "
        "background score, cinematic tension builds"
    ),
    "LO": (
        "playful whimsical kids adventure music, bright flutes and pizzicato strings, "
        "fun and magical, ancient Greek mythology theme, upbeat and cheerful, no vocals"
    ),
    "IL": (
        "80s anime synth orchestral hybrid, dramatic mech battle theme, "
        "powerful brass meets synthesizer, action and tension, no vocals"
    ),
    "ED": (
        "modern tech documentary music, electronic ambient with orchestral elements, "
        "forward-thinking and intelligent, no vocals, AI and innovation theme"
    ),
}

_PROCESSOR = None
_MODEL = None


def get_model_and_processor(model_id: str = MODEL_ID):
    """Loads and caches the local MusicGen model and processor."""
    global _PROCESSOR, _MODEL
    if _PROCESSOR is None or _MODEL is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[music_gen] Initializing local MusicGen ({model_id}) on {device.upper()}...")
        t0 = time.time()
        _PROCESSOR = AutoProcessor.from_pretrained(model_id)
        _MODEL = MusicgenForConditionalGeneration.from_pretrained(model_id)
        _MODEL.to(device)
        print(f"[music_gen] Model loaded in {time.time() - t0:.2f}s")
    return _PROCESSOR, _MODEL


def generate_music(
    prompt: str,
    duration: int = 15,
    out_path: str = "music/output.wav",
    model_id: str = MODEL_ID,
) -> bool:
    """
    Generates music locally using HuggingFace transformers.

    Args:
        prompt: Text description of the audio bed
        duration: Duration in seconds
        out_path: Destination WAV file path
        model_id: HuggingFace model identifier

    Returns:
        True if generation succeeded and file is non-empty.
    """
    try:
        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
        device = "cuda" if torch.cuda.is_available() else "cpu"

        processor, model = get_model_and_processor(model_id)

        print(f"[music_gen] Generating {duration}s bed locally on {device.upper()}...")
        print(f"[music_gen] Prompt: \"{prompt}\"")
        t_start = time.time()

        inputs = processor(text=[prompt], padding=True, return_tensors="pt")
        inputs = {k: v.to(device) for k, v in inputs.items()}

        # 50 tokens per second in MusicGen EnCodec
        tokens_to_generate = max(50, int(duration * 50))

        with torch.no_grad():
            audio_values = model.generate(
                **inputs,
                max_new_tokens=tokens_to_generate,
                do_sample=True,
                guidance_scale=3.0,
            )

        elapsed = time.time() - t_start
        sampling_rate = model.config.audio_encoder.sampling_rate

        # Shape: (batch, channels, samples) -> (1, 2, N) or (1, 1, N)
        audio_tensor = audio_values[0].cpu().float().numpy()
        if audio_tensor.ndim == 2:
            audio_tensor = audio_tensor.T  # (samples, channels)

        # Convert to 16-bit PCM for universal player/FFmpeg compatibility
        audio_tensor = np.clip(audio_tensor, -1.0, 1.0)
        audio_int16 = (audio_tensor * 32767).astype(np.int16)

        scipy.io.wavfile.write(out_path, rate=sampling_rate, data=audio_int16)

        file_size = os.path.getsize(out_path)
        print(f"[music_gen] [OK] Generated {duration}s WAV in {elapsed:.2f}s: {out_path} ({file_size} bytes)")
        return True

    except Exception as e:
        print(f"[music_gen] [ERROR] Error during local MusicGen inference: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description="Generate background music beds locally via MusicGen")
    parser.add_argument("--prompt", default=None, help="Text prompt for music generation")
    parser.add_argument("--channel", default="COMMERCIAL", choices=list(CHANNEL_PROMPTS.keys()),
                        help="Preset channel/genre prompt")
    parser.add_argument("--duration", type=int, default=15, help="Duration in seconds (default: 15)")
    parser.add_argument("--out", default=None, help="Output WAV path")
    parser.add_argument("--model", default=MODEL_ID, help="HF model name (default: facebook/musicgen-stereo-small)")
    args = parser.parse_args()

    prompt = args.prompt or CHANNEL_PROMPTS.get(args.channel, CHANNEL_PROMPTS["COMMERCIAL"])
    out_path = args.out or os.path.join("public", "music", "bed.wav")

    ok = generate_music(
        prompt=prompt,
        duration=args.duration,
        out_path=out_path,
        model_id=args.model,
    )
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
