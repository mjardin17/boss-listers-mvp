#!/usr/bin/env python3
"""
pipeline.py — the full ads4now pipeline, one call, every stage LOUD.

Stages:
  1. ingest   — product URL scrape (+ review harvesting) or manual entry
  2. copy     — LLM creative brief (nvidia -> openrouter -> template)
  3. cutout   — RMBG-1.4 background removal, before/after returned
  4. scenes   — diffusion cinematic backgrounds (Pollinations/Flux),
                fallback to product-graded gradients, always announced
  5. mission  — render mission per creative variant (hook variants)
  6. voice+render — TTS + FFmpeg assembly, 9:16 and/or 1:1

Nothing fails silently: every stage reports exactly what happened and
what it fell back to. Returns a result dict with all artifacts.
"""

import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from lib.url_ingest import ingest_product_url
from lib.copywriter import write_copy
from lib.bg_style import style_backgrounds_for_product, extract_palette
from lib.scene_gen import generate_scene_backgrounds
from lib.commercial_generator import create_commercial_mission


def _rgb_to_hex(rgb):
    return "#%02x%02x%02x" % tuple(int(c) for c in rgb)


class Pipeline:
    def __init__(self, workdir, log=print):
        self.workdir = workdir
        self.log = log
        os.makedirs(workdir, exist_ok=True)
        self.result = {
            "stages": {},
            "cutout_before": None,
            "cutout_after": None,
            "scene_images": [],
            "videos": [],
            "errors": [],
        }

    def stage(self, name, msg):
        self.log(f"[{name}] {msg}")
        self.result["stages"][name] = msg

    # ── 1. ingest ──────────────────────────────────────────────────────
    def ingest(self, product_url="", name="", description="", price="",
               image_path="", dest_dir="uploads"):
        os.makedirs(dest_dir, exist_ok=True)
        reviews = {}
        if product_url:
            self.stage("ingest", f"pulling product from URL: {product_url}")
            ing = ingest_product_url(product_url, dest_dir)
            name = name or ing["name"]
            description = description or ing["description"]
            price = price or ing["price"]
            if not image_path:
                image_path = ing["image_path"]
            reviews = ing.get("reviews") or {}
            if reviews.get("rating"):
                self.stage("ingest",
                           f"found social proof: {reviews['rating']} stars"
                           + (f" ({reviews.get('count')} reviews)"
                              if reviews.get("count") else ""))
            else:
                self.stage("ingest", "no review data on page (skipped honestly)")
        if not (name and description and price and image_path):
            raise RuntimeError(
                "need a product URL or all of: name, description, price, photo")
        self.stage("ingest", f"product: {name} @ {price}")
        self.result["cutout_before"] = image_path
        return {"name": name, "description": description, "price": price,
                "image_path": image_path, "reviews": reviews}

    # ── 2. copy ────────────────────────────────────────────────────────
    def copy(self, product):
        self.stage("copy", "creative director is writing your ad...")
        brief = write_copy(product["name"], product["description"],
                           product["price"])
        src = brief.get("source", "template")
        label = {"nvidia": "NVIDIA Llama 3.3 70B",
                 "openrouter": "OpenRouter Llama 3.3 70B",
                 "template": "built-in direct-response formulas"}[src]
        self.stage("copy", f"script written by {label}")
        self.stage("copy", f"hook: \"{(brief.get('hooks') or [''])[0]}\"")
        self.stage("copy", f"angle: {brief.get('angle')}")
        return brief

    # ── 3. cutout ──────────────────────────────────────────────────────
    def cutout(self, product):
        """Background removal. LOUD: returns path or None + explicit reason."""
        self.stage("cutout", "removing the product background (RMBG-1.4)...")
        try:
            from lib.bg_remove import remove_background
            dst = os.path.join(self.workdir, "cutout.png")
            remove_background(product["image_path"], dst)
            kept = self._cutout_coverage(dst)
            self.result["cutout_after"] = dst
            if kept is not None and kept > 0.85:
                self.stage("cutout",
                           f"removal kept {kept:.0%} of the photo — this shot "
                           f"has a hand/clutter the model can't separate. "
                           f"A clean product photo cuts much better.")
            elif kept is not None:
                self.stage("cutout",
                           f"background REMOVED (kept {kept:.0%} of photo) — "
                           f"product floats free")
            else:
                self.stage("cutout", "background REMOVED — product floats free")
            return dst
        except Exception as e:  # noqa: BLE001
            reason = str(e)
            self.stage("cutout", f"BACKGROUND REMOVAL FAILED: {reason}")
            self.stage("cutout",
                       "continuing with the photo card — install torch + "
                       "transformers for the cutout look")
            self.result["errors"].append(f"cutout: {reason}")
            return None

    @staticmethod
    def _cutout_coverage(cutout_path):
        """Fraction of the photo the mask kept (1.0 = removed nothing)."""
        try:
            from PIL import Image
            import numpy as np
            a = np.array(Image.open(cutout_path).convert("RGBA").split()[3],
                         dtype=np.float32)
            return float(a.mean() / 255.0)
        except Exception:
            return None

    # ── 4. scenes ──────────────────────────────────────────────────────
    def scenes(self, product, brief, aspect, hf_token=None, gemini_key=None):
        self.stage("scenes", "dreaming cinematic AI backdrops...")
        try:
            pal = extract_palette(product["image_path"])
            product["palette"] = [_rgb_to_hex(c) for c in pal]
        except Exception:
            product["palette"] = []
        dest = os.path.join(self.workdir, "scenes")
        try:
            paths = generate_scene_backgrounds(
                product, brief, dest, aspect=aspect, log=self.log,
                hf_token=hf_token, gemini_key=gemini_key)
            self.stage("scenes",
                       "5 AI scene backdrops generated — product stays "
                       "untouched, composited on top")
        except Exception as e:  # noqa: BLE001
            self.stage("scenes", f"AI scenes unavailable ({e})")
            self.stage("scenes",
                       "falling back to product-color-graded studio backdrops "
                       "(add HF_TOKEN or GEMINI_API_KEY for AI scenes)")
            style_backgrounds_for_product(product["image_path"], dest)
            paths = {s: os.path.join(dest, f)
                     for s, f in [("title", "bg-hook.jpg"),
                                  ("showcase", "bg-showcase.jpg"),
                                  ("description", "bg-features.jpg"),
                                  ("price_cta", "bg-cta.jpg"),
                                  ("product_loop", "bg-proof.jpg")]}
            self.result["errors"].append(f"scenes: {e}")
        self.result["scene_images"] = [paths[s] for s in
                                       ("title", "showcase", "description",
                                        "price_cta", "product_loop")
                                       if s in paths]
        return dest

    # ── 5+6. mission + render ───────────────────────────────────────────
    def render_variant(self, product, brief, hook, cutout_path, bg_dir,
                       aspect, idx):
        sku = re.sub(r"\W+", "", product.get("sku") or "SKU")[:12] or "SKU"
        mission_id = (f"commercial-{sku}-v{idx + 1}-"
                      f"{time.strftime('%Y%m%d%H%M%S')}")
        mission = create_commercial_mission(
            name=product["name"], description=product["description"],
            price=product["price"], images=[product["image_path"]],
            mission_id=mission_id, copy=brief,
            reviews=product.get("reviews"), hook=hook)
        if cutout_path:
            mission["product"]["cutout"] = cutout_path
        script_path = os.path.join(self.workdir, f"mission-v{idx + 1}.json")
        with open(script_path, "w") as fh:
            json.dump(mission, fh)
        tag = aspect.replace(":", "x")
        out_name = (f"commercial_{sku}_{tag}_v{idx + 1}_"
                    f"{time.strftime('%Y%m%d_%H%M%S')}.mp4")
        out_path = os.path.join(self.workdir, out_name)
        self.stage("render",
                   f"variant {idx + 1}: voiceover + assembling {aspect} video...")
        cmd = [sys.executable, os.path.join(ROOT, "render_commercial.py"),
               "--script", script_path, "--out", out_path,
               "--bg-dir", bg_dir, "--aspect", aspect]
        if cutout_path:
            cmd += ["--cutout", cutout_path]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, text=True)
        for line in proc.stdout:
            line = line.rstrip()
            if "[tts]" in line and "scene" in line:
                self.log(f"  {line.strip()}")
            elif "[cutout]" in line:
                self.log("  ✂️ " + line.replace("[cutout]", "").strip())
            elif "[vid] scene" in line and "done" in line:
                self.log(f"  {line.strip()}")
        proc.wait()
        if proc.returncode != 0 or not os.path.exists(out_path):
            raise RuntimeError("renderer failed (see log above)")
        self.stage("render", f"variant {idx + 1} done -> {out_name}")
        self.result["videos"].append(out_path)
        return out_path

    # ── full run ───────────────────────────────────────────────────────
    def run(self, product_url="", name="", description="", price="",
            image_path="", sku="", aspect="9:16", variants=1,
            uploads_dir="uploads", hf_token=None, gemini_key=None):
        product = self.ingest(product_url, name, description, price,
                              image_path, uploads_dir)
        product["sku"] = sku
        brief = self.copy(product)
        cutout_path = self.cutout(product)
        bg_dir = self.scenes(product, brief, aspect, hf_token, gemini_key)

        hooks = (brief.get("hooks") or [])[:max(1, variants)]
        while len(hooks) < variants:
            hooks.append(hooks[0] if hooks else "Premium quality")
        for i, hook in enumerate(hooks[:variants]):
            if variants > 1:
                self.stage("variant", f"creative variant {i + 1}/{variants}: "
                                      f"\"{hook}\"")
            self.render_variant(product, brief, hook, cutout_path, bg_dir,
                                aspect, i)
        self.stage("done",
                   f"finished: {len(self.result['videos'])} video(s), "
                   f"{'cutout' if cutout_path else 'photo card'} look, "
                   f"{aspect}")
        self.result["product"] = product
        self.result["brief"] = brief
        return self.result
