#!/usr/bin/env python3
"""
scene_gen.py — the "diffusion visuals" stage of the ads4now pipeline.

Generates cinematic AI backgrounds for each of the 5 commercial scenes,
then the renderer composites the background-removed product cutout on top
(product-preserving: diffusion never touches the product itself).

Provider chain (first working one wins, all $0, no card required):
  1. "huggingface" — FLUX.1-schnell via HF Inference Providers.
     Needs HF_TOKEN (free at huggingface.co/settings/tokens, needs the
     `inference` scope). Rate-limited free tier.
  2. "gemini" — gemini-2.5-flash-image via AI Studio.
     Needs GEMINI_API_KEY (free at aistudio.google.com/apikey).
     Free-tier image quota varies by account.

On total failure we raise RuntimeError and the caller falls back to the
product-graded gradient backgrounds (bg_style) — loudly, never silently.

    from lib.scene_gen import generate_scene_backgrounds
    paths = generate_scene_backgrounds(product, brief, dest_dir, aspect="9:16")
    # -> {"title": path, "showcase": path, ...}
"""

import base64
import json
import os
import time
import urllib.error
import urllib.request

HF_ROUTER = ("https://router.huggingface.co/hf-inference/models/"
             "black-forest-labs/FLUX.1-schnell")
GEMINI_URL = ("https://generativelanguage.googleapis.com/v1beta/models/"
              "gemini-2.5-flash-image:generateContent")

NO_TEXT = "no text, no words, no letters, no watermark, no logo"


def _palette_words(product):
    """Pull a couple of evocative color words from the product palette."""
    pal = product.get("palette") or []
    words = []
    for hexcolor in pal[:3]:
        try:
            r = int(hexcolor[1:3], 16)
            g = int(hexcolor[3:5], 16)
            b = int(hexcolor[5:7], 16)
        except Exception:
            continue
        if r > 170 and g > 170 and b > 170:
            words.append("soft ivory")
        elif r > 150 and g < 110 and b < 110:
            words.append("rich crimson")
        elif r < 110 and g < 130 and b > 150:
            words.append("deep navy")
        elif r > 150 and g > 120 and b < 100:
            words.append("warm gold")
        elif g > 130 and r < 120 and b < 120:
            words.append("emerald")
        elif r > 140 and b > 140 and g < 120:
            words.append("royal purple")
        else:
            words.append("charcoal")
    return words or ["midnight"]


def scene_prompts(product, brief):
    """Cinematic, product-aware background prompts — one per scene.

    Every prompt leaves empty center space for the product cutout and
    bans text (diffusion lettering is unreliable; captions are overlaid
    by the renderer).
    """
    colors = _palette_words(product)
    c1, c2 = colors[0], colors[1] if len(colors) > 1 else "amber"
    name = product.get("name", "product")
    angle = (brief.get("angle") or "").strip()

    base = "cinematic commercial backdrop, empty copy space in the center, " + NO_TEXT
    return {
        "title": (
            f"dramatic product-reveal stage, {c1} and {c2} spotlight beams "
            f"from above, dark studio haze, glowing floor reflection, {base}"
        ),
        "showcase": (
            f"premium {c1} product photography studio, soft {c2} gradient "
            f"sweep, floating dust particles in light rays, airy minimal, {base}"
        ),
        "description": (
            f"dynamic {c1} energy waves with {c2} neon glow, sense of motion, "
            f"dark elegant background for {name}, {base}"
        ),
        "price_cta": (
            f"luxurious {c2} celebration burst, golden bokeh confetti, dark "
            f"rich background, festive premium sale atmosphere, {base}"
        ),
        "product_loop": (
            f"dreamy {c1} bokeh lights, {c2} glow orbs drifting, dark "
            f"elegant finale backdrop{f' for {angle}' if angle else ''}, {base}"
        ),
    }


# ─── providers ──────────────────────────────────────────────────────────

