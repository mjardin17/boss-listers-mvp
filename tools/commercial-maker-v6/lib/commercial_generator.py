#!/usr/bin/env python3
"""
commercial_generator.py — Build commercial render missions for the Empire commercial maker.

This is the module that tools/bosslister_commercial_feeder.py imports:

    from lib.commercial_generator import create_commercial_mission

Mission layout (what render_commercial.py consumes):

    {
        "id": "commercial-<SKU>-<timestamp>",
        "type": "commercial",
        "status": "pending",
        "created_at": "<iso>",
        "product": {"sku":..., "name":..., "description":..., "price":..., "images":[...]},
        "render_script": {
            "width": 1080, "height": 1920, "fps": 30, "total_duration": 30,
            "scenes": [ {"id":1, "name":"title", "duration":3, ...}, ... ]
        }
    }
"""

from datetime import datetime

WIDTH, HEIGHT, FPS = 1080, 1920, 30

BRAND_TAGLINE = "Boss Listers: Curated, Affordable, Authentic"


def _parse_sku(mission_id: str) -> str:
    # commercial-<SKU>-<YYYYMMDDHHMMSS>  ->  <SKU>
    parts = mission_id.split("-")
    if len(parts) >= 3 and parts[0] == "commercial":
        return "-".join(parts[1:-1])
    return mission_id


def _money(price) -> str:
    try:
        return f"${float(price):,.2f}"
    except (TypeError, ValueError):
        return "$0.00"


def create_commercial_mission(name, description, price, images, mission_id, copy=None,
                            reviews=None, hook=None):
    """Create a 30-second, 5-scene vertical commercial mission for one product.

    copy: optional creative brief from lib.copywriter.write_copy(). When
    present, its hooks/scene scripts replace the verbatim description text.
    reviews: optional {"rating":..., "count":..., "quote":...} from
    url_ingest — feeds the social-proof line in the finale scene.
    hook: optional override for the showcase caption (creative variants).
    """
    name = (name or "Untitled Product").strip()
    description = (description or "High-quality product.").strip()
    images = list(images or [])
    price_str = _money(price)
    sku = _parse_sku(mission_id)
    scenes_copy = (copy or {}).get("scenes", {}) if isinstance(copy, dict) else {}

    def sc(key, field, default):
        return scenes_copy.get(key, {}).get(field) or default

    hooks = (copy or {}).get("hooks") or []
    showcase_caption = hook or sc("showcase", "caption", "Premium quality")

    # Social proof line for the finale scene.
    proof_text = BRAND_TAGLINE
    if isinstance(reviews, dict) and reviews.get("rating"):
        stars = "★" * int(round(float(reviews["rating"]))) if reviews["rating"].replace(".", "", 1).isdigit() else "★★★★★"
        count = reviews.get("count") or ""
        proof_text = f"{stars} {reviews['rating']}" + (f" · {count} reviews" if count else "")
    proof_quote = (reviews or {}).get("quote", "")

    try:
        price_val = float(price)
    except (TypeError, ValueError):
        price_val = 0.0

    scenes = [
        {
            "id": 1,
            "name": "title",
            "duration": 3.0,
            "headline": sc("title", "headline", name),
            "subhead": "Boss Listers",
            "narration": sc("title", "narration", None),
        },
        {
            "id": 2,
            "name": "showcase",
            "duration": 8.0,
            "image": images[0] if images else None,
            "caption": showcase_caption,
            "effect": "kenburns_zoom_in",
            "narration": sc("showcase", "narration", None),
            "music": "start",
        },
        {
            "id": 3,
            "name": "description",
            "duration": 6.0,
            "image": images[0] if images else None,
            "overlay_text": sc("description", "overlay_text", description),
            "effect": "kenburns_pan",
            "narration": sc("description", "narration", description),
        },
        {
            "id": 4,
            "name": "price_cta",
            "duration": 5.0,
            "price_text": price_str,
            "cta_text": "Buy Now",
            "store_text": "Available now on Boss Listers",
            "narration": sc("price_cta", "narration", f"Only {price_str}."),
        },
        {
            "id": 5,
            "name": "product_loop",
            "duration": 8.0,
            "image": images[0] if images else None,
            "tagline": proof_text,
            "proof_quote": proof_quote,
            "effect": "slow_zoom_loop",
            "narration": None,
            "music": "fade_out",
        },
    ]

    total = sum(s["duration"] for s in scenes)

    return {
        "id": mission_id,
        "type": "commercial",
        "status": "pending",
        "created_at": datetime.now().isoformat(),
        "product": {
            "sku": sku,
            "name": name,
            "description": description,
            "price": price_val,
            "price_text": price_str,
            "images": images,
            "social_proof": reviews or {},
        },
        "render_script": {
            "width": WIDTH,
            "height": HEIGHT,
            "fps": FPS,
            "total_duration": total,
            "scenes": scenes,
        },
    }


def mission_to_board_entry(mission):
    """Lightweight board entry wrapper (mission goes in MISSION_BOARD.json as-is)."""
    return mission
