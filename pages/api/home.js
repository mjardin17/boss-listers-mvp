// pages/api/home.js
// GET → the owner's main screen data: project status and what waits on Joshua. Owner only, read-only.
const { requireOwnerSession } = require("../../lib/requireSession");
const { readProjects } = require("../../lib/bibleFiles");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const session = await requireOwnerSession(req, res);
  if (!session) return;
  return res.status(200).json({ ok: true, home: readProjects() });
}
