// POST /api/extract-from-photo
// body: FormData with image file
// Extracts product info from photo using Claude Vision

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ ok: false, error: "No image file provided" });
    }

    const imageBase64 = file.buffer.toString("base64");
    const mediaType = file.mimetype || "image/jpeg";

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
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: `Analyze this product photo and extract the following information in JSON format:
{
  "title": "Product name/model",
  "brand": "Brand name",
  "condition": "New/Like New/Good/Fair/Poor",
  "description": "2-3 sentences describing the item, features, and condition",
  "estimatedPrice": "Estimated selling price in USD",
  "category": "Product category (electronics/fashion/furniture/etc)",
  "keyFeatures": ["feature1", "feature2", "feature3"],
  "material": "Primary material if visible",
  "color": "Color(s)",
  "size": "Size if visible",
  "visibleDamage": "Any damage, wear, or imperfections noted"
}

Be specific and factual based only on what you see in the photo. If something cannot be determined, use null.`,
            },
          ],
        },
      ],
    });

    const content = response.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return res.status(200).json({
      ok: true,
      extracted,
      rawResponse: content,
    });
  } catch (err) {
    console.error("[api/extract-from-photo]", err.message);
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
}
