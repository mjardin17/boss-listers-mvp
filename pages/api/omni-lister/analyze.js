// POST /api/omni-lister/analyze
// Universal product analyzer: image scan OR product name/ASIN
// Uses open-source Llama-3.2-Vision via OpenRouter (free tier: meta-llama/llama-3.2-11b-vision-instruct:free)
// Returns: structured product data (title, price, materials, sizes, etc.)

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
  },
};

const { requireSession } = require("../../../lib/requireSession");
const { enforceTenantRateLimit } = require("../../../lib/rateLimit");

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const session = await requireSession(req, res);
  if (!session) return;
  if (!enforceTenantRateLimit(session, res, "ai-analyze", { max: 20 })) return;

  try {
    const { type, query, imageBase64, imageMediaType } = req.body || {};

    if (
      (imageBase64 !== undefined && typeof imageBase64 !== "string") ||
      (query !== undefined && (typeof query !== "string" || query.length > 500))
    ) {
      return res.status(400).json({ ok: false, error: "Invalid payload." });
    }

    if (!type || (type === "image" && !imageBase64) || (type === "text" && !query)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid payload. Provide type + (imageBase64 OR query)",
      });
    }

    const hasOpenRouter = Boolean(OPENROUTER_API_KEY && OPENROUTER_API_KEY.trim().length > 0);
    const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 0);
    const hasKey = hasOpenRouter || hasClaude;

    // No key = no analysis. Never invent product data (titles, prices, UPCs):
    // a fabricated listing is worse than an honest error.
    if (!hasKey) {
      console.error("[omni-lister/analyze] neither OPENROUTER_API_KEY nor ANTHROPIC_API_KEY is configured");
      return res.status(503).json({ ok: false, error: "AI analysis is not configured on this server." });
    }

    const prompt = `Analyze this product and extract ALL structured information.

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
  "sizes": {"XS": "24-25", "S": "26-27"},
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
      messageContent = [
        {
          type: "text",
          text: `${prompt}\n\nProduct query: "${query}"\n\nIf this is an ASIN, look up common data for that product.`,
        },
      ];
    }

    // OpenRouter (Llama vision) when its key is set, otherwise Claude vision.
    let textContent;
    let modelName;
    if (hasOpenRouter) {
      modelName = "llama-3.2-11b-vision";
      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENROUTER_API_KEY.trim()}`,
          "HTTP-Referer": "https://bosslisters.local",
          "X-Title": "BossListers Omni-Lister",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.2-11b-vision-instruct:free",
          messages: [{ role: "user", content: messageContent }],
          temperature: 0.2,
          max_tokens: 1024,
        }),
      });
      if (!response.ok) {
        const errorData = await response.text();
        console.error("[omni-lister] upstream error", response.status, errorData);
        return res.status(502).json({
          ok: false,
          error: "Product analysis is temporarily unavailable. Please try again.",
        });
      }
      const data = await response.json();
      textContent = data.choices?.[0]?.message?.content;
    } else {
      modelName = process.env.ANTHROPIC_VISION_MODEL || "claude-sonnet-5-5";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": process.env.ANTHROPIC_API_KEY.trim(),
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          max_tokens: 1536,
          messages: [{ role: "user", content: messageContent }],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        const errorData = await response.text();
        console.error("[omni-lister] claude upstream error", response.status, errorData);
        return res.status(502).json({
          ok: false,
          error: "Product analysis is temporarily unavailable. Please try again.",
        });
      }
      const data = await response.json();
      textContent = (data.content || []).map((block) => block.text || "").join("\n");
    }

    if (!textContent) {
      console.error("[omni-lister] empty model response");
      return res.status(502).json({
        ok: false,
        error: "Product analysis returned no result. Please try again.",
      });
    }

    let cleanJson = textContent.trim();
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    }

    let productData;
    try {
      productData = JSON.parse(cleanJson);
    } catch (err) {
      console.error("[omni-lister] Parse error:", textContent);
      return res.status(502).json({
        ok: false,
        error: "Could not read the analysis result. Please try again.",
      });
    }

    return res.status(200).json({
      ok: true,
      product: productData,
      source: type === "image" ? "visual_scan" : "text_lookup",
      model: modelName,
    });
  } catch (err) {
    console.error("[omni-lister]", err.message);
    return res.status(500).json({
      ok: false,
      error: "Product analysis failed. Please try again.",
    });
  }
}
