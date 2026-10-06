// POST /api/inventory/analyze-product-image
// Upload a product image (label, packaging, etc.)
// Claude vision AI extracts all product information
// Returns: SKU, title, price, sizes, materials, care instructions, UPC, etc.

import Anthropic from "@anthropic-ai/sdk";

const { requireSession } = require("../../../lib/requireSession");
const { enforceTenantRateLimit } = require("../../../lib/rateLimit");

const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

const client = new Anthropic();

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Auth required: every call spends paid Anthropic credits.
  const session = await requireSession(req, res);
  if (!session) return;
  if (!enforceTenantRateLimit(session, res, "ai-analyze", { max: 20 })) return;

  try {
    const { imageBase64, imageMediaType } = req.body || {};

    if (
      !imageBase64 ||
      typeof imageBase64 !== "string" ||
      !ALLOWED_MEDIA_TYPES.includes(imageMediaType)
    ) {
      return res.status(400).json({
        ok: false,
        error: "A base64 image and a valid imageMediaType (jpeg, png, gif, webp) are required",
      });
    }

    // Call Claude with vision to analyze product image
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_VISION_MODEL || "claude-sonnet-5-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: imageMediaType,
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: `Analyze this product image and extract ALL product information visible on the label/packaging.

Return ONLY a JSON object with these fields (use null for missing info):
{
  "title": "Product name/title",
  "brand": "Brand name",
  "sku": "SKU or product code",
  "upc": "UPC/Barcode number",
  "price": "Price if visible (as number)",
  "description": "Product description from label",
  "materials": "Material composition (e.g., 95% Polyester 5% Spandex)",
  "care_instructions": "Laundry/care instructions",
  "sizes": {
    "XS": "24-25",
    "S": "26-27",
    "M": "28-29",
    "L": "30-32",
    "XL": "33-35"
  },
  "origin": "Made in... (country)",
  "features": ["feature1", "feature2"],
  "quantity_per_package": "1PK, 2PK, etc"
}

IMPORTANT: Return ONLY the JSON object, no other text.`,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find((c) => c.type === "text");
    if (!textContent) {
      console.error("[analyze-product-image] no text block in response");
      return res.status(502).json({
        ok: false,
        error: "Image analysis returned no result. Please try again.",
      });
    }

    // Parse the JSON response
    let productData;
    try {
      productData = JSON.parse(textContent.text);
    } catch (err) {
      console.error("Failed to parse Claude response:", textContent.text.slice(0, 500));
      return res.status(502).json({
        ok: false,
        error: "Could not read product data from the image. Please try again.",
      });
    }

    return res.status(200).json({
      ok: true,
      product: productData,
      message: "Product information extracted successfully",
    });
  } catch (err) {
    console.error("[analyze-product-image]", err.message);
    return res.status(500).json({
      ok: false,
      error: "Image analysis failed. Please try again.",
    });
  }
}