def _hf_generate(prompt, dest, token, timeout=180, retries=4):
    """FLUX.1-schnell via Hugging Face Inference Providers."""
    body = json.dumps({"inputs": prompt}).encode()
    last = None
    for attempt in range(retries):
        req = urllib.request.Request(
            HF_ROUTER, data=body,
            headers={"Authorization": f"Bearer {token}",
                     "Content-Type": "application/json",
                     "User-Agent": "commercial-maker/6.0"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                ctype = resp.headers.get("Content-Type", "")
                data = resp.read()
            if "image" in ctype:
                with open(dest, "wb") as fh:
                    fh.write(data)
                if os.path.getsize(dest) < 20_000:
                    raise RuntimeError("image came back too small")
                return dest
            # JSON body = error or "model loading"
            try:
                err = json.loads(data.decode())
                msg = str(err.get("error") or err)[:160]
            except Exception:
                msg = data[:160].decode("replace", "ignore")
            if "loading" in msg.lower():
                time.sleep(8 + attempt * 8)
                continue
            raise RuntimeError(f"huggingface: {msg}")
        except urllib.error.HTTPError as e:
            body_txt = e.read()[:300].decode("replace", "ignore")
            if e.code in (429, 503) or "loading" in body_txt.lower():
                last = f"HTTP {e.code}: {body_txt[:120]}"
                time.sleep(8 + attempt * 8)
                continue
            raise RuntimeError(f"huggingface HTTP {e.code}: {body_txt[:160]}")
        except Exception as e:  # noqa: BLE001
            last = str(e)[:160]
            time.sleep(4 + attempt * 4)
    raise RuntimeError(f"huggingface failed after {retries} tries ({last})")


def _gemini_generate(prompt, dest, key, aspect="9:16", timeout=180,
                     retries=3):
    """gemini-2.5-flash-image via AI Studio generateContent."""
    aspect_ratio = "9:16" if aspect == "9:16" else "1:1"
    body = json.dumps({
        "contents": [{"parts": [
            {"text": f"Generate a vertical commercial background image, "
                     f"aspect ratio {aspect_ratio}. {prompt}"}]}],
        "generationConfig": {
            "responseModalities": ["TEXT", "IMAGE"],
            "imageConfig": {"aspectRatio": aspect_ratio},
        },
    }).encode()
    last = None
    for attempt in range(retries):
        req = urllib.request.Request(
            GEMINI_URL, data=body,
            headers={"Content-Type": "application/json",
                     "x-goog-api-key": key,
                     "User-Agent": "commercial-maker/6.0"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            err_txt = e.read()[:300].decode("replace", "ignore")
            last = f"HTTP {e.code}: {err_txt[:140]}"
            if e.code in (429, 503):
                time.sleep(6 + attempt * 6)
                continue
            raise RuntimeError(f"gemini {last}")
        except Exception as e:  # noqa: BLE001
            last = str(e)[:160]
            time.sleep(4 + attempt * 4)
            continue
        try:
            parts = data["candidates"][0]["content"]["parts"]
            for part in parts:
                inline = part.get("inlineData") or part.get("inline_data")
                if inline and inline.get("data"):
                    with open(dest, "wb") as fh:
                        fh.write(base64.b64decode(inline["data"]))
                    if os.path.getsize(dest) < 20_000:
                        raise RuntimeError("image came back too small")
                    return dest
            raise RuntimeError("no image in response (model answered in text)")
        except KeyError as e:
            last = f"unexpected response shape ({e})"
            time.sleep(4)
    raise RuntimeError(f"gemini failed after {retries} tries ({last})")


# ─── orchestrator ───────────────────────────────────────────────────────

def generate_scene_backgrounds(product, brief, dest_dir, aspect="9:16",
                               seed=7, log=print, hf_token=None,
                               gemini_key=None):
    """Generate all 5 cinematic scene backgrounds. Returns {scene: path}.

    Tries Hugging Face, then Gemini, using env vars or explicit keys.
    Raises RuntimeError if neither provider works — the caller should
    fall back to bg_style gradients and say so.
    """
    os.makedirs(dest_dir, exist_ok=True)
    hf_token = hf_token or os.environ.get("HF_TOKEN", "").strip()
    gemini_key = gemini_key or os.environ.get("GEMINI_API_KEY", "").strip()
    providers = []
    if hf_token:
        providers.append(("huggingface",
                          lambda p, d: _hf_generate(p, d, hf_token)))
    if gemini_key:
        providers.append(("gemini",
                          lambda p, d: _gemini_generate(p, d, gemini_key,
                                                       aspect)))
    if not providers:
        raise RuntimeError(
            "no scene provider configured — set HF_TOKEN (free at "
            "huggingface.co/settings/tokens) or GEMINI_API_KEY (free at "
            "aistudio.google.com/apikey)")

    prompts = scene_prompts(product, brief)
    last_err = None
    for pname, gen in providers:
        try:
            out = {}
            for i, (scene, prompt) in enumerate(prompts.items()):
                dest = os.path.join(dest_dir, f"scene-{scene}.jpg")
                log(f"  [scenes] {scene} ({i + 1}/5) via {pname}...")
                gen(f"{prompt} (variation {seed + i})", dest)
                out[scene] = dest
            log(f"  [scenes] 5 AI backdrops from {pname}")
            return out
        except Exception as e:  # noqa: BLE001
            last_err = f"{pname}: {e}"
            log(f"  [scenes] {pname} failed ({e}); trying next provider")
    raise RuntimeError(f"all scene providers failed ({last_err})")


if __name__ == "__main__":
    paths = generate_scene_backgrounds(
        {"name": "White Castle Women's Boxshort",
         "palette": ["#b03030", "#f0e0c0"]},
        {"angle": "gift buyers who want funny licensed apparel"},
        "/tmp/scenes_test", aspect="9:16")
    print(paths)
