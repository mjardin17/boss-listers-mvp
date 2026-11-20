import { withSession } from "../../../lib/requireSessionApp";
import { identifyCard } from "../../../lib/cardIdentification";
import { getCardValuation } from "../../../lib/cardPricing";
import { enforceRateLimit } from "../../../lib/apiRuntime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = 9 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function hasValidImageSignature(bytes, mime) {
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function readImage(form, field, required) {
  const file = form.get(field);
  if (!file || typeof file.arrayBuffer !== "function") {
    if (required) throw Object.assign(new Error(`${field} photo is required.`), { status: 400 });
    return null;
  }
  if (!ALLOWED_MIME.has(file.type)) {
    throw Object.assign(new Error(`${field} photo must be JPEG, PNG, or WebP.`), { status: 415 });
  }
  if (!Number.isFinite(file.size) || file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error(`${field} photo must be between 1 byte and 4 MB.`), { status: 413 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!hasValidImageSignature(bytes, file.type)) {
    throw Object.assign(new Error(`${field} photo content does not match its declared image type.`), { status: 415 });
  }
  return { bytes, mime: file.type };
}

async function readBoundedRequest(request) {
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error("Photo upload body is required."), { status: 400 });
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw Object.assign(new Error("Combined photo upload exceeds 9 MB."), { status: 413 });
    }
    chunks.push(value);
  }
  return new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: Buffer.concat(chunks),
  });
}

async function handler(request, _context, session) {
  try {
    enforceRateLimit(`identify-card:${session.tenantId}:${session.userId}`);
    const bounded = await readBoundedRequest(request);
    const form = await bounded.formData();
    const front = await readImage(form, "front", true);
    const back = await readImage(form, "back", false);

    const identification = await identifyCard({
      frontBytes: front.bytes,
      frontMime: front.mime,
      backBytes: back?.bytes,
      backMime: back?.mime,
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_CARD_MODEL || "gemini-2.0-flash",
      fetchImpl: (url, options) => fetch(url, {
        ...options,
        signal: AbortSignal.timeout(45000),
      }),
    });

    let valuation = {
      status: "insufficient",
      low: null,
      market: null,
      high: null,
      confidenceScore: 0,
      provider: "pricecharting",
      matchedProduct: null,
      fetchedAt: new Date().toISOString(),
      explanation: "Confirm the card identity or connect an approved pricing-data provider.",
    };

    // Never price an ambiguous or unknown identity. The identification
    // module computes confidence from extracted evidence, not model claims.
    if (["confirmed", "likely"].includes(identification.status)) {
      valuation = await getCardValuation({
        fields: identification.fields,
        apiToken: process.env.PRICECHARTING_API_TOKEN,
        fetchImpl: (url, options) => fetch(url, {
          ...options,
          signal: AbortSignal.timeout(15000),
        }),
      });
    }

    return json({
      ok: true,
      identification: identification.status === "unknown" && identification.error
        ? { ...identification, error: "Card identification could not be completed. Check the AI provider configuration and try again." }
        : identification,
      valuation,
      requiresConfirmation: identification.status === "needs_review",
    });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    console.error("[identify-card] request failed:", status, status >= 500 ? "internal processing error" : error.message);
    return json({
      ok: false,
      error: status >= 500
        ? "Card identification is temporarily unavailable. Your photos were not saved."
        : error.message,
    }, status);
  }
}

export const POST = withSession(handler);
