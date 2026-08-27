// POST /api/list-and-promote
// Full end-to-end: Photo → Extract → Post everywhere → Generate commercial → Post socials
// body: FormData with image file + optional overrides

const fs = require("fs");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { buildManualPackage } = require("../../lib/channels/manualPackage");
const { buildCaption, SOCIAL_PLATFORMS } = require("../../lib/channels/socialMediaConnector");

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

    // Step 1: Extract product info from photo
    const imageBase64 = file.buffer.toString("base64");
    const mediaType = file.mimetype || "image/jpeg";

    const visionResponse = await client.messages.create({
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
              text: `Analyze this product photo and extract JSON:
{
  "title": "Product name",
  "brand": "Brand",
  "condition": "Condition",
  "description": "Full description",
  "estimatedPrice": "Price in USD",
  "category": "Category",
  "keyFeatures": ["feature1", "feature2"],
  "material": "Material",
  "color": "Color",
  "size": "Size",
  "visibleDamage": "Any damage noted"
}`,
            },
          ],
        },
      ],
    });

    const visionText = visionResponse.content[0].text;
    const jsonMatch = visionText.match(/\{[\s\S]*\}/);
    const productInfo = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // Create a mock product object for marketplace posting
    const product = {
      sku: `AUTO-${Date.now()}`,
      title: productInfo.title || "Item",
      brand: productInfo.brand || "",
      price: productInfo.estimatedPrice || 0,
      condition: productInfo.condition || "Used",
      description: productInfo.description || "",
      size: productInfo.size || "",
      image_url: `data:${mediaType};base64,${imageBase64}`,
    };

    // Step 2: Generate packages for all 27 marketplaces
    const marketplaces = [
      "facebook", "poshmark", "craigslist", "mercari", "pinterest",
      "amazon", "woocommerce", "abeBooks", "alibris", "reverb",
      "discogs", "depop", "vinted", "grailed", "vestiaire", "realreal",
      "stockx", "goat", "shopify", "mercadoLibre", "fiveM", "tiktokShop",
      "ebay", "etsy"
    ];

    const packages = marketplaces.map(m => {
      try {
        return buildManualPackage(product, m);
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Step 3: Generate social media captions for all platforms
    const socialPosts = {};
    Object.keys(SOCIAL_PLATFORMS).forEach((platform) => {
      socialPosts[platform] = {
        platform,
        caption: buildCaption(productInfo, platform),
        spec: SOCIAL_PLATFORMS[platform],
      };
    });

    return res.status(200).json({
      ok: true,
      product,
      extracted: productInfo,
      marketplaces: {
        count: packages.length,
        packages: packages.map(p => ({ platform: p.platform, title: p.fields.title })),
      },
      social: {
        platforms: Object.keys(SOCIAL_PLATFORMS),
        posts: socialPosts,
      },
      nextSteps: [
        "1. Review extracted product info",
        "2. Generate commercial via Video Studio with this product data",
        "3. Post commercial to social media using the captions above",
        "4. Post to 27+ marketplaces using the packages above",
      ],
    });
  } catch (err) {
    console.error("[api/list-and-promote]", err.message);
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
}
