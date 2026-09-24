// POST /api/omni-lister/save
// Saves extracted Omni-Lister product directly to Supabase products table

const { createClient } = require("@supabase/supabase-js");
const { ensurePublicUrl } = require("../../../lib/supabaseStorage");

const DEFAULT_TENANT_ID = "f6ec6132-2cd0-4352-81e9-3c76d955b60d"; // Joshua's tenant

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { product: rawProduct, item, tenantId, lane, source } = req.body || {};
    const product = rawProduct || item;

    if (!product || !product.title) {
      return res.status(400).json({
        ok: false,
        error: "Product data with at least a title is required.",
      });
    }

    const targetTenantId = tenantId || DEFAULT_TENANT_ID;
    const sku = product.sku || `OL-${Date.now().toString(36).toUpperCase()}`;

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let descriptionText = product.description || (product.materials ? `Materials: ${product.materials}. ${product.care_instructions || ''}` : product.title);

    // If styleframe video or keyframes exist, append media metadata block
    if (product.styleframe_video || (Array.isArray(product.keyframes) && product.keyframes.length > 0)) {
      const mediaMeta = {
        styleframe_video: product.styleframe_video || null,
        keyframes: product.keyframes || [],
      };
      descriptionText = `${descriptionText}\n\n<!-- STYLEFRAME_MEDIA: ${JSON.stringify(mediaMeta)} -->`;
    }

    // If card metadata exists, append card metadata block
    const cardMeta = product.metadata || product.card_metadata || req.body?.metadata;
    if (cardMeta) {
      descriptionText = `${descriptionText}\n\n<!-- CARD_METADATA: ${JSON.stringify(cardMeta)} -->`;
    }

    const rawImageUrl = product.image_url || (Array.isArray(product.keyframes) && (product.keyframes[0]?.url || product.keyframes[0]?.dataUrl)) || null;
    const resolvedImageUrl = await ensurePublicUrl(rawImageUrl);

    const inventoryRow = {
      tenant_id: targetTenantId,
      sku: sku,
      title: product.title,
      description: descriptionText,
      price: typeof product.price === "number" ? product.price : parseFloat(product.price) || 0.0,
      quantity: product.quantity_available ? parseInt(product.quantity_available, 10) : (product.quantity ? parseInt(product.quantity, 10) : 1),
      image_url: resolvedImageUrl,
      condition: product.condition || "new",
      status: "active",
      source: "manual",
      published: false,
    };

    const { data, error } = await supabase
      .from("products")
      .upsert(inventoryRow, { onConflict: "tenant_id,sku" })
      .select()
      .single();

    if (error) {
      console.error("[omni-lister/save] Supabase error:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({
      ok: true,
      message: "Product saved to inventory",
      product: data,
    });
  } catch (err) {
    console.error("[omni-lister/save] Error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
