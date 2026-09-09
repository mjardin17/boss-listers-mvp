// pages/api/sync/sku/[sku]/sync-now.js
// POST /api/sync/sku/:sku/sync-now
// Force sync a specific SKU immediately

import { SyncEngine } from "../../../../lib/syncEngine";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { sku } = req.query;
  if (!sku) {
    return res.status(400).json({ ok: false, error: "SKU is required" });
  }

  // Require auth (boss_lister role)
  const authHeader = req.headers.authorization || "";
  const userAccessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!userAccessToken) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const engine = new SyncEngine();
    console.log(`[api/sync/sku/${sku}/sync-now] Starting single-SKU sync...`);

    const result = await engine.execute({ targetSku: sku });

    // Write sync details to database
    await engine._writeSyncDetails();

    console.log(`[api/sync/sku/${sku}/sync-now] Sync complete:`, result.summary);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error(`[api/sync/sku/${sku}/sync-now] Sync failed:`, err.message);
    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}
