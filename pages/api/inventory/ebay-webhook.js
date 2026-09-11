/**
 * POST /api/inventory/ebay-webhook
 * Webhook handler for eBay order events.
 * Updates inventory when products are sold on eBay or other marketplaces.
 *
 * eBay webhook events:
 * - ITEM_SOLD: Product sold on eBay
 * - INVENTORY_QUANTITY_CHANGED: Stock quantity updated
 * - LISTING_STATUS_CHANGED: Listing ended or quantity reached 0
 *
 * Security:
 * - Verifies eBay signature using EBAY_WEBHOOK_VERIFY_TOKEN
 * - Challenge endpoint: responds with verification token
 *
 * Note: This endpoint runs without auth (eBay posts directly to it)
 * so we rely entirely on the webhook signature for security.
 */

const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EBAY_WEBHOOK_VERIFY_TOKEN = process.env.EBAY_WEBHOOK_VERIFY_TOKEN;

/**
 * Execute Supabase REST query with service role.
 *
 * @private
 */
async function rest(path, options = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error("Supabase not configured");
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
    const err = new Error(
      `Supabase ${options.method || "GET"} ${path} (HTTP ${res.status}): ${detail}`
    );
    err.statusCode = res.status;
    throw err;
  }

  return res.status === 204 ? null : res.json();
}

/**
 * Verify eBay webhook signature.
 * eBay signs the request body with an HMAC-SHA256 signature in the
 * X-EBAY-SIGNATURE header.
 *
 * @private
 */
function verifyEbaySignature(body, signature, secret) {
  if (!secret || !signature) {
    return false;
  }

  const hash = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64");

  return hash === signature;
}

/**
 * Handle an eBay order/inventory event.
 * Updates local inventory quantity based on eBay changes.
 *
 * @private
 */
async function handleEvent(event) {
  const eventType = event.eventType;
  const resourcePath = event.resource?.path || "";

  console.log(`[ebay-webhook] Handling event type: ${eventType}`);

  if (eventType === "ITEM_SOLD") {
    // Item sold on eBay: decrement quantity
    return await handleItemSold(event);
  } else if (eventType === "INVENTORY_QUANTITY_CHANGED") {
    // Inventory quantity changed: update quantity
    return await handleQuantityChanged(event);
  } else if (eventType === "LISTING_STATUS_CHANGED") {
    // Listing ended or out of stock: mark as inactive
    return await handleListingStatusChanged(event);
  }

  console.log(`[ebay-webhook] Unhandled event type: ${eventType}`);
  return { handled: false };
}

/**
 * Handle ITEM_SOLD event: Decrement inventory.
 *
 * @private
 */
