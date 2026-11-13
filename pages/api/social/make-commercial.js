// pages/api/social/make-commercial.js
// Owner session only.
//   GET  → the items a commercial can be made for (live eBay items).
//   POST → make one commercial for { sku } as a local file in public/commercials.
// It posts nothing and uploads nothing. Posting is a separate step in post-video.js.

const { loadEnvConfig } = require("@next/env");
const { requireOwnerSession } = require("../../../lib/requireSession");
const { listInventory, getProductForCommercial } = require("../../../lib/supabaseInventory");
const { makeCommercial } = require("../../../lib/commercialMaker");

const SKU_RULE = /^[A-Za-z0-9._-]{1,80}$/;
let isMaking = false; // one render at a time: each one uses the whole machine for a minute or two

export const config = { maxDuration: 600 };

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const session = await requireOwnerSession(req, res);
  if (!session) return;
  loadEnvConfig(process.cwd());

  try {
    if (req.method === "GET") {
      const rows = await listInventory(session.tenantId);
      const items = rows
        .filter((r) => r.status === "active" && Number(r.price) > 0)
        .map((r) => ({ sku: r.sku, title: r.title, price: Number(r.price) }));
      return res.status(200).json({ ok: true, items });
    }

    const sku = req.body && req.body.sku;
    if (typeof sku !== "string" || !SKU_RULE.test(sku)) {
      return res.status(400).json({ ok: false, error: "Choose an item" });
    }
    if (isMaking) {
      return res.status(409).json({ ok: false, error: "A commercial is already being made. Try again in a minute." });
    }
    isMaking = true;
    try {
      const product = await getProductForCommercial(session.tenantId, sku);
      const made = await makeCommercial(product);
      if (!made.ok) return res.status(400).json({ ok: false, error: made.error });
      return res.status(200).json({ ok: true, commercial: { name: made.name, bytes: made.bytes }, posted: false });
    } finally {
      isMaking = false;
    }
  } catch (err) {
    console.error("[api/social/make-commercial]", err.message);
    return res.status(err.statusCode || 500).json({ ok: false, error: "The commercial could not be made" });
  }
}
