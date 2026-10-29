"""
listing_photo.py: eBay-style listing photo from a background-removed cutout.

Takes the transparent PNG from bg_remove.remove_background() and places the
product, centered and large, on a pure white square canvas. This is the
marketplace-style product shot (the one eBay and Shopify listings use).

    from lib.listing_photo import make_white_listing
    make_white_listing("work/cutout.png", "work/listing.jpg")
"""

from PIL import Image

LISTING_SIZE = 1600      # square, big enough for zoom on marketplaces
FILL = 0.88              # product fills up to 88% of the canvas on its longest side


def make_white_listing(cutout_path, out_path, size=LISTING_SIZE, fill=FILL):
    """Center the cutout on pure white; return out_path."""
    cut = Image.open(cutout_path).convert("RGBA")
    bbox = cut.getbbox()          # trim transparent margins first
    if bbox:
        cut = cut.crop(bbox)
    scale = min(size * fill / cut.width, size * fill / cut.height)
    cut = cut.resize((max(1, int(cut.width * scale)), max(1, int(cut.height * scale))), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    x, y = (size - cut.width) // 2, (size - cut.height) // 2
    canvas.paste(cut.convert("RGB"), (x, y), cut.split()[3])
    canvas.save(out_path, quality=95)
    return out_path
