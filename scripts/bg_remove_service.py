#!/usr/bin/env python3
"""
scripts/bg_remove_service.py
Local sidecar service & CLI for Commercial Maker v6 background removal (RMBG-1.4).

Usage:
  1. As HTTP Sidecar:
     python scripts/bg_remove_service.py --serve --port 8765

  2. As One-Shot CLI:
     python scripts/bg_remove_service.py --input public/wc-shorts.jpg --output public/cutouts/wc-shorts-cutout.png
"""

import sys
import os
import time
import json
import base64
import argparse
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

# Add commercial-maker-v6 to path to import v6's exact bg_remove engine
v6_dir = Path(r"C:\Users\jjard\claude\commercial-maker-v6")
sys.path.insert(0, str(v6_dir))

from lib.bg_remove import remove_background

def process_cutout(input_path, output_path):
    """Run RMBG-1.4 background removal and compute coverage statistics."""
    from PIL import Image
    import numpy as np

    input_path = Path(input_path).resolve()
    output_path = Path(output_path).resolve()

    start_time = time.time()
    remove_background(str(input_path), str(output_path))
    elapsed = round(time.time() - start_time, 2)

    # Calculate alpha coverage
    with Image.open(output_path) as img:
        rgba = img.convert("RGBA")
        width, height = rgba.size
        alpha = np.array(rgba.split()[-1])
        total_pixels = alpha.size
        # Visible foreground pixels (alpha > 128)
        foreground_pixels = int(np.count_nonzero(alpha > 128))
        any_alpha_pixels = int(np.count_nonzero(alpha > 10))
        coverage_pct = round((foreground_pixels / total_pixels) * 100, 2)
        loose_coverage_pct = round((any_alpha_pixels / total_pixels) * 100, 2)

    return {
        "ok": True,
        "input_path": str(input_path),
        "output_path": str(output_path),
        "width": width,
        "height": height,
        "elapsed_sec": elapsed,
        "foreground_pixels": foreground_pixels,
        "total_pixels": total_pixels,
        "coverage_pct": coverage_pct,
        "loose_coverage_pct": loose_coverage_pct,
    }


class BgRemoveHandler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"status": "ok", "engine": "RMBG-1.4 (Commercial Maker v6)"})
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/remove-bg":
            return self._send_json(404, {"error": "Not found"})

        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_length).decode("utf-8"))

            input_path = body.get("input_path")
            image_base64 = body.get("image_base64")
            output_path = body.get("output_path")

            if not output_path:
                output_path = Path("public/cutouts") / f"cutout-{int(time.time()*1000)}.png"

            output_path = Path(output_path)
            output_path.parent.mkdir(parents=True, exist_ok=True)

            if image_base64:
                temp_in = output_path.parent / f"temp-{int(time.time()*1000)}.jpg"
                with open(temp_in, "wb") as f:
                    f.write(base64.b64decode(image_base64))
                input_path = temp_in

            if not input_path or not Path(input_path).exists():
                return self._send_json(400, {"ok": False, "error": f"Input file not found: {input_path}"})

            result = process_cutout(input_path, output_path)

            # Web-accessible URL relative to public dir
            try:
                rel = Path(output_path).resolve().relative_to(Path("public").resolve())
                result["url"] = f"/{rel.as_posix()}"
            except Exception:
                result["url"] = f"/cutouts/{Path(output_path).name}"

            self._send_json(200, result)

        except Exception as e:
            self._send_json(500, {"ok": False, "error": str(e)})


def main():
    parser = argparse.ArgumentParser(description="Commercial Maker v6 RMBG-1.4 Service")
    parser.add_argument("--serve", action="store_true", help="Run HTTP sidecar server")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on")
    parser.add_argument("--input", type=str, help="Input image path for CLI run")
    parser.add_argument("--output", type=str, help="Output PNG path for CLI run")

    args = parser.parse_args()

    if args.serve:
        server = HTTPServer(("127.0.0.1", args.port), BgRemoveHandler)
        print(f"[bg_remove_service] Running on http://127.0.0.1:{args.port}")
        server.serve_forever()
    elif args.input and args.output:
        res = process_cutout(args.input, args.output)
        print(json.dumps(res, indent=2))
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
