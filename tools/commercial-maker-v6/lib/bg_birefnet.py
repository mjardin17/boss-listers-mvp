"""
bg_birefnet.py: background removal with BiRefNet (MIT license, commercial use OK).

Same contract as bg_remove.remove_background(): writes a transparent PNG and returns its path.
Keeps the photo's aspect ratio (no squashing) and runs the model at a fixed long side.

    from lib.bg_birefnet import remove_background_birefnet
    remove_background_birefnet("in.jpg", "out.png")
"""

from __future__ import annotations

import os
from pathlib import Path

# Same httpx/no_proxy workaround as bg_remove.py.
for _k in ("no_proxy", "NO_PROXY"):
    _v = os.environ.get(_k)
    if _v:
        os.environ[_k] = ",".join(p for p in _v.split(",") if not (p.startswith("[") and "]" in p))

MODEL_ID = "ZhengPeng7/BiRefNet"
LONG_SIDE = 1024          # model input long side; must be a multiple of 32
_MODEL = None


def _load():
    global _MODEL
    if _MODEL is not None:
        return _MODEL
    import transformers
    from transformers import AutoModelForImageSegmentation
    import torch

    # Compatibility patch, same as bg_remove.py (transformers 5.x).
    if not hasattr(transformers.PreTrainedModel, "all_tied_weights_keys"):
        transformers.PreTrainedModel.all_tied_weights_keys = {}
    print("[birefnet] loading BiRefNet (first run downloads weights)...")
    model = AutoModelForImageSegmentation.from_pretrained(MODEL_ID, trust_remote_code=True)
    model = model.float().eval()    # weights ship as fp16; CPU inference needs fp32
    _MODEL = (model, torch)
    return _MODEL


def remove_background_birefnet(src, dst, long_side=LONG_SIDE):
    from PIL import Image
    import numpy as np

    model, torch = _load()
    img = Image.open(src).convert("RGB")
    w, h = img.size
    scale = long_side / max(w, h)
    nw, nh = max(32, int(round(w * scale / 32)) * 32), max(32, int(round(h * scale / 32)) * 32)
    small = img.resize((nw, nh), Image.BILINEAR)

    arr = np.asarray(small).astype(np.float32) / 255.0
    arr = (arr - np.array([0.485, 0.456, 0.406], np.float32)) / np.array([0.229, 0.224, 0.225], np.float32)
    inp = torch.from_numpy(arr.transpose(2, 0, 1)).unsqueeze(0).float()

    with torch.no_grad():
        out = model(inp)
    pred = out[-1] if isinstance(out, (list, tuple)) else out
    mask = pred.sigmoid()[0, 0].cpu().numpy()

    mask_img = Image.fromarray((np.clip(mask, 0, 1) * 255).astype(np.uint8), "L").resize((w, h), Image.BILINEAR)
    rgba = img.copy()
    rgba.putalpha(mask_img)
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(dst)
    print(f"[birefnet] cutout saved -> {dst}")
    return str(dst)
