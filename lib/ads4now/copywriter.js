/**
 * lib/ads4now/copywriter.js — AI Creative Director & Copywriter
 * Generates TikTok & Reels vertical video ad scripts using the AIDA framework
 * (Attention, Interest, Desire, Action) with 3 punchy hooks (<12 words),
 * audience angles, 5-scene narration scripts, and visual directions.
 */

const SYSTEM_PROMPT = `You are an expert e-commerce creative director who writes viral direct-response video ad scripts (for TikTok Shop, Instagram Reels, and YouTube Shorts).
Use the AIDA framework (Attention, Interest, Desire, Action).
Hooks must be under 12 words, punchy, and impossible to scroll past.
Voiceover narration lines must sound natural spoken aloud: conversational, high energy, no corporate fluff.
Reply with STRICT JSON ONLY, no markdown fences, matching this schema:
{
  "hooks": [
    "Punchy hook 1 (<12 words)",
    "Punchy hook 2 (<12 words)",
    "Punchy hook 3 (<12 words)"
  ],
  "angle": "one-line audience angle, e.g. 'impulse buyers looking for comfortable funny branded loungewear'",
  "scenes": {
    "title": { "headline": "Product name as headline", "narration": "3-second opening hook line" },
    "showcase": { "caption": "On-screen hook caption", "narration": "8-second showcase line explaining what makes it special" },
    "description": { "overlay_text": "2-3 short bullet benefits", "narration": "6-second key benefit narration" },
    "price_cta": { "narration": "5-second price urgency and call to action" },
    "product_loop": { "narration": "8-second closer brand loop" }
  },
  "visual_directions": [
    "Title hook slam over product-color backdrop",
    "360 degree product showcase rotation",
    "Key benefit text pop alongside product",
    "Price stamp with urgent flash",
    "Brand logo closer loop"
  ]
}`;

/**
 * Direct response formula fallback when no API key or network is available
 */
function templateCopy(name, description, priceText) {
  const cleanName = (name || "Featured Item").replace(/women's|men's|official/gi, "").trim() || name;
  const benefit = (description || "Quality craftsmanship you can feel").split(".")[0].trim();

  const hooks = [
    `Stop scrolling — ${cleanName} just dropped.`,
    `POV: You finally found the ultimate ${cleanName}.`,
    `Nobody talks about this ${cleanName} enough.`,
  ];

  return {
    hooks,
    angle: `Shoppers looking for premium, authentic ${cleanName} at an unbeatable price`,
    scenes: {
      title: {
        headline: name,
        narration: `Introducing the ${name}.`,
      },
      showcase: {
        caption: hooks[0],
        narration: `Look at the details on this. ${benefit}.`,
      },
      description: {
        overlay_text: benefit,
        narration: `${benefit}. Built for everyday style.`,
      },
      price_cta: {
        narration: `Only ${priceText}. Grab yours now before it sells out.`,
      },
      product_loop: {
        narration: `${name}. Curated, authentic, and available now on Boss Listers.`,
      },
    },
    visual_directions: [
      "Title hook slam over product-color backdrop",
      "360° turntable spin showcasing product textures",
      "Benefit pop with floating badge accent",
      "Flash price stamp with urgent call-to-action",
      "Finale closer loop with brand signature",
    ],
    source: "template",
  };
}

/**
 * Generate copy via OpenAI API
 */
async function openaiCopy(name, description, priceText) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Product: ${name}\nDescription: ${description}\nPrice: ${priceText}\nWrite the ad brief.`,
          },
        ],
        temperature: 0.8,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    parsed.source = "openai";
    return parsed;
  } catch (err) {
    console.warn("[copywriter] OpenAI call failed:", err.message);
    return null;
  }
}

/**
 * Generate copy via OpenRouter API
 */
async function openrouterCopy(name, description, priceText) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.trim() === "") return null;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3001",
        "X-Title": "Boss Listers",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct:free",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Product: ${name}\nDescription: ${description}\nPrice: ${priceText}\nWrite the ad brief.`,
          },
        ],
        temperature: 0.8,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const cleaned = content.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned);
    parsed.source = "openrouter";
    return parsed;
  } catch (err) {
    console.warn("[copywriter] OpenRouter call failed:", err.message);
    return null;
  }
}

/**
 * Main copywriter function: tries OpenAI -> OpenRouter -> Direct-Response Template
 */
async function writeCopy(productInfo) {
  const { name = "Product", description = "", price = 0 } = productInfo || {};
  const priceNum = typeof price === "number" ? price : parseFloat(price) || 0;
  const priceText = `$${priceNum.toFixed(2)}`;

  // 1. Try OpenAI
  const aiBrief = await openaiCopy(name, description, priceText);
  if (aiBrief) return aiBrief;

  // 2. Try OpenRouter
  const orBrief = await openrouterCopy(name, description, priceText);
  if (orBrief) return orBrief;

  // 3. Fallback to proven direct-response formulas
  return templateCopy(name, description, priceText);
}

module.exports = {
  writeCopy,
  templateCopy,
};
