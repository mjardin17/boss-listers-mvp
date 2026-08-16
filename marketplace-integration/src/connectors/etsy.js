// Etsy — Open API v3 (✅ open platform)
// Auth: x-api-key = `<keystring>:<shared_secret>` on EVERY request,
//       plus OAuth2 Bearer token (PKCE) for scoped write ops (listings_w).
const BASE = 'https://openapi.etsy.com/v3';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const AUTHORIZE_URL = 'https://www.etsy.com/oauth/connect';

function apiKeyHeader() {
  const k = process.env.ETSY_KEYSTRING, s = process.env.ETSY_SHARED_SECRET;
  if (!k || !s) throw new Error('ETSY_KEYSTRING / ETSY_SHARED_SECRET not set.');
  return `${k}:${s}`;
}
function shopId() {
  const id = process.env.ETSY_SHOP_ID;
  if (!id) throw new Error('ETSY_SHOP_ID not set.');
  return id;
}
function accessToken() {
  const t = process.env.ETSY_OAUTH_TOKEN;
  if (!t) throw new Error('ETSY_OAUTH_TOKEN not set. Run scripts/oauth-token.js --etsy first.');
  return t;
}

// ---------- PKCE helpers ----------
import { createHash, randomBytes } from 'node:crypto';
export function base64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}
export function pkcePair() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

// Build the authorization URL a seller opens to approve the app.
export function authorizeUrl({ redirectUri = process.env.ETSY_REDIRECT_URI, scope = 'listings_w' } = {}) {
  const { verifier, challenge } = pkcePair();
  const params = new URLSearchParams({
    client_id: process.env.ETSY_KEYSTRING,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return { url: `${AUTHORIZE_URL}?${params}`, verifier };
}

// Exchange the one-time code (from the redirect) for tokens.
export async function exchangeCode(code, verifier, { redirectUri = process.env.ETSY_REDIRECT_URI } = {}) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: process.env.ETSY_KEYSTRING,
    redirect_uri: redirectUri,
    code,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Etsy token exchange ${res.status}: ${await res.text()}`);
  return res.json();
}

// Refresh an expired access token.
export async function refreshToken() {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ETSY_KEYSTRING,
    refresh_token: process.env.ETSY_OAUTH_REFRESH,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Etsy token refresh ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------- Listings ----------
export async function listActiveListings() {
  const res = await fetch(`${BASE}/application/shops/${shopId()}/listings/active`, {
    headers: { 'x-api-key': apiKeyHeader() },
  });
  if (!res.ok) throw new Error(`Etsy list ${res.status}: ${await res.text()}`);
  return res.json();
}

// Create a listing (needs listings_w scope token).
// Minimal fields: quantity, title, description, price, who_made, when_made, taxonomy_id.
export async function createListing(body) {
  const res = await fetch(`${BASE}/application/shops/${shopId()}/listings`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKeyHeader(),
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Etsy create listing ${res.status}: ${await res.text()}`);
  return res.json();
}

// Upload an image to an existing listing (needs image bytes / url).
export async function uploadListingImage(listingId, { imageUrl } = {}) {
  const body = new URLSearchParams({ image_url: imageUrl });
  const res = await fetch(`${BASE}/application/listings/${listingId}/images`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKeyHeader(),
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) throw new Error(`Etsy upload image ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function updateListing(listingId, fields) {
  const res = await fetch(`${BASE}/application/listings/${listingId}`, {
    method: 'PATCH',
    headers: {
      'x-api-key': apiKeyHeader(),
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Etsy update listing ${res.status}: ${await res.text()}`);
  return res.json();
}
