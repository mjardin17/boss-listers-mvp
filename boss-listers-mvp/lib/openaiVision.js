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

// Chunked base64 encoding — avoids O(n^2) string concat / call-stack limits
// from spreading a large Uint8Array into String.fromCharCode at once.
function bytesToBase64(bytes) {
  const CHUNK_SIZE = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

const VISION_PROMPT =
  'Identify the resale product in this image. Return only valid JSON with exactly these keys: {"productName":"","brand":"","category":"","conditionGuess":"","quantity":"","confidence":0,"summary":""}. "quantity" should describe whether this is a single item or a visible bundle/lot, "confidence" must be from 0 to 1, and "summary" should briefly explain the visible evidence and uncertainty. Use an empty string when uncertain.';

async function callVisionApi(apiKey, imageDataUrlValue, fetchImpl, model) {
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: VISION_PROMPT },
            { type: "input_image", image_url: imageDataUrlValue }
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

// Node/dev-mode path: reads from a filepath on disk (pages/api/analyze.js,
// local `next dev` only — never runs in the Cloudflare Workers deployment).
async function analyzeProductImage({
  fullpath,
  mimetype = "image/jpeg",
  fetchImpl = fetch
}) {
  if (!process.env.OPENAI_API_KEY) return null;
  return callVisionApi(
    process.env.OPENAI_API_KEY,
    imageDataUrl(fullpath, mimetype),
    fetchImpl,
    DEFAULT_MODEL
  );
}

// Workers-safe path: takes raw bytes directly (from request.formData()),
// no filesystem involved. Used by functions/api/analyze.js in production.
async function analyzeProductImageFromBytes({
  arrayBuffer,
  mimetype = "image/jpeg",
  apiKey,
  model = DEFAULT_MODEL,
  fetchImpl = fetch
}) {
  if (!apiKey) return null;
  const base64 = bytesToBase64(new Uint8Array(arrayBuffer));
  return callVisionApi(apiKey, `data:${mimetype};base64,${base64}`, fetchImpl, model);
}

module.exports = {
  analyzeProductImage,
  analyzeProductImageFromBytes,
  parseVisionPayload
};
