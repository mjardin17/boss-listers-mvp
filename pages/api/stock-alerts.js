// pages/api/stock-alerts.js
// Tenant-scoped stock alert inbox. All database access is server-side and every query is tenant-filtered.
const { loadEnvConfig } = require("@next/env");
const { requireSession } = require("../../lib/requireSession");
const { rest } = require("../../lib/supabaseRest");
const { formatStockAlertEmail } = require("../../lib/stockAlerts");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bad = (res, error, status = 400) => res.status(status).json({ ok: false, error });
const tenantFilter = (tenantId) => `tenant_id=eq.${encodeURIComponent(tenantId)}`;

async function sendPendingEmails(session) {
  const env = process.env;
  if (!env.RESEND_API_KEY || !env.STOCK_ALERT_FROM_EMAIL || !session.email) {
    return { sent: 0, skipped: true };
  }
  const settings = await rest(env, "GET", `/stock_alert_settings?${tenantFilter(session.tenantId)}&select=email_enabled&limit=1`);
  if (!settings[0]?.email_enabled) return { sent: 0, skipped: true };

  const claimed = await rest(env, "POST", "/rpc/claim_stock_alert_emails", {
    p_tenant_id: session.tenantId,
    p_limit: 10,
  });
  let sent = 0;
  for (const alert of claimed || []) {
    try {
      const message = formatStockAlertEmail(alert);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `boss-stock-alert-${alert.id}`,
        },
        body: JSON.stringify({
          from: env.STOCK_ALERT_FROM_EMAIL,
          to: [session.email],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`);
      await rest(env, "PATCH", `/stock_alerts?id=eq.${encodeURIComponent(alert.id)}&${tenantFilter(session.tenantId)}`, {
        email_sent_at: new Date().toISOString(),
        email_claimed_at: null,
        email_error: null,
      });
      sent += 1;
    } catch (error) {
      console.error("[stock-alerts] email delivery failed:", error.message);
      await rest(env, "PATCH", `/stock_alerts?id=eq.${encodeURIComponent(alert.id)}&${tenantFilter(session.tenantId)}`, {
        email_claimed_at: null,
        email_error: "Email delivery failed; it can be retried.",
      }).catch((patchError) => console.error("[stock-alerts] could not release email claim:", patchError.message));
    }
  }
  return { sent, skipped: false };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return bad(res, "Method not allowed", 405);
  }
  const session = await requireSession(req, res);
  if (!session) return;
  loadEnvConfig(process.cwd());
  res.setHeader("Cache-Control", "no-store");

  try {
    const filter = tenantFilter(session.tenantId);
    if (req.method === "GET") {
      const rows = await rest(process.env, "GET",
        `/stock_alerts?${filter}&select=id,product_id,sku,product_title,quantity,threshold,status,prev_status,is_read,created_at,updated_at,restocked_at&order=created_at.desc&limit=100`);
      return res.status(200).json({
        ok: true,
        alerts: rows || [],
        unreadCount: (rows || []).filter((row) => row.status !== "archived" && !row.is_read).length,
      });
    }

    const body = req.body || {};
    const action = body.action;
    if (action === "send_pending_email") {
      const result = await sendPendingEmails(session);
      return res.status(200).json({ ok: true, ...result });
    }
    if (action === "mark_all_read") {
      await rest(process.env, "PATCH",
        `/stock_alerts?${filter}&status=neq.archived&is_read=eq.false`,
        { is_read: true });
      return res.status(200).json({ ok: true });
    }
    if (action === "clear_read") {
      const readRows = await rest(process.env, "GET",
        `/stock_alerts?${filter}&status=neq.archived&is_read=eq.true&select=id,status&limit=100`);
      for (const row of readRows || []) {
        await rest(process.env, "PATCH",
          `/stock_alerts?id=eq.${encodeURIComponent(row.id)}&${filter}`,
          { status: "archived", prev_status: row.status });
      }
      return res.status(200).json({ ok: true, archived: (readRows || []).length });
    }

    if (typeof body.id !== "string" || !UUID_RE.test(body.id)) return bad(res, "Choose a valid alert");
    const current = await rest(process.env, "GET",
      `/stock_alerts?id=eq.${encodeURIComponent(body.id)}&${filter}&select=id,status,prev_status&limit=1`);
    if (!current.length) return bad(res, "Alert not found", 404);
    let changes;
    if (action === "mark_read") changes = { is_read: true };
    else if (action === "mark_unread") changes = { is_read: false };
    else if (action === "archive") {
      if (current[0].status === "archived") return res.status(200).json({ ok: true });
      changes = { status: "archived", prev_status: current[0].status };
    } else if (action === "restore") {
      if (current[0].status !== "archived") return bad(res, "Only archived alerts can be restored");
      changes = { status: current[0].prev_status || "open", prev_status: null };
    } else return bad(res, "Unknown alert action");

    await rest(process.env, "PATCH",
      `/stock_alerts?id=eq.${encodeURIComponent(body.id)}&${filter}`, changes);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[api/stock-alerts]", error.message);
    return bad(res, "Stock alerts could not be loaded or updated right now", 502);
  }
}
