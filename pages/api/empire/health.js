// GET /empire/health (rewritten from /empire/health in next.config.js). No key needed:
// Empire OS uses it to show whether Boss Listers is up. Reports what is set up, never values or data.
import fs from "fs-extra";
const { buildHealth } = require("../../../lib/empireContract");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  let dataDirWritable = true;
  try {
    await fs.ensureDir(process.env.DATA_DIR || "data");
    await fs.access(process.env.DATA_DIR || "data", fs.constants.W_OK);
  } catch {
    dataDirWritable = false;
  }
  const report = buildHealth({ dataDirWritable });
  return res.status(report.status === "unhealthy" ? 503 : 200).json(report);
}
