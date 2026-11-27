// GET /api/channels/whatnot/status?live=true
// Returns Whatnot connection status from the shared WHATNOT_API_TOKEN
// personal access token (Seller Hub → Seller API). There is no per-tenant
// OAuth Connect button — the token is pasted into .env.local.
//
// ?live=true calls testConnection() (GET /users/me). Without it, this
// route only reports whether the env var is present.

const { WhatnotConnector } = require("../../../../lib/channels/apiConnectors");

const connector = new WhatnotConnector();

const { requireOwnerSession } = require("../../../../lib/requireSession");

export default async function handler(req, res) {
  const session = await requireOwnerSession(req, res);
  if (!session) return;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const status = req.query.live === "true"
      ? await connector.testConnection()
      : await connector.getConnectionStatus();
    return res.status(200).json({ ok: true, ...status });
  } catch (err) {
    console.error("[api/channels/whatnot/status]", err.message);
    return res.status(err.statusCode || 500).json({
      ok: false,
      error: err.message,
    });
  }
}
