// pages/api/stock-alert-settings.js
// Per-tenant low-stock threshold and optional email preference.
const { loadEnvConfig } = require("@next/env");
const { requireSession } = require("../../lib/requireSession");
const { rest } = require("../../lib/supabaseRest");
const { validateThreshold, DEFAULT_STOCK_ALERT_THRESHOLD } = require("../../lib/stockAlerts");

const bad = (res, error, status = 400) => res.status(status).json({ ok: false, error });
const emailAvailable = () => Boolean(process.env.RESEND_API_KEY && process.env.STOCK_ALERT_FROM_EMAIL);

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "PUT") {
    res.setHeader("Allow", "GET, PUT");
    return bad(res, "Method not allowed", 405);
  }
  const session = await requireSession(req, res);
  if (!session) return;
  loadEnvConfig(process.cwd());
  res.setHeader("Cache-Control", "no-store");
  const filter = `tenant_id=eq.${encodeURIComponent(session.tenantId)}`;

  try {
    if (req.method === "GET") {
      const rows = await rest(process.env, "GET",
        `/stock_alert_settings?${filter}&select=threshold,email_enabled&limit=1`);
      const settings = rows[0] || { threshold: DEFAULT_STOCK_ALERT_THRESHOLD, email_enabled: false };
      return res.status(200).json({ ok: true, settings, emailAvailable: emailAvailable() });
    }

    const body = req.body || {};
    const checked = validateThreshold(body.threshold);
    if (!checked.ok) return bad(res, checked.error);
    if (typeof body.email_enabled !== "boolean") return bad(res, "email_enabled must be true or false");
    if (body.email_enabled && !emailAvailable()) {
      return bad(res, "Email alerts require RESEND_API_KEY and STOCK_ALERT_FROM_EMAIL on the server.", 409);
    }

    const existing = await rest(process.env, "GET",
      `/stock_alert_settings?${filter}&select=tenant_id&limit=1`);
    const values = { threshold: checked.threshold, email_enabled: body.email_enabled };
    if (existing.length) {
      await rest(process.env, "PATCH", `/stock_alert_settings?${filter}`, values);
    } else {
      await rest(process.env, "POST", "/stock_alert_settings", {
        tenant_id: session.tenantId,
        ...values,
      }, { Prefer: "return=minimal" });
    }

    // Re-evaluate all products immediately when the threshold changes.
    await rest(process.env, "POST", "/rpc/refresh_stock_alerts_for_tenant", {
      p_tenant_id: session.tenantId,
    });
    return res.status(200).json({ ok: true, settings: values, emailAvailable: emailAvailable() });
  } catch (error) {
    console.error("[api/stock-alert-settings]", error.message);
    return bad(res, "Stock alert settings could not be saved right now", 502);
  }
}
