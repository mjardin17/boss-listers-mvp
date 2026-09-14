// POST /api/listings
// Create a new listing from product info

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { productInfo, photoUrls } = req.body;

    if (!productInfo || !productInfo.title) {
      return res.status(400).json({ ok: false, error: "Product title required" });
    }

    // Create listing in Supabase
    const { data: listing, error } = await supabase
      .from("listings")
      .insert([
        {
          sku: productInfo.sku || `SKU-${Date.now()}`,
          title: productInfo.title,
          description: productInfo.description,
          price: productInfo.estimatedPrice || 0,
          quantity: 1,
          condition: productInfo.condition || "good",
          category: productInfo.category,
          image_paths: photoUrls || [],
          metadata: productInfo,
          status: "draft",
          source: "api",
        },
      ])
      .select();

    if (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }

    return res.status(201).json({
      ok: true,
      listingId: listing[0].id,
      listing: listing[0],
    });
  } catch (err) {
    console.error("[api/listings]", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
