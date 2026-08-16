// Minimal shared OAuth2 helpers. Providers differ; this centralizes the shape
// so each connector only supplies its token endpoints and scopes.

const TOKEN_STORE = new Map(); // in-memory only; use a DB/secure vault in prod

export function storeToken(platform, token) {
  TOKEN_STORE.set(platform, token);
}

export function getToken(platform) {
  return TOKEN_STORE.get(platform);
}

// Generic refresh loop. Not wired to a real provider in the scaffold — see
// docs/02-auth-flows.md for the concrete eBay / Etsy / Depop refresh calls.
export async function refreshIfNeeded(platform, { accessToken, refreshToken, fetchFresh }) {
  if (!accessToken) {
    return { ok: false, error: `no access token for ${platform}` };
  }
  const fresh = await fetchFresh({ refreshToken });
  storeToken(platform, fresh);
  return { ok: true, token: fresh };
}
