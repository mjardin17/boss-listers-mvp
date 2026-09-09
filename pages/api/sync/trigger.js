// pages/api/sync/trigger.js
// POST /api/sync/trigger
// Manually trigger a complete inventory sync across eBay and Etsy

import { SyncEngine } from "../../lib/syncEngine";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Require auth (boss_lister role)
  const authHeader = req.headers.authorization || "";
  const userAccessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!userAccessToken) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const engine = new SyncEngine();
    console.log("[api/sync/trigger] Starting manual sync...");

    const result = await engine.execute();

    // Write sync details to database
    await engine._writeSyncDetails();

    console.log("[api/sync/trigger] Sync complete:", result.summary);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/sync/trigger] Sync failed:", err.message);
    return res.status(500).json({
      ok: false,
      error: err.message,
      details: err.stack,
    });
  }
}
