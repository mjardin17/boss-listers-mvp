// pages/api/channels/payhip/webhook.js
// Receives Payhip's webhook events (paid / refunded / subscription.*) and
// mirrors them into the shared `orders` table so Payhip sales show up
// alongside eBay/Etsy/Amazon in BossListers' order view.
//
// Payhip has no product-listing API (confirmed against payhip.com/api-reference
// — only coupons and license keys), so this is one-way: Payhip -> BossListers
// order log. Products must still be created manually in the Payhip dashboard.
//
// Auth: Payhip signs every webhook with `signature = sha256(apiKey)` — a
// static shared-secret check (not a per-payload HMAC), documented at
// help.payhip.com/article/115-webhooks. Confirms the request holds the
// account's real API key; still verify it before trusting the payload.
//
// Single-tenant for now: PAYHIP_TENANT_ID identifies which BossListers
// tenant owns this Payhip account, since Payhip has one global API key per
// account with no per-request tenant context of its own.

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const apiKey = process.env.PAYHIP_API_KEY;
  const tenantId = process.env.PAYHIP_TENANT_ID;
  if (!apiKey || !tenantId) {
    console.error("[payhip webhook] Missing PAYHIP_API_KEY or PAYHIP_TENANT_ID");
    return res.status(503).json({ ok: false, error: "Not configured" });
  }

  const body = req.body || {};
  const expectedSignature = crypto.createHash("sha256").update(apiKey).digest("hex");
  // timingSafeEqual (not !==) — this signature is a static hash of the API
  // key (per Payhip's docs), not a per-request HMAC, so it never changes
  // until the key is rotated. A non-constant-time string compare would let
  // an attacker recover it byte-by-byte via a timing attack and forge
  // paid/refunded events indefinitely. Length-check first: timingSafeEqual
  // throws on mismatched buffer lengths rather than returning false.
  // Validate hex format before Buffer.from: a non-hex string of the right
  // length (e.g. 64 "z" characters) would make Buffer.from("hex") silently
  // truncate at the first bad character, producing a shorter buffer than
  // expectedSignature's 32 bytes — timingSafeEqual throws (uncaught) on a
  // buffer-length mismatch rather than returning false, which would crash
  // this handler instead of rejecting the request cleanly.
  const providedSignature = typeof body.signature === "string" ? body.signature : "";
  const isHex = /^[0-9a-f]+$/i.test(providedSignature);
  const signatureValid =
    isHex &&
    providedSignature.length === expectedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(providedSignature, "hex"), Buffer.from(expectedSignature, "hex"));
  if (!signatureValid) {
    console.error("[payhip webhook] Signature mismatch — rejecting");
    return res.status(401).json({ ok: false, error: "Invalid signature" });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    if (body.type === "paid") {
      await handlePaid(supabase, tenantId, body);
    } else if (body.type === "refunded") {
      await handleRefunded(supabase, tenantId, body);
    } else {
      console.log(`[payhip webhook] Ignoring event type: ${body.type}`);
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[payhip webhook] Error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function handlePaid(supabase, tenantId, body) {
  const marketplaceOrderId = String(body.id);

  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("marketplace", "payhip")
    .eq("marketplace_order_id", marketplaceOrderId)
    .limit(1);
  if (existing && existing.length) {
    console.log(`[payhip webhook] Order ${marketplaceOrderId} already recorded — skipping`);
    return;
  }

  const totalPrice = typeof body.price === "number" ? body.price / 100 : 0;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      tenant_id: tenantId,
      marketplace: "payhip",
      marketplace_order_id: marketplaceOrderId,
      buyer_email: body.email || null,
      order_status: "paid",
      total_price: totalPrice,
    })
    .select()
    .single();
  if (orderError) throw orderError;

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length) {
    const rows = items.map((item) => ({
      order_id: order.id,
      tenant_id: tenantId,
      sku: item.product_id != null ? String(item.product_id) : null,
      title: item.product_name || "Payhip product",
      unit_price: typeof item.price === "number" ? item.price / 100 : totalPrice,
      quantity: item.quantity || 1,
      subtotal: typeof item.price === "number" ? (item.price / 100) * (item.quantity || 1) : totalPrice,
    }));
    const { error: itemsError } = await supabase.from("order_items").insert(rows);
    if (itemsError) throw itemsError;
  }

  console.log(`[payhip webhook] Recorded order ${marketplaceOrderId}`);
}

async function handleRefunded(supabase, tenantId, body) {
  const marketplaceOrderId = String(body.id);
  const { error } = await supabase
    .from("orders")
    .update({ order_status: "refunded" })
    .eq("tenant_id", tenantId)
    .eq("marketplace", "payhip")
    .eq("marketplace_order_id", marketplaceOrderId);
  if (error) throw error;
  console.log(`[payhip webhook] Marked order ${marketplaceOrderId} as refunded`);
}
