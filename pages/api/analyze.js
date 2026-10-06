// POST /api/analyze  (multipart/form-data: photos[], optional barcode/upc, generate=true, ...)
// Thin HTTP wrapper over lib/analyzeService.js analyzeFormData(), which holds
// all the scan -> identify -> price -> listing logic. pages/capture.js is the
// caller; this route had been missing, so every capture scan 404'd.

import { Readable } from "stream";
import { randomUUID } from "crypto";
import { analyzeFormData, RequestValidationError } from "../../lib/analyzeService";

const { requireSession } = require("../../lib/requireSession");
const { enforceTenantRateLimit } = require("../../lib/rateLimit");

export const config = {
  api: { bodyParser: false, responseLimit: false },
};

// analyzeService enforces per-file (12MB) and total limits itself; this is the
// cheap outer cap so an oversized body is refused before it is buffered.
const MAX_REQUEST_BYTES = 60 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const session = await requireSession(req, res);
  if (!session) return;
  if (!enforceTenantRateLimit(session, res, "analyze", { max: 20 })) return;

  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    return res.status(415).json({ ok: false, error: "Send the photos as multipart/form-data." });
  }
  const requestBytes = Number(req.headers["content-length"] || 0);
  if (requestBytes > MAX_REQUEST_BYTES) {
    return res.status(413).json({ ok: false, error: "Upload is too large. Use compressed product photos." });
  }

  const requestId = randomUUID();
  try {
    const webRequest = new Request("http://localhost/api/analyze", {
      method: "POST",
      headers: { "content-type": contentType },
      body: Readable.toWeb(req),
      duplex: "half",
    });
    const formData = await webRequest.formData();

    const payload = await analyzeFormData(formData, {
      requestId,
      userId: session.userId,
      tenantId: session.tenantId,
      requestBytes,
    });
    return res.status(200).json(payload);
  } catch (err) {
    if (err instanceof RequestValidationError) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    console.error("[api/analyze]", requestId, err && err.message);
    return res.status(500).json({ ok: false, error: "Couldn't analyze these photos. Please try again." });
  }
}
