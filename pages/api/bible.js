// pages/api/bible.js
// GET → the Bible files, owner only. Read-only.
const { requireOwnerSession } = require("../../lib/requireSession");
const { readBible } = require("../../lib/bibleFiles");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const session = await requireOwnerSession(req, res);
  if (!session) return;
  return res.status(200).json({ ok: true, files: readBible() });
}
