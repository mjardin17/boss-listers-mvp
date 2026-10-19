// lib/clientOAuthConnect.js
// Browser-side OAuth-connect kickoff for every tenant-OAuth marketplace
// (eBay, Etsy, Amazon, TikTok Shop, Shopify). Extracted from
// pages/channels.js so pages/connected-accounts.js can reuse the exact
// same, already-working flows instead of a second copy that could drift.
//
// Each function navigates the browser straight to the platform's own
// consent screen — nothing here ever sees a client secret; that only ever
// lives server-side in the matching pages/api/channels/{platform}/callback.js.

import { safeRandomUUID } from "./safeUuid";

const EBAY_CLIENT_ID = process.env.NEXT_PUBLIC_EBAY_CLIENT_ID;
const EBAY_RUNAME = process.env.NEXT_PUBLIC_EBAY_RUNAME;
const EBAY_STATE_STORAGE_KEY = "boss_ebay_oauth_state";

// Anti-CSRF: a random state value is stashed in sessionStorage before
// redirecting, then checked again on the way back — without this, an
// attacker could complete their OWN OAuth consent, capture their own
// authorization code, and trick a logged-in victim into opening the
// callback with the attacker's code, linking the ATTACKER's account to the
// VICTIM's tenant.
export function startEbayConnect() {
  const state = safeRandomUUID();
  sessionStorage.setItem(EBAY_STATE_STORAGE_KEY, state);

  const scope = "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment";
  const params = new URLSearchParams({
    client_id: EBAY_CLIENT_ID,
    redirect_uri: EBAY_RUNAME,
    response_type: "code",
    scope,
    state,
  });
  window.location.href = `https://auth.ebay.com/oauth2/authorize?${params.toString()}`;
}

// Etsy — OAuth 2.0 + PKCE (public client): no client secret ever appears
// client-side, but a code_verifier has to be generated here, stashed for
// the callback page to send back to the server, and proven via a SHA-256
// code_challenge in this authorize request.
const ETSY_KEYSTRING = process.env.NEXT_PUBLIC_ETSY_KEYSTRING;
const ETSY_REDIRECT_URI = process.env.NEXT_PUBLIC_ETSY_REDIRECT_URI;
const ETSY_OAUTH_SCOPES = "listings_r listings_w transactions_r shops_r";
const ETSY_STATE_STORAGE_KEY = "boss_etsy_oauth_state";
const ETSY_VERIFIER_STORAGE_KEY = "boss_etsy_code_verifier";

function base64UrlEncode(bytes) {
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return base64UrlEncode(bytes); // ~86 chars, well within PKCE's 43-128 range
}

