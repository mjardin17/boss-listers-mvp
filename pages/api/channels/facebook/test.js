// POST /api/channels/facebook/test
// Manual connection test: verifies FB_ACCESS_TOKEN + FB_PAGE_ID are valid.
// Used by the dashboard "Test Connection" button.

const { FacebookConnector } = require("../../../../lib/channels/apiConnectors");

const connector = new FacebookConnector();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const result = await connector.testConnection();
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/channels/facebook/test]", err.message);
    return res.status(err.statusCode || 500).json({
      ok: false,
      error: err.message,
    });
  }
}
