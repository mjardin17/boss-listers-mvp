#!/usr/bin/env python3
"""
tts.py — Text-to-speech for the commercial maker.

Primary: Kokoro (local neural TTS, no network needed after first model download).
Fallback 2: gTTS (Google Translate TTS, needs network, good quality).
Fallback 3: espeak-ng (always available, robotic but works offline).

    from tts import synthesize
    synthesize("Only $14.99.", "line.wav")  # writes 24kHz mono WAV
"""

import os
import shutil
import subprocess

SAMPLE_RATE = 24000


def _ffmpeg():
    found = shutil.which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as e:
        raise SystemExit(
            "ffmpeg not found and imageio-ffmpeg isn't installed "
            f"({e}). pip install imageio-ffmpeg") from e


def _kokoro_available() -> bool:
    try:
        import kokoro  # noqa: F401
        return True
    except Exception:
        return False


def synthesize_kokoro(text: str, out_path: str, voice: str = "af_heart") -> str:
    from kokoro import KPipeline
    import soundfile as sf
    import numpy as np

    pipeline = KPipeline(lang_code="a")
    chunks = []
    for _, _, audio in pipeline(text, voice=voice):
        chunks.append(audio.numpy() if hasattr(audio, "numpy") else np.asarray(audio))
    if not chunks:
        raise RuntimeError("Kokoro produced no audio")
    audio = np.concatenate(chunks)
    sf.write(out_path, audio, SAMPLE_RATE)
    return out_path


def synthesize_gtts(text: str, out_path: str) -> str:
    from gtts import gTTS
    mp3 = out_path + ".gtts.mp3"
    gTTS(text, lang="en").save(mp3)
    if os.path.getsize(mp3) == 0:
        raise RuntimeError("gTTS returned empty audio")
    subprocess.run(
        [_ffmpeg(), "-y", "-v", "error", "-i", mp3,
         "-ar", str(SAMPLE_RATE), "-ac", "1", out_path],
        check=True,
    )
    try:
        os.remove(mp3)
    except OSError:
        pass
    return out_path


def synthesize_espeak(text: str, out_path: str) -> str:
    espeak = shutil.which("espeak-ng") or shutil.which("espeak")
    if not espeak:
        raise RuntimeError("No TTS engine available (kokoro missing, espeak-ng not installed)")
    subprocess.run(
        [espeak, "-v", "en+f3", "-s", "165", "-w", out_path, text],
        check=True, capture_output=True,
    )
    # espeak writes 22.05kHz wav; resample to 24k for consistency
    tmp = out_path + ".rs.wav"
    subprocess.run(
        [_ffmpeg(), "-y", "-v", "error", "-i", out_path, "-ar", str(SAMPLE_RATE), "-ac", "1", tmp],
        check=True,
    )
    shutil.move(tmp, out_path)
    return out_path


def synthesize(text: str, out_path: str, voice: str = "af_heart") -> str:
    """Synthesize speech to a WAV file. Returns the path. Never silently empty."""
    text = (text or "").strip()
    if not text:
        raise ValueError("Nothing to speak")
    if _kokoro_available():
        try:
            return synthesize_kokoro(text, out_path, voice)
        except Exception as e:
            print(f"  [tts] kokoro failed ({e}), falling back to gTTS")
    try:
        return synthesize_gtts(text, out_path)
    except Exception as e:
        print(f"  [tts] gTTS failed ({e}), falling back to espeak")
    return synthesize_espeak(text, out_path)


def wav_duration(path: str) -> float:
    import wave
    with wave.open(path, "rb") as w:
        return w.getnframes() / float(w.getframerate())
