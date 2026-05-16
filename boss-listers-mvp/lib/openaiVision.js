const fs = require("fs");

const DEFAULT_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

function stripCodeFence(value = "") {
  return String(value)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}

function parseVisionPayload(text) {
  try {
    const parsed = JSON.parse(stripCodeFence(text));
    return {
      productName:
        typeof parsed.productName === "string" ? parsed.productName.trim() : "",
      brand: typeof parsed.brand === "string" ? parsed.brand.trim() : "",
      category: typeof parsed.category === "string" ? parsed.category.trim() : "",
      conditionGuess:
        typeof parsed.conditionGuess === "string" ? parsed.conditionGuess.trim() : "",
      quantity:
        typeof parsed.quantity === "string" ? parsed.quantity.trim() : "",
      confidence:
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0,
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : ""
    };
  } catch {
    return {
      productName: "",
      brand: "",
      category: "",
      conditionGuess: "",
      quantity: "",
      confidence: 0,
      summary: ""
    };
  }
}

function imageDataUrl(fullpath, mimetype = "image/jpeg") {
  const base64 = fs.readFileSync(fullpath).toString("base64");
  return `data:${mimetype};base64,${base64}`;
}

async function analyzeProductImage({
  fullpath,
  mimetype = "image/jpeg",
  fetchImpl = fetch
}) {
  if (!process.env.OPENAI_API_KEY) return null;

  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                'Identify the resale product in this image. Return only valid JSON with exactly these keys: {"productName":"","brand":"","category":"","conditionGuess":"","quantity":"","confidence":0,"summary":""}. "quantity" should describe whether this is a single item or a visible bundle/lot, "confidence" must be from 0 to 1, and "summary" should briefly explain the visible evidence and uncertainty. Use an empty string when uncertain.'
            },
            {
              type: "input_image",
              image_url: imageDataUrl(fullpath, mimetype)
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI vision request failed (${response.status})`);
  }

  const data = await response.json();
  const text =
    data.output_text ||
    data.output
      ?.flatMap((item) => item.content || [])
      .map((item) => item.text || "")
      .join("\n") ||
    "";

  return parseVisionPayload(text);
}

module.exports = {
  analyzeProductImage,
  parseVisionPayload
};
