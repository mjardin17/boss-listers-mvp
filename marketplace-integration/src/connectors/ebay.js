import { env } from '../config/env.js';

// NOTE: this connector is NOT the canonical eBay listing implementation for
// this organization. lib/ebay_listing.py in the video-bot-pipeline repo is —
// it has 24 passing tests (incl. regressions for Infinity/NaN prices, banker's
// rounding, missing images), defaults to dry_run=True before any live call,
// and raises a named error at whichever step fails instead of returning
// {ok:false} silently. This file exists for Boss Listers (Node) callers that
// can't shell out to Python. Keep it a thin, faithful mirror of the 3-call
// flow — do not grow independent validation/business logic here, or the two
// clients will drift and only one of them will get bugfixes.

// .env.example defines these flat, same as every other connector in this
// scaffold (etsy.js, depop.js, mercari.js, whatnot.js all read process.env.X
// directly) — there is no nested env.ebay object anywhere in this codebase.
const SANDBOX = String(process.env.EBAY_SANDBOX).toLowerCase() === 'true';
const BASE = SANDBOX ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';

/**
 * eBay Sell Inventory API connector.
 * 3-step listing flow: createInventoryItem -> createOffer -> publishOffer,
 * plus listInventory / getOffer for status monitoring.
 * Requires EBAY_AUTH_TOKEN — a user access token with the sell.inventory
 * scope, already issued. This connector does not perform the OAuth exchange
 * itself (see docs/02-auth-flows.md / src/auth/oauth.js for that).
 */
async function request(path, { method = 'GET', body, contentLanguage = false } = {}) {
  const token = process.env.EBAY_AUTH_TOKEN;
  if (!token) {
    return { ok: false, error: 'eBay not configured (missing EBAY_AUTH_TOKEN)', status: 401 };
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
  };
  if (contentLanguage) {
    // Required by createOrReplaceInventoryItem specifically. Omitting it
    // returns a 400 whose message never mentions the header — this was
    // caught the hard way while building lib/ebay_listing.py; fixed here
    // before it could bite this connector too.
    headers['Content-Language'] = 'en-US';
  }
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
    contentLanguage: true,
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

export const info = {
  name: 'eBay',
  access: 'open',
  configured: () => !!process.env.EBAY_AUTH_TOKEN,
};
