# 🎬 Commercial Maker v6 — AI Ad Studio (the platform)

Paste a product URL (or enter it manually), tap **BUILD COMMERCIAL**, get a
finished MP4. The full ads4now pipeline, every stage visible in the build log:

1. 🔍 **Ingest** — pulls name, photo, price, description from the product URL
   (OpenGraph) + harvests review stars/quotes for social proof
2. ✍️ **Copy** — AI creative director: hooks, angle, scene scripts, captions
   (NVIDIA → OpenRouter → built-in direct-response formulas)
3. ✂️ **Background removal** — RMBG-1.4 cuts the product out; before/after
   shown in the UI. Loud failure, never silent.
4. 🎨 **Diffusion scenes** — cinematic AI backdrops per scene (FLUX via
   Hugging Face, or Gemini). The product is composited on top, untouched.
5. 🧪 **Variants** — up to 3 creative variants, each with a different hook
6. 🎬 **Voice + assembly** — TTS narration, music bed, captions, FFmpeg MP4
   in **9:16** (TikTok/Reels) or **1:1** (square)

## Run it locally

```bash
pip install -r requirements.txt   # CPU torch is fine
python app.py                     # http://localhost:7860
```

From your phone on the same Wi-Fi: `http://<this-computer's-LAN-IP>:7860`

## Put it on the internet (free, ~5 minutes) — the real platform

Hugging Face Spaces hosts it free with a public URL you can open on your
phone anywhere:

1. Make a free account at huggingface.co (no card).
2. **New Space** → name it e.g. `commercial-maker` → SDK **Gradio** →
   hardware **CPU Basic (free)** → Create.
3. Upload every file in this folder (drag-and-drop in the Space's Files tab,
   or `git push`).
4. Wait for the build (first boot downloads the background-removal model,
   ~1 GB, one time). Open the public URL: `https://<you>-commercial-maker.hf.space`

Optional — unlock the AI stages with free keys (paste in the app's
**🔑 Free API keys** panel, or add as Space Secrets; never stored anywhere):

| Key | Where (free, no card) | Unlocks |
|---|---|---|
| `HF_TOKEN` | huggingface.co/settings/tokens (tick the `inference` scope) | FLUX cinematic scenes |
| `GEMINI_API_KEY` | aistudio.google.com/apikey | Gemini cinematic scenes |
| `NVIDIA_API_KEY` | build.nvidia.com | Llama 3.3 ad copy |
| `OPENROUTER_API_KEY` | openrouter.ai | Llama 3.3 ad copy |

Without keys you still get the complete commercial: built-in formulas write
the script and product-color-graded studio backdrops stand in for AI scenes.

## What costs what

Everything in the default path is $0: RMBG-1.4, FLUX-schnell (HF free tier),
Gemini (AI Studio free tier), gTTS, FFmpeg, Gradio, Spaces CPU Basic.
No usage charges, no card on file anywhere.

## Files

- `app.py` — the platform (Gradio UI + pipeline wiring)
- `render_commercial.py` — the FFmpeg renderer (9:16 + 1:1, cutout compositing)
- `lib/pipeline.py` — the 7 loud stages
- `lib/scene_gen.py` — diffusion scene provider chain
- `lib/bg_remove.py` — RMBG-1.4 background removal (CPU)
- `lib/copywriter.py` — LLM copy provider chain
- `lib/url_ingest.py` — URL scrape + review harvesting
- `lib/bg_style.py` — product-palette graded fallback backdrops
- `lib/commercial_generator.py` — mission builder (variants, social proof)
- `tts.py` — Kokoro → gTTS → espeak chain
