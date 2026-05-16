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
      brand: typeof parsed.brand === "string" ? parsed.brand.trim() : ""
    };
  } catch {
    return { productName: "", brand: "" };
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
                'Identify the product in this image. Return only valid JSON with exactly these keys: {"productName":"","brand":""}. Use an empty string when uncertain.'
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
