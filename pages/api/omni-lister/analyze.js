// POST /api/omni-lister/analyze
// Universal product analyzer: image scan OR product name/ASIN
// Uses open-source Llama-3.2-Vision via OpenRouter (free, local inference)
// Returns: structured product data (title, price, materials, sizes, etc.)

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
  },
};

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { type, file, query, imageBase64, imageMediaType } = req.body;

    if (!type || (type === "image" && !imageBase64) || (type === "text" && !query)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid payload. Provide type + (imageBase64 OR query)",
      });
    }

    let prompt = `Analyze this product and extract ALL structured information.

Return ONLY a JSON object with these fields (use null for missing):
{
  "title": "Product name",
  "brand": "Brand name",
  "sku": "SKU or product code",
  "upc": "UPC/Barcode",
  "asin": "Amazon ASIN if applicable",
  "price": "Price as number",
  "currency": "USD, GBP, etc.",
  "description": "Product description",
  "materials": "Material composition",
  "care_instructions": "Care/laundry instructions",
  "sizes": {"XS": "24-25", "S": "26-27", ...},
  "colors": ["color1", "color2"],
  "condition": "new, like-new, used",
  "origin": "Made in...",
  "features": ["feature1", "feature2"],
  "weight": "weight with unit",
  "dimensions": {"length": "10cm", "width": "5cm"},
  "category": "clothing, electronics, etc.",
  "quantity_available": "number or null"
}

IMPORTANT: Return ONLY valid JSON, no other text.`;

    let messageContent;

    if (type === "image") {
      messageContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageMediaType || "image/jpeg",
            data: imageBase64,
          },
        },
        {
          type: "text",
          text: prompt,
        },
      ];
    } else {
      // Text-based: product name or ASIN lookup
      messageContent = [
        {
          type: "text",
          text: `${prompt}\n\nProduct query: "${query}"\n\nIf this is an ASIN, look up common data for that product.`,
        },
      ];
    }

    // Use open-source Llama-3.2-Vision via OpenRouter
    const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://bosslitters.local",
        "X-Title": "BossListers Omni-Lister",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.2-11b-vision-instruct:free", // Free tier available
        messages: [
          {
            role: "user",
            content: messageContent,
          },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error("[omni-lister]", response.status, errorData);
      return res.status(response.status).json({
        ok: false,
        error: `OpenRouter error: ${response.status}`,
        detail: errorData,
      });
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content;

    if (!textContent) {
      return res.status(500).json({
        ok: false,
        error: "No response from model",
      });
    }

    let productData;
    try {
      productData = JSON.parse(textContent);
    } catch (err) {
      console.error("[omni-lister] Parse error:", textContent);
      return res.status(500).json({
        ok: false,
        error: "Failed to parse model response",
        rawResponse: textContent.slice(0, 500),
      });
    }

    return res.status(200).json({
      ok: true,
      product: productData,
      source: type === "image" ? "visual_scan" : "text_lookup",
      model: "llama-3.2-11b-vision",
    });
  } catch (err) {
    console.error("[omni-lister]", err.message);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}
