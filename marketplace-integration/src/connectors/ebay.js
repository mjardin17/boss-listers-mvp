import { env } from '../config/env.js';

const BASE = env.ebayEnv === 'sandbox' ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';

/**
 * eBay Sell Inventory API connector.
 * 3-step listing flow: createInventoryItem -> createOffer -> publishOffer,
 * plus listInventory / getOffer for status monitoring.
 * Requires EBAY_CLIENT_ID + EBAY_CLIENT_SECRET (and an auth token issued to the app).
 */
async function request(path, { method = 'GET', body } = {}) {
  if (!env.ebay.clientId || !env.ebay.authToken) {
    return { ok: false, error: 'eBay not configured (missing client id / auth token)', status: 401 };
  }
  const headers = {
    Authorization: `Bearer ${env.ebay.authToken}`,
    'Content-Type': 'application/json',
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
  };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

/** Step 1 — create/update an inventory item (an SKU-level object). */
export function createInventoryItem(item) {
  return request(`/sell/inventory/v1/inventory_item/${encodeURIComponent(item.sku)}`, {
    method: 'PUT',
    body: item,
  });
}

/** Step 2 — create an offer against an inventory item. */
export function createOffer(offer) {
  return request('/sell/inventory/v1/offer', { method: 'POST', body: offer });
}

/** Step 3 — publish a draft offer to a marketplace. */
export function publishOffer(offerId) {
  return request(`/sell/inventory/v1/offer/${encodeURIComponent(offerId)}/publish`, { method: 'POST' });
}

/** List inventory (monitoring). */
export function listInventory() {
  return request('/sell/inventory/v1/inventory_item?limit=100');
}

/** Fetch a single offer (monitoring). */
export function getOffer(offerId) {
  return request(`/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`);
}

export const info = { name: 'eBay', access: 'open', configured: () => !!(env.ebay.clientId && env.ebay.authToken) };
