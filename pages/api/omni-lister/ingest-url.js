import { ingestProductUrl } from "../../../lib/ads4now/urlIngest";
import { UnsafeUrlError } from "../../../lib/safeFetch";

const { requireSession } = require("../../../lib/requireSession");
const { enforceTenantRateLimit } = require("../../../lib/rateLimit");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const session = await requireSession(req, res);
  if (!session) return;
  if (!enforceTenantRateLimit(session, res, "ingest-url", { max: 20 })) return;

  const { url, downloadImage = false } = req.body || {};

  if (!url || typeof url !== "string" || !url.trim() || url.length > 2048) {
    return res.status(400).json({ ok: false, error: "URL is required" });
  }

  try {
    const productData = await ingestProductUrl(url.trim(), {
      downloadImage: downloadImage === true,
      destDir: "public/uploads",
    });

    return res.status(200).json({
      ok: true,
      product: productData,
      reviews: productData.reviews || {},
    });
  } catch (err) {
    console.error("[api/omni-lister/ingest-url] Error:", err.message);
    if (err instanceof UnsafeUrlError) {
      return res.status(400).json({ ok: false, error: "That URL is not allowed" });
    }
    return res.status(500).json({ ok: false, error: "Failed to ingest product URL" });
  }
}
