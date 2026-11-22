// pages/api/lead/[slug].js
// PUBLIC lead capture for Business Center landing pages (/p/[slug]).
//
// Reviewed as intentionally public (listed in scripts/test-api-auth.js): a
// visitor filling in a landing-page form has no login. Protections instead:
//   - POST only, JSON body validated by LeadCaptureSchema (Zod)
//   - per-IP rate limit (lib/rateLimit.js)
//   - hidden "website" honeypot field: bots that fill it get a fake success
//   - consent is required; the page must belong to an ACTIVE campaign
//   - Idempotency-Key header replays the first result instead of duplicating
// It writes a lead into the CRM and an alert into the owner's inbox. The only
// outbound call is the optional owner alert (LEAD_ALERT_WEBHOOK_URL), with no
// personal details. It never contacts the visitor.

const { enforceRateLimit } = require("../../../lib/rateLimit");
const { captureLead, pushLeadAlert } = require("../../../lib/universal-creative/business-center.js");
const { ZodError } = require("zod");

const MAX_BODY_KEYS = 10;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!enforceRateLimit(req, res)) return;

  const slug = typeof req.query.slug === "string" ? req.query.slug : "";
  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (Object.keys(body).length > MAX_BODY_KEYS) {
    return res.status(400).json({ ok: false, error: "Too many fields" });
  }
  if (body.website) {
    // Honeypot tripped: pretend success, store nothing.
    return res.status(200).json({ ok: true });
  }

  const rawKey = req.headers["idempotency-key"];
  const idempotencyKey = typeof rawKey === "string" && rawKey.length <= 100 ? rawKey : undefined;

  try {
    const { website, ...fields } = body;
    const result = captureLead(slug, fields, idempotencyKey);
    if (!result.replayed && result.alertId) {
      const push = await pushLeadAlert(result.alertId);
      if (!push.sent && push.reason !== "not configured") console.warn("[lead-capture] alert push:", push.reason);
    }
    // Do not echo CRM ids to the public.
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ ok: false, error: "Please check the form fields." });
    }
    if (/Consent/.test(err.message)) {
      return res.status(400).json({ ok: false, error: "Please tick the consent box." });
    }
    if (/Page not found/.test(err.message)) {
      return res.status(404).json({ ok: false, error: "This page is not available." });
    }
    console.error("[lead-capture] failed:", err.message);
    return res.status(500).json({ ok: false, error: "Something went wrong. Please try again." });
  }
}
