// GET /api/inventory
// Fetch all listings (products) for the authenticated user/tenant
// Supports pagination, search, and filtering
//
// POST /api/inventory
// Add a new product to inventory

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method === "GET") {
    return handleGet(req, res);
  } else if (req.method === "POST") {
    return handlePost(req, res);
  } else {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
}

async function handleGet(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const search = req.query.search?.trim() || "";

    const offset = (page - 1) * limit;

    // Build query
    let query = supabase
      .from("listings")
      .select("*", { count: "exact" });

    // Apply search filter
    if (search) {
      query = query.or(`sku.ilike.%${search}%,title.ilike.%${search}%`);
    }

    // Apply ordering and pagination
    const { data: listings, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[api/inventory] Query error:", error.message);
      return res.status(400).json({ ok: false, error: error.message });
    }

    // Enrich products with marketplace data
    const products = (listings || []).map(listing => ({
      sku: listing.sku,
      title: listing.title,
      description: listing.description || "",
      quantity: listing.quantity || 0,
      price: listing.price || 0,
      last_updated: listing.updated_at || listing.created_at,
      marketplaces: buildMarketplaceList(listing),
    }));

    return res.status(200).json({
      ok: true,
      products,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (err) {
    console.error("[api/inventory] Error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function handlePost(req, res) {
  try {
    const { sku, title, description, price, quantity } = req.body;

    // Validation
    if (!sku?.trim()) {
      return res.status(400).json({ ok: false, error: "SKU is required" });
    }
    if (!title?.trim()) {
      return res.status(400).json({ ok: false, error: "Title is required" });
    }
    if (typeof price !== "number" || price < 0) {
      return res.status(400).json({ ok: false, error: "Valid price is required" });
    }
    if (typeof quantity !== "number" || quantity < 0) {
      return res.status(400).json({ ok: false, error: "Valid quantity is required" });
    }

    // Check if SKU already exists
    const { data: existing } = await supabase
      .from("listings")
      .select("sku")
      .eq("sku", sku.trim())
      .single();

    if (existing) {
      return res.status(409).json({ ok: false, error: "SKU already exists. Use edit to update." });
    }

    // Insert new product
    const { data: product, error } = await supabase
      .from("listings")
      .insert([
        {
          sku: sku.trim(),
          title: title.trim(),
          description: description?.trim() || "",
          price: parseFloat(price),
          quantity: parseInt(quantity),
          status: "active",
          source: "manual",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("[api/inventory POST] Insert error:", error.message);
      return res.status(400).json({ ok: false, error: error.message });
    }

    return res.status(201).json({
      ok: true,
      product: {
        sku: product.sku,
        title: product.title,
        description: product.description,
        price: product.price,
        quantity: product.quantity,
        last_updated: product.updated_at,
      },
    });
  } catch (err) {
    console.error("[api/inventory POST] Error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

/**
 * Build marketplace list based on external_ids in listing
 */
function buildMarketplaceList(listing) {
  const marketplaces = [];
  const externalIds = listing.external_ids || {};

  if (externalIds.ebay) marketplaces.push("ebay");
  if (externalIds.etsy) marketplaces.push("etsy");
  if (externalIds.amazon) marketplaces.push("amazon");
  if (externalIds.facebook) marketplaces.push("facebook");
  if (externalIds.tiktok_shop) marketplaces.push("tiktok_shop");

  // If source is manual or no external IDs, mark as manual
  if (marketplaces.length === 0 && listing.source === "manual") {
    marketplaces.push("manual");
  }

  return marketplaces;
}
