// GET /api/price-signals?title=...
// Extra price evidence for the Capture screen, each kept separate and labelled:
//  - ownSales: the seller's own eBay sales of the same item (last 60 days)
//  - web: what Google results say, with their source links
// Never a made-up number: anything that can't be read comes back null with a note.
const { requireSession } = require("../../lib/requireSession");
const { ownSales, matchOwnSales } = require("../../lib/ownSoldHistory");
const { googleSearch } = require("../../lib/itemPriceSearch");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const session = await requireSession(req, res);
  if (!session) return;
  const title = String(req.query.title || "").trim().slice(0, 200);
  if (title.length < 3) return res.status(400).json({ ok: false, error: "title is required" });

  const [own, web] = await Promise.all([
    ownSales(session.tenantId)
      .then((sales) => ({ ok: true, matches: matchOwnSales(title, sales).slice(0, 10) }))
      .catch(() => ({ ok: false, matches: [], note: "Your eBay sales could not be read right now" })),
    googleSearch(`${title} sold price`).catch(() => null),
  ]);
  return res.status(200).json({ ok: true, ownSales: own, web });
}
