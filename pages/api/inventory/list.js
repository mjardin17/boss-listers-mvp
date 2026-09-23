// GET /api/inventory/list
// Returns all inventory items with sync status

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function rest(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    const err = new Error("Supabase not configured");
    err.statusCode = 503;
    throw err;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    const err = new Error(`Supabase failed (${res.status}): ${detail}`);
    err.statusCode = 502;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    // Build query with optional filters
    let query = "products?select=id,sku,title,price,quantity,image_url,source,condition,sync_status,synced_to,last_synced_at,ebay_item_id,external_ids";

    const { source, syncStatus } = req.query;

    const filters = [];
    if (source && source !== "all") {
      filters.push(`source.eq.${encodeURIComponent(source)}`);
    }
    if (syncStatus && syncStatus !== "all") {
      filters.push(`sync_status.eq.${encodeURIComponent(syncStatus)}`);
    }

    if (filters.length > 0) {
      query += "&" + filters.join("&");
    }

    query += "&order=updated_at.desc&limit=500";

    const products = await rest(query);

    // Transform products to include parsed JSON fields
    const items = (products || []).map((p) => ({
      id: p.id,
      sku: p.sku,
      title: p.title,
      price: p.price,
      quantity: p.quantity,
      imageUrl: p.image_url,
      source: p.source,
      condition: p.condition,
      syncStatus: p.sync_status,
      syncedTo: typeof p.synced_to === "string" ? JSON.parse(p.synced_to || "[]") : p.synced_to || [],
      lastSyncedAt: p.last_synced_at,
      ebayItemId: p.ebay_item_id,
      externalIds: typeof p.external_ids === "string" ? JSON.parse(p.external_ids || "{}") : p.external_ids || {},
    }));

    return res.status(200).json({
      ok: true,
      items,
      count: items.length,
    });
  } catch (err) {
    console.error("[inventory/list]", err.message);
    const status = err.statusCode || 500;
    return res.status(status).json({ ok: false, error: err.message });
  }
}