async function computeCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export async function startEtsyConnect() {
  const state = safeRandomUUID();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await computeCodeChallenge(codeVerifier);

  sessionStorage.setItem(ETSY_STATE_STORAGE_KEY, state);
  sessionStorage.setItem(ETSY_VERIFIER_STORAGE_KEY, codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: ETSY_KEYSTRING,
    redirect_uri: ETSY_REDIRECT_URI,
    scope: ETSY_OAUTH_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  window.location.href = `https://www.etsy.com/oauth/connect?${params.toString()}`;
}

// Amazon — Login with Amazon (LWA) OAuth for SP-API. NOTE: Amazon's
// consent URL takes an "Application ID" (amzn1.sp.solution.… in Seller
// Central's own app listing), which may or may not be the same value as
// the LWA Client ID used server-side for the token exchange — verify
// against the app's own "View instructions" page in Seller Central once
// it's registered, and set NEXT_PUBLIC_AMAZON_APPLICATION_ID separately if
// it differs.
const AMAZON_APPLICATION_ID = process.env.NEXT_PUBLIC_AMAZON_APPLICATION_ID || process.env.NEXT_PUBLIC_AMAZON_CLIENT_ID;
const AMAZON_STATE_STORAGE_KEY = "boss_amazon_oauth_state";

export function startAmazonConnect() {
  const state = safeRandomUUID();
  sessionStorage.setItem(AMAZON_STATE_STORAGE_KEY, state);

  // version=beta is required while the app is in Draft state in Seller
  // Central — drop it once the app is published, or Amazon will reject
  // the consent request for a live seller.
  const params = new URLSearchParams({
    application_id: AMAZON_APPLICATION_ID,
    state,
    version: "beta",
  });
  window.location.href = `https://sellercentral.amazon.com/apps/authorize/consent?${params.toString()}`;
}

// TikTok Shop — Partner Center OAuth. NOTE: verify this authorize URL
// against the actual link shown on the app's own page in
// partner.tiktokshop.com once registered — TikTok Shop Partner Center
// typically hands you a ready-made authorization link per app rather than
// documenting a single fixed URL template, so treat this as a starting
// point, not a guarantee.
const TIKTOK_SHOP_SERVICE_ID = process.env.NEXT_PUBLIC_TIKTOK_SHOP_SERVICE_ID;
const TIKTOK_SHOP_STATE_STORAGE_KEY = "boss_tiktok_shop_oauth_state";

export function startTikTokShopConnect() {
  const state = safeRandomUUID();
  sessionStorage.setItem(TIKTOK_SHOP_STATE_STORAGE_KEY, state);

  const params = new URLSearchParams({ service_id: TIKTOK_SHOP_SERVICE_ID, state });
  window.location.href = `https://services.tiktokshop.com/open/authorize?${params.toString()}`;
}

// Shopify — OAuth for the Admin API. Per-store authorization: each Shopify
// merchant creates a custom app in their own store admin, and connects
// that store. Unlike eBay/Etsy/Amazon, the OAuth app lives per-store, not
// shared.
const SHOPIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID;
const SHOPIFY_REDIRECT_URI = process.env.NEXT_PUBLIC_SHOPIFY_REDIRECT_URI;
const SHOPIFY_SCOPES = "write_products read_products write_inventory read_inventory";
const SHOPIFY_STATE_STORAGE_KEY = "boss_shopify_oauth_state";
const SHOPIFY_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export function startShopifyConnect() {
  const state = safeRandomUUID();
  sessionStorage.setItem(SHOPIFY_STATE_STORAGE_KEY, state);

  // Shopify requires a store domain (e.g. mystore.myshopify.com) to build
  // the authorize URL. Prompt the user to enter it and validate format.
  let storeDomain = prompt("Enter your Shopify store domain (e.g., mystore.myshopify.com):");
  if (!storeDomain) return; // user cancelled

  storeDomain = storeDomain.trim().toLowerCase();
  if (!SHOPIFY_DOMAIN_RE.test(storeDomain)) {
    alert("Invalid Shopify store domain. Please enter your store URL (e.g., mystore.myshopify.com).");
    return;
  }

  const params = new URLSearchParams({
    client_id: SHOPIFY_CLIENT_ID,
    scope: SHOPIFY_SCOPES,
    redirect_uri: SHOPIFY_REDIRECT_URI,
    state,
  });
  window.location.href = `https://${storeDomain}/admin/oauth/authorize?${params.toString()}`;
}

// Marketplaces where each tenant connects their OWN account (vs.
// Facebook/Bonanza, which use one shared app-level token — see
// pages/connected-accounts.js for why those two have no entry here).
export const TENANT_OAUTH_CHANNELS = {
  ebay: { connectFn: startEbayConnect, label: "eBay", noun: "account" },
  etsy: { connectFn: startEtsyConnect, label: "Etsy", noun: "shop" },
  amazon: { connectFn: startAmazonConnect, label: "Amazon", noun: "account" },
  "tiktok-shop": { connectFn: startTikTokShopConnect, label: "TikTok Shop", noun: "shop" },
  shopify: { connectFn: startShopifyConnect, label: "Shopify", noun: "store" },
};
