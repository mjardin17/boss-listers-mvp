// lib/requireSession.js
// One auth gate for every /api route (middleware.js excludes /api/* on the
// promise that each route enforces its own auth — this is that enforcement).
//
//   const session = await requireSession(req, res);
//   if (!session) return;            // a 401/503 response was already sent
//
// requireOwnerSession() additionally requires the caller to belong to the
// platform-owner tenant. Use it on any route that spends the SHARED server
// credentials (FB_ACCESS_TOKEN, IG_ACCESS_TOKEN, BONANZA_*, shared eBay token):
// otherwise any user who can sign up could post to the owner's accounts.

const { resolveSession } = require("./supabaseAuth");

async function requireSession(req, res) {
  const header = (req.headers && req.headers.authorization) || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return null;
  }
  let session = null;
  try {
    session = await resolveSession(process.env, token);
  } catch (err) {
    console.error("[requireSession] auth backend error:", err.message);
    res.status(503).json({ ok: false, error: "Auth temporarily unavailable" });
    return null;
  }
  if (!session) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return null;
  }
  return session;
}

async function requireOwnerSession(req, res) {
  const session = await requireSession(req, res);
  if (!session) return null;
  const ownerTenantId = process.env.PLATFORM_OWNER_TENANT_ID;
  if (!ownerTenantId || String(session.tenantId).toLowerCase() !== String(ownerTenantId).trim().toLowerCase()) {
    res.status(403).json({ ok: false, error: "Forbidden: this action uses the platform owner's shared accounts" });
    return null;
  }
  return session;
}

module.exports = { requireSession, requireOwnerSession };
