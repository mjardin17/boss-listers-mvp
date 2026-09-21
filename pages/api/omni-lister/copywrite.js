import { writeCopy } from "../../../lib/ads4now/copywriter";
import { createCommercialMission } from "../../../lib/ads4now/commercialMission";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const {
    name = "Product",
    description = "",
    price = 0,
    sku = "SKU-ITEM",
    image_url = null,
    cutout_url = null,
    reviews = {},
    variantIndex = 0,
    aspect = "9:16",
  } = req.body || {};

  try {
    // 1. Generate AIDA Direct-Response Creative Brief
    const brief = await writeCopy({
      name,
      description,
      price,
      reviews,
    });

    // 2. Generate 5-Scene Commercial Mission with Creative Variants
    const mission = createCommercialMission(
      {
        title: name,
        description,
        price,
        sku,
        image_url,
        cutout_url,
        reviews,
      },
      brief,
      {
        hookVariantIndex: parseInt(variantIndex, 10) || 0,
        aspect,
      }
    );

    return res.status(200).json({
      ok: true,
      brief,
      mission,
      source: brief.source || "template",
    });
  } catch (err) {
    console.error("[api/omni-lister/copywrite] Error:", err.message);
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to generate ad copy and commercial mission",
    });
  }
}
