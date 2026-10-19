// lib/requireSessionApp.js
// Login gate for App Router route handlers (app/api/**/route.{js,ts}).
// Counterpart of lib/requireSession.js, which serves pages/api.
//
//   async function POST_handler(request, context, session) { ... }
//   export const POST = withSession(POST_handler);
//
// withOwnerSession() additionally requires the platform-owner tenant, for
// routes that spend the shared server credentials (FB/IG/Bonanza/eBay).

const { resolveSession } = require("./supabaseAuth");

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function sessionFromRequest(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return { error: json({ ok: false, error: "Unauthorized" }, 401) };
  try {
    const session = await resolveSession(process.env, token);
    if (!session) return { error: json({ ok: false, error: "Unauthorized" }, 401) };
    return { session };
  } catch (err) {
    console.error("[requireSessionApp] auth backend error:", err.message);
    return { error: json({ ok: false, error: "Auth temporarily unavailable" }, 503) };
  }
}

function withSession(handler) {
  return async function guarded(request, context) {
    const { session, error } = await sessionFromRequest(request);
    if (error) return error;
    return handler(request, context, session);
  };
}

function withOwnerSession(handler) {
  return withSession(async (request, context, session) => {
    const owner = process.env.PLATFORM_OWNER_TENANT_ID;
    if (!owner || String(session.tenantId).toLowerCase() !== String(owner).trim().toLowerCase()) {
      return json({ ok: false, error: "Forbidden: this action uses the platform owner's shared accounts" }, 403);
    }
    return handler(request, context, session);
  });
}

module.exports = { withSession, withOwnerSession, sessionFromRequest };
