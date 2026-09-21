import { ingestProductUrl } from "../../../lib/ads4now/urlIngest";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const { url, downloadImage = false } = req.body || {};

  if (!url || typeof url !== "string" || !url.trim()) {
    return res.status(400).json({ ok: false, error: "URL is required" });
  }

  try {
    const productData = await ingestProductUrl(url.trim(), {
      downloadImage,
      destDir: "public/uploads",
    });

    return res.status(200).json({
      ok: true,
      product: productData,
      reviews: productData.reviews || {},
    });
  } catch (err) {
    console.error("[api/omni-lister/ingest-url] Error:", err.message);
    return res.status(500).json({
      ok: false,
      error: err.message || "Failed to ingest product URL",
    });
  }
}
