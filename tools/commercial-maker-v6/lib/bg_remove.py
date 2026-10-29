"""
Background removal for the Commercial Maker.

Uses Bria's RMBG-1.4 (BiRefNet) via HuggingFace transformers — open source,
runs on CPU, no API key, no cost. First run downloads the model weights
(~1GB) to the HuggingFace cache; after that it's fully offline.

remove_background(src, dst) -> dst
    src: product photo path (jpg/png)
    dst: transparent PNG path (RGBA, background removed)

Raises RuntimeError with a clear message if torch/transformers isn't
installed or the model can't load — callers should fall back to the
plain product card in that case.
"""

from pathlib import Path
import os

# httpx (used by huggingface_hub) crashes parsing bracketed IPv6 entries
# like [::1] in no_proxy ("Invalid port: ':1]'"). Strip those entries;
# plain hostnames/IPs keep working fine.
for _k in ("no_proxy", "NO_PROXY"):
    _v = os.environ.get(_k)
    if _v:
        os.environ[_k] = ",".join(
            p for p in _v.split(",") if not (p.startswith("[") and "]" in p))

_MODEL = None


def _load_model():
    global _MODEL
    if _MODEL is not None:
        return _MODEL
    try:
        import torch
        import transformers
        from transformers import AutoModelForImageSegmentation
        # Compatibility patch for RMBG-1.4 with modern transformers
        if not hasattr(transformers.PreTrainedModel, "all_tied_weights_keys"):
            transformers.PreTrainedModel.all_tied_weights_keys = {}
    except ImportError as e:
        raise RuntimeError(
            "background removal needs torch + transformers: "
            "pip install torch transformers (torch CPU build is fine)") from e
    print("[bg_remove] loading RMBG-1.4 (first run downloads weights)...")
    _MODEL = AutoModelForImageSegmentation.from_pretrained(
        "briaai/RMBG-1.4", trust_remote_code=True)
    _MODEL.eval()
    return _MODEL


def remove_background(src, dst, size=1024):
    """Remove the background; write a transparent PNG to dst. Returns dst."""
    from PIL import Image
    import numpy as np
    import torch

    model = _load_model()
    src = Path(src)
    img = Image.open(src).convert("RGB")
    orig = img.size

    # Manual preprocessing (avoids the torchvision dependency).
    small = img.resize((size, size), Image.BILINEAR)
    arr = np.asarray(small).astype(np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    arr = (arr - mean) / std
    inp = torch.from_numpy(arr.transpose(2, 0, 1)).unsqueeze(0).float()

    with torch.no_grad():
        out = model(inp)
    # BriaRMBG.forward returns ([sigmoided masks d1..d6], [features]).
    # d6 (last mask) is the refined output; already in 0..1, no sigmoid.
    masks = out[0] if isinstance(out, (tuple, list)) else out
    pred = masks[-1] if isinstance(masks, (tuple, list)) else masks
    mask = pred[0, 0].cpu().numpy()
    mask = np.clip(mask, 0, 1)

    mask_img = Image.fromarray((mask * 255).astype(np.uint8), mode="L")
    mask_img = mask_img.resize(orig, Image.BILINEAR)

    rgba = img.copy()
    rgba.putalpha(mask_img)
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(dst)
    print(f"[bg_remove] cutout saved -> {dst}")
    return str(dst)
