// Local-only Card Factory bridge for a BossListers instance running on the desktop.
// This route is intentionally disabled in hosted deployments unless explicitly enabled.
// It never exposes the local service bearer token to the browser.
const { requireSession } = require("../../lib/requireSession");

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const LOCAL_SERVICE_URL = "http://127.0.0.1:8787";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readBoundedBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body exceeds 12 MB.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function bridgeEnabled() {
  return (
    process.env.CARD_FACTORY_LOCAL_BRIDGE_ENABLED === "true" &&
    typeof process.env.CARD_FACTORY_LOCAL_TOKEN === "string" &&
    process.env.CARD_FACTORY_LOCAL_TOKEN.length >= 32 &&
    typeof process.env.CARD_FACTORY_LOCAL_WORKSPACE_ID === "string" &&
    process.env.CARD_FACTORY_LOCAL_WORKSPACE_ID.trim().length > 0
  );
}

function belongsToLocalWorkspace(session) {
  const expected = String(process.env.CARD_FACTORY_LOCAL_WORKSPACE_ID || "").trim().toLowerCase();
  const actual = String(session?.tenantId || "").trim().toLowerCase();
  return Boolean(expected && actual && expected === actual);
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!bridgeEnabled()) {
    return res.status(404).json({ ok: false, error: "Local Card Factory is not enabled on this server." });
  }

  const session = await requireSession(req, res);
  if (!session) return;
  if (!belongsToLocalWorkspace(session)) {
    return res.status(403).json({ ok: false, error: "This account is not linked to the local Card Factory workspace." });
  }

  let url = LOCAL_SERVICE_URL + "/api/cards";
  const headers = {
    authorization: `Bearer ${process.env.CARD_FACTORY_LOCAL_TOKEN}`,
  };
  const init = {
    method: req.method,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  };

  try {
    if (req.method === "GET") {
      const limit = Number.parseInt(req.query?.limit, 10);
      if (Number.isFinite(limit)) {
        if (limit < 1 || limit > 100) return res.status(400).json({ ok: false, error: "Limit must be between 1 and 100." });
        url += `?limit=${limit}`;
      }
    } else {
      const contentType = String(req.headers["content-type"] || "").toLowerCase();
      if (!contentType.includes("application/json")) {
        return res.status(415).json({ ok: false, error: "Content-Type must be application/json." });
      }
      const body = await readBoundedBody(req);
      headers["content-type"] = "application/json";
      init.body = body;
    }

    const upstream = await fetch(url, init);
    const responseText = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(responseText);
    } catch {
      return res.status(502).json({ ok: false, error: "Local Card Factory returned an invalid response." });
    }
    return res.status(upstream.status).json(payload);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ ok: false, error: error.message });
    console.error("[card-factory-local-bridge] request failed:", error.message);
    return res.status(503).json({ ok: false, error: "Local Card Factory is not reachable. Start the desktop service and try again." });
  }
}

export default handler;
