// GET /empire/platforms: which selling sites have credentials set. Needs X-Empire-Key.
// Names only (never values) and no live calls to any selling site.
const { loadEnvConfig } = require("@next/env");
const { requireEmpireKey } = require("../../../lib/requireEmpireKey");
const { platformsReport } = require("../../../lib/empireContract");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  if (!requireEmpireKey(req, res)) return;
  loadEnvConfig(process.cwd());
  return res.status(200).json(platformsReport());
}
