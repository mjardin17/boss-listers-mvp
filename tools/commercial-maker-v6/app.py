#!/usr/bin/env python3
"""
Commercial Maker v6 — the platform. AI ad studio: product in, finished
commercial out.

The full ads4now pipeline, every stage visible:
  URL scrape (+ reviews) -> AI copywriter -> background removal ->
  diffusion cinematic scenes -> voiceover -> FFmpeg assembly.

Run locally:
    pip install -r requirements.txt   # torch CPU build recommended
    python app.py                     # http://localhost:7860
    # from your phone: http://<this-machine-lan-ip>:7860

Or deploy free to Hugging Face Spaces (see README.md) for a public URL
you can open on your phone anywhere.
"""

import os
import sys
import threading
import time
import uuid

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

import gradio as gr

from lib.pipeline import Pipeline

WORKDIR = os.path.join(ROOT, "output")
UPLOADS = os.path.join(ROOT, "uploads")
os.makedirs(WORKDIR, exist_ok=True)
os.makedirs(UPLOADS, exist_ok=True)

STAGE_EMOJI = {
    "ingest": "🔍", "copy": "✍️", "cutout": "✂️", "scenes": "🎨",
    "variant": "🧪", "render": "🎬", "done": "✅",
}


def pretty_log(line):
    for stage, emoji in STAGE_EMOJI.items():
        if line.startswith(f"[{stage}]"):
            return emoji + " " + line
    return line


def build(url, name, description, price, sku, photo, aspect, variants,
          hf_token, gemini_key):
    """Generator: streams the pipeline log, then the artifacts."""
    if not url and not (name and description and price and photo):
        yield ("⚠️ Paste a product URL, or fill in name + description + "
               "price + photo.", None, None, [], [])
        return

    job = uuid.uuid4().hex[:8]
    workdir = os.path.join(WORKDIR, f"job-{job}")
    logs = []
    lock = threading.Lock()

    def log_fn(msg):
        with lock:
            logs.append(pretty_log(str(msg)))

    image_path = ""
    if photo:
        ext = os.path.splitext(photo)[1].lower() or ".jpg"
        image_path = os.path.join(UPLOADS, f"{job}{ext}")
        with open(photo, "rb") as src, open(image_path, "wb") as dst:
            dst.write(src.read())

    result_box = {}

    def worker():
        try:
            pipe = Pipeline(workdir, log=log_fn)
            result_box["result"] = pipe.run(
                product_url=(url or "").strip(),
                name=(name or "").strip(),
                description=(description or "").strip(),
                price=(price or "").strip(),
                image_path=image_path,
                sku=(sku or "").strip(),
                aspect=aspect, variants=int(variants),
                uploads_dir=UPLOADS,
                hf_token=(hf_token or "").strip(),
                gemini_key=(gemini_key or "").strip())
        except Exception as e:  # noqa: BLE001
            result_box["error"] = str(e)
            log_fn(f"[done] ❌ FAILED: {e}")

    t = threading.Thread(target=worker, daemon=True)
    t.start()
    last_n = 0
    while t.is_alive():
        time.sleep(0.7)
        with lock:
            if len(logs) != last_n:
                last_n = len(logs)
                yield ("\n".join(logs), None, None, [], [])
    t.join()

    if "error" in result_box:
        yield ("\n".join(logs), None, None, [], [])
        return
    r = result_box["result"]
    yield ("\n".join(logs),
           r.get("cutout_before"), r.get("cutout_after"),
           r.get("scene_images") or [],
           r.get("videos") or [])


def list_renders():
    rows = []
    for fn in sorted(os.listdir(WORKDIR)):
        p = os.path.join(WORKDIR, fn)
        if os.path.isdir(p):
            for v in sorted(os.listdir(p)):
                if v.endswith(".mp4"):
                    rows.append(os.path.join(p, v))
    return rows[-12:][::-1]


with gr.Blocks(title="Commercial Maker — AI Ad Studio",
               theme=gr.themes.Soft()) as demo:
    gr.Markdown(
        "# 🎬 Commercial Maker\n"
        "### AI ad studio — product in, finished commercial out.\n"
        "Paste a product URL (or enter it manually), tap **BUILD COMMERCIAL**. "
        "Every stage runs live below: scrape → AI script → background removal → "
        "cinematic AI scenes → voiceover → finished MP4.")
    with gr.Row():
        url = gr.Textbox(label="Product URL",
                         placeholder="https://yourstore.com/products/...",
                         scale=3)
    with gr.Row():
        name = gr.Textbox(label="Product name")
        sku = gr.Textbox(label="SKU (optional)")
    description = gr.Textbox(label="Description",
                             placeholder="What makes it great? Becomes the voiceover.",
                             lines=3)
    with gr.Row():
        price = gr.Textbox(label="Price", placeholder="14.99")
        photo = gr.Image(label="Product photo", type="filepath")
    with gr.Row():
        aspect = gr.Radio(["9:16", "1:1"], value="9:16",
                          label="Format (9:16 TikTok/Reels · 1:1 square)")
        variants = gr.Slider(1, 3, value=1, step=1,
                             label="Creative variants (different hooks)")
    with gr.Accordion("🔑 Free API keys — unlock AI scenes + AI copy "
                      "(optional, never stored)", open=False):
        gr.Markdown(
            "AI scene backdrops need one of these (both free, no card):\n"
            "• **HF_TOKEN** — huggingface.co/settings/tokens (needs the "
            "`inference` scope) → FLUX scenes\n"
            "• **GEMINI_API_KEY** — aistudio.google.com/apikey → Gemini scenes\n"
            "AI copy needs **NVIDIA_API_KEY** (build.nvidia.com) or "
            "**OPENROUTER_API_KEY**. Without keys you still get the full "
            "commercial — built-in formulas write the script and graded "
            "studio backdrops stand in for AI scenes.")
        hf_token = gr.Textbox(label="HF_TOKEN", type="password")
        gemini_key = gr.Textbox(label="GEMINI_API_KEY", type="password")
    go = gr.Button("🎬 BUILD COMMERCIAL", variant="primary", size="lg")

    log = gr.Textbox(label="Live build log", lines=14, max_lines=20,
                     autoscroll=True)
    with gr.Row():
        cut_before = gr.Image(label="Original photo")
        cut_after = gr.Image(label="Background removed ✂️")
    scenes = gr.Gallery(label="Cinematic AI scene backdrops", columns=5,
                        rows=1, height=220)
    videos = gr.Gallery(label="Your commercials (preview + download)",
                        columns=3, height=480)

    go.click(build,
             inputs=[url, name, description, price, sku, photo, aspect,
                     variants, hf_token, gemini_key],
             outputs=[log, cut_before, cut_after, scenes, videos])

    gr.Markdown("---\n### 📼 Previous renders")
    prev = gr.Gallery(label="", columns=4, height=300)
    demo.load(lambda: list_renders(), outputs=[prev])

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 7860))
    demo.queue(max_size=4).launch(server_name="0.0.0.0", server_port=port,
                                 share=False)
