// POST /api/inventory/analyze-product-image
// Upload a product image (label, packaging, etc.)
// Claude vision AI extracts all product information
// Returns: SKU, title, price, sizes, materials, care instructions, UPC, etc.

import Anthropic from "@anthropic-ai/sdk";

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

  try {
    // No auth required - this is just image analysis, no database access

    const { imageBase64, imageMediaType } = req.body;

    if (!imageBase64 || !imageMediaType) {
      return res.status(400).json({
        ok: false,
        error: "imageBase64 and imageMediaType required",
      });
    }

    // Call Claude with vision to analyze product image
    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
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
      return res.status(500).json({
        ok: false,
        error: "No text response from Claude",
      });
    }

    // Parse the JSON response
    let productData;
    try {
      productData = JSON.parse(textContent.text);
    } catch (err) {
      console.error("Failed to parse Claude response:", textContent.text);
      return res.status(500).json({
        ok: false,
        error: "Failed to parse product data from image",
        rawResponse: textContent.text,
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
      error: err.message,
    });
  }
}