async function handleItemSold(event) {
  // eBay provides sku in the payload
  const sku = event.resource?.sku;
  const quantity = event.resource?.quantity || 1;

  if (!sku) {
    console.warn("[ebay-webhook] ITEM_SOLD event missing SKU");
    return { handled: false, error: "Missing SKU" };
  }

  try {
    // Fetch product to get current quantity
    const products = await rest(
      `products?sku=eq.${encodeURIComponent(sku)}&select=id,quantity,tenant_id&limit=1`
    );

    if (!products || !products.length) {
      console.warn(`[ebay-webhook] Product not found for SKU: ${sku}`);
      return { handled: false, error: "Product not found" };
    }

    const product = products[0];
    const newQuantity = Math.max(0, product.quantity - quantity);

    // Update product quantity
    await rest(`products?id=eq.${product.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        quantity: newQuantity,
        last_ebay_quantity: newQuantity,
        synced_at: new Date().toISOString(),
      }),
    });

    console.log(
      `[ebay-webhook] Decremented ${sku} quantity: ${product.quantity} -> ${newQuantity}`
    );

    // Record webhook event
    await rest("webhook_events", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: product.tenant_id,
        event_type: "ITEM_SOLD",
        sku,
        quantity_change: -quantity,
        new_quantity: newQuantity,
        processed_at: new Date().toISOString(),
      }),
    });

    return { handled: true, sku, quantityDecremented: quantity };
  } catch (err) {
    console.error(
      `[ebay-webhook] Error handling ITEM_SOLD for ${sku}:`,
      err.message
    );
    return { handled: false, error: err.message };
  }
}

/**
 * Handle INVENTORY_QUANTITY_CHANGED event: Update quantity.
 *
 * @private
 */
async function handleQuantityChanged(event) {
  const sku = event.resource?.sku;
  const newQuantity = event.resource?.quantity;

  if (!sku || newQuantity === undefined) {
    console.warn("[ebay-webhook] QUANTITY_CHANGED missing SKU or quantity");
    return { handled: false, error: "Missing data" };
  }

  try {
    const products = await rest(
      `products?sku=eq.${encodeURIComponent(sku)}&select=id,quantity,tenant_id&limit=1`
    );

    if (!products || !products.length) {
      return { handled: false, error: "Product not found" };
    }

    const product = products[0];
    const oldQuantity = product.quantity;

    await rest(`products?id=eq.${product.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        quantity: newQuantity,
        last_ebay_quantity: newQuantity,
        synced_at: new Date().toISOString(),
      }),
    });

    console.log(
      `[ebay-webhook] Updated ${sku} quantity: ${oldQuantity} -> ${newQuantity}`
    );

    return {
      handled: true,
      sku,
      oldQuantity,
      newQuantity,
    };
  } catch (err) {
    console.error(
      `[ebay-webhook] Error handling QUANTITY_CHANGED for ${sku}:`,
      err.message
    );
    return { handled: false, error: err.message };
  }
}

/**
 * Handle LISTING_STATUS_CHANGED: Mark as ended.
 *
 * @private
 */
async function handleListingStatusChanged(event) {
  const sku = event.resource?.sku;
  const status = event.resource?.status;

  if (!sku || !status) {
    return { handled: false, error: "Missing data" };
  }

  const statusMap = {
    ENDED: "ended",
    OUT_OF_STOCK: "out_of_stock",
  };

  const newStatus = statusMap[status] || "ended";

  try {
    const products = await rest(
      `products?sku=eq.${encodeURIComponent(sku)}&select=id&limit=1`
    );

    if (!products || !products.length) {
      return { handled: false };
    }

    await rest(`products?id=eq.${products[0].id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: newStatus,
        synced_at: new Date().toISOString(),
      }),
    });

    console.log(`[ebay-webhook] Marked ${sku} as ${newStatus}`);
    return { handled: true, sku, status: newStatus };
  } catch (err) {
    console.error(
      `[ebay-webhook] Error handling LISTING_STATUS_CHANGED for ${sku}:`,
      err.message
    );
    return { handled: false, error: err.message };
  }
}

export default async function handler(req, res) {
  // Handle webhook challenge (eBay verification)
  if (req.method === "GET") {
    const challenge = req.query.challenge_code;
    if (!challenge) {
      return res.status(400).json({ error: "Missing challenge_code" });
    }

    // Respond with the challenge code to verify the endpoint
    res.setHeader("X-EBAY-SIGNATURE", EBAY_WEBHOOK_VERIFY_TOKEN);
    return res.status(200).send(challenge);
  }

  // Handle webhook events
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    // Verify signature
    const signature = req.headers["x-ebay-signature"];
    const bodyString = JSON.stringify(req.body);

    if (!verifyEbaySignature(bodyString, signature, EBAY_WEBHOOK_VERIFY_TOKEN)) {
      console.warn("[ebay-webhook] Invalid signature");
      return res.status(401).json({
        ok: false,
        error: "Invalid signature",
      });
    }

    const event = req.body;
    const result = await handleEvent(event);

    // Always return 200 to eBay to acknowledge receipt
    return res.status(200).json({
      ok: true,
      handled: result.handled,
      eventType: event.eventType,
    });
  } catch (err) {
    console.error("[ebay-webhook] Unhandled error:", err.message);
    // Still return 200 to prevent eBay retries
    return res.status(200).json({
      ok: false,
      error: err.message,
    });
  }
}
