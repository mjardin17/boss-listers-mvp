// POST /api/stock-intake
// Draft-only intake for the Jardins Outpost Stock Photos page.
// Saves one item to the products table as an unpublished draft.
// Never calls any marketplace publisher.
//
// Required env (server-side only):
//   STOCK_INTAKE_KEY        shared secret the Stock Photos page sends in x-intake-key
//   STOCK_INTAKE_TENANT_ID  tenant that owns Stock Photos drafts

const { createClient } = require("@supabase/supabase-js");
const { ensurePublicUrl } = require("../../lib/supabaseStorage");

const REQUIRED_FIELDS = ["title", "sku", "price", "condition", "quantity"];

function checkIntakeKey(req) {
  const expected = process.env.STOCK_INTAKE_KEY;
  const given = req.headers["x-intake-key"];
  return Boolean(expected) && typeof given === "string" && given === expected;
}

function validateItem(item) {
  const missing = REQUIRED_FIELDS.filter((field) => item[field] === undefined || item[field] === "");
  if (missing.length) return `Missing required fields: ${missing.join(", ")}`;
  const price = Number(item.price);
  const quantity = Number.parseInt(item.quantity, 10);
  if (!Number.isFinite(price) || price < 0) return "Price must be a number of zero or more";
  if (!Number.isInteger(quantity) || quantity < 0) return "Quantity must be a whole number of zero or more";
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-intake-key");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!checkIntakeKey(req)) {
    return res.status(401).json({ ok: false, error: "Intake key missing or wrong" });
  }

  const tenantId = process.env.STOCK_INTAKE_TENANT_ID;
  if (!tenantId) {
    return res.status(500).json({ ok: false, error: "Stock intake is not configured on the server" });
  }

  const item = req.body || {};
  const problem = validateItem(item);
  if (problem) return res.status(400).json({ ok: false, error: problem });

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const imageUrl = await ensurePublicUrl(item.image_url || null);

    const row = {
      tenant_id: tenantId,
      sku: String(item.sku),
      title: String(item.title),
      description: item.description ? String(item.description) : String(item.title),
      price: Number(item.price),
      quantity: Number.parseInt(item.quantity, 10),
      image_url: imageUrl,
      condition: String(item.condition),
      status: "active",
      source: "manual",
      published: false,
    };

    const { data, error } = await supabase
      .from("products")
      .upsert(row, { onConflict: "tenant_id,sku" })
      .select()
      .single();

    if (error) {
      console.error("[stock-intake] Supabase error:", error);
      return res.status(500).json({ ok: false, error: "Failed to save draft" });
    }

    return res.status(200).json({ ok: true, message: "Saved as an unpublished draft", product: data });
  } catch (err) {
    console.error("[stock-intake] Error:", err.message);
    return res.status(500).json({ ok: false, error: "Failed to save draft" });
  }
}
