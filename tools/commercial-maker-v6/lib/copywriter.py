#!/usr/bin/env python3
"""
copywriter.py — the creative-director stage.

Product data in -> audience angle, hooks, scene-by-scene script, captions,
voiceover lines, and visual directions out.

Two providers:
  * "nvidia"     — Llama 3.3 70B via NVIDIA's free build.nvidia.com credits.
    Needs NVIDIA_API_KEY in the environment. Free to use.
  * "openrouter" — Llama 3.3 70B via OpenRouter's free tier.
    Needs OPENROUTER_API_KEY in the environment. Free to use.
  * "template"   — structured fallback using proven direct-response hook
    formulas. No AI, but far better than reading the description verbatim.

write_copy() tries providers in order — nvidia, then openrouter, then
template — and uses the first one that works. The brief's "source" field
says which one actually wrote the copy, and failures fall through
silently so a dead key or empty credits never break a render.
"""

import json
import os
import urllib.request

NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
NVIDIA_MODEL = "meta/llama-3.3-70b-instruct"

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct:free"

SYSTEM_PROMPT = """You are an expert e-commerce copywriter who writes \
TikTok-style vertical video ad scripts. Use the AIDA framework (Attention, \
Interest, Desire, Action). Hooks must be under 12 words and punchy. \
Voiceover lines must sound natural spoken aloud — short sentences, \
conversational, no corporate jargon. Reply with STRICT JSON only, no \
markdown fences, matching this schema:
{
  "hooks": ["hook1", "hook2", "hook3"],
  "angle": "one-line audience angle, e.g. 'gift buyers who want funny licensed apparel'",
  "scenes": {
    "title": {"headline": "product name as ad headline", "narration": "3-second opener line"},
    "showcase": {"caption": "on-screen caption", "narration": "8-second showcase line"},
    "description": {"overlay_text": "2-3 short benefit bullets as one string", "narration": "6-second benefit line"},
    "price_cta": {"narration": "5-second price + urgency line"},
    "product_loop": {"narration": "8-second closer line"}
  },
  "visual_directions": ["one-line visual idea per scene, 5 total"]
}"""


def _llm_copy(api_url, model, key, name, description, price_text, tag,
             extra_headers=None):
    """One OpenAI-compatible chat call. Returns brief or None on any failure."""
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": (
                f"Product: {name}\nDescription: {description}\n"
                f"Price: {price_text}\nWrite the ad brief.")},
        ],
        "temperature": 0.8,
    }).encode()
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    headers.update(extra_headers or {})
    req = urllib.request.Request(api_url, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode())
        text = data["choices"][0]["message"]["content"].strip()
        brief = json.loads(text)
        brief["source"] = tag
        return brief
    except Exception as e:
        print(f"[copywriter] {tag} failed ({e}); trying next provider")
        return None


def _nvidia_copy(name, description, price_text):
    key = os.environ.get("NVIDIA_API_KEY", "").strip()
    if not key:
        return None
    return _llm_copy(NVIDIA_URL, NVIDIA_MODEL, key, name, description,
                     price_text, "nvidia")


def _openrouter_copy(name, description, price_text):
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        return None
    return _llm_copy(OPENROUTER_URL, OPENROUTER_MODEL, key, name, description,
                     price_text, "openrouter",
                     extra_headers={"HTTP-Referer": "http://localhost:8099",
                                    "X-Title": "Commercial Maker"})


def _template_copy(name, description, price_text):
    """Honest fallback: direct-response hook formulas, no LLM."""
    benefit = description.split(".")[0].strip() or "quality you can feel"
    short = name.split("Women's")[-1].split("Men's")[-1].strip() or name
    hooks = [
        f"Stop scrolling - {short} just dropped.",
        f"POV: you found the perfect {short}.",
        f"Nobody talks about this {short} enough.",
    ]
    return {
        "hooks": hooks,
        "angle": "impulse buyers scrolling for something fun and affordable",
        "scenes": {
            "title": {
                "headline": name,
                "narration": f"Introducing {name}.",
            },
            "showcase": {
                "caption": hooks[0],
                "narration": f"Look at this. {benefit}.",
            },
            "description": {
                "overlay_text": benefit,
                "narration": f"{benefit}. And it shows.",
            },
            "price_cta": {
                "narration": f"Only {price_text}. Grab yours before they're gone.",
            },
            "product_loop": {
                "narration": f"{name}. Only on Boss Listers.",
            },
        },
        "visual_directions": [
            "Bold title slam over product-colored backdrop",
            "Slow push-in on product photo",
            "Benefit text pops beside the product",
            "Price stamp with urgent flash",
            "Product loop with brand tagline",
        ],
        "source": "template",
    }


def write_copy(name, description, price, provider="auto"):
    """
    Returns a creative brief dict. brief["source"] is "nvidia",
    "openrouter", or "template". Tries providers in that order and uses
    the first one that works. Never raises.
    """
    name = (name or "Untitled Product").strip()
    description = (description or "High-quality product.").strip()
    try:
        price_text = f"${float(price):,.2f}"
    except (TypeError, ValueError):
        price_text = "$0.00"

    chain = {
        "auto": (_nvidia_copy, _openrouter_copy),
        "nvidia": (_nvidia_copy,),
        "openrouter": (_openrouter_copy,),
    }.get(provider, (_nvidia_copy, _openrouter_copy))

    for fn in chain:
        brief = fn(name, description, price_text)
        if brief:
            return brief
    return _template_copy(name, description, price_text)


if __name__ == "__main__":
    b = write_copy("White Castle Women's Boxshort",
                   "Happiness on a Bun. 95% polyester, 5% spandex.",
                   14.99)
    print(json.dumps(b, indent=2)[:800])
    print("source:", b["source"])
