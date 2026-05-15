// pages/api/listings.js
import { listListings, getListing, deleteListing, saveListing } from "../../lib/store";
import { generateForAll } from "../../lib/generator";

export default async function handler(req, res) {
  const { id, sessionId } = req.query;

  try {
    if (req.method === "GET") {
      if (id) {
        const item = await getListing(String(id));
        if (!item) return res.status(404).json({ ok: false, error: "Not found" });
        return res.status(200).json({ ok: true, item });
      }
      const items = await listListings(sessionId ? String(sessionId) : null);
      return res.status(200).json({ ok: true, items });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      let { input, outputs, sessionId: sid, imageUrls } = body;

      if (!outputs && input) {
        outputs = generateForAll(input);
      }

      if (!outputs?.length) {
        return res.status(400).json({ ok: false, error: "Missing listing data" });
      }

      const item = await saveListing({
        sessionId: sid || input?.sessionId || "anon",
        input: input || {},
        outputs,
        imageUrls: imageUrls || []
      });

      return res.status(201).json({ ok: true, item });
    }

    if (req.method === "DELETE") {
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      const removed = await deleteListing(String(id));
      if (!removed) return res.status(404).json({ ok: false, error: "Not found" });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("listings error", e);
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
}
