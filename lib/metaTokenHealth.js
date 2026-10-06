// lib/metaTokenHealth.js
// Read-only health checks for the shared Facebook Page token and Instagram
// token (FB_ACCESS_TOKEN / IG_ACCESS_TOKEN), plus the one refresh Meta allows
// without a human: renewing a still-valid Instagram long-lived token.
// A token that has already expired can't be refreshed — only a new login can
// mint one — so this reports it early instead of pretending to heal it.
// Never returns or logs a token value.

const GRAPH = "https://graph.facebook.com/v25.0";
const IG_GRAPH = "https://graph.instagram.com";
const DAY_SECONDS = 86400;
const WARN_DAYS = 14;

function classify({ valid, expired, daysLeft }, warnDays = WARN_DAYS) {
  if (!valid) return expired ? "expired" : "invalid";
  if (typeof daysLeft === "number" && daysLeft <= warnDays) return "expiring";
  return "ok";
}

async function inspectMetaToken({ token, appId, appSecret, fetchImpl = fetch }) {
  if (!token || !appId || !appSecret) {
    return { valid: false, expired: false, daysLeft: null, error: "Missing token, FB_APP_ID or FB_APP_SECRET" };
  }
  try {
    const url = `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
    const body = await (await fetchImpl(url)).json();
    const d = body && body.data;
    if (!d) return { valid: false, expired: false, daysLeft: null, error: (body && body.error && body.error.message) || "Unexpected Meta response" };
    const expiresAt = d.expires_at || 0; // 0 = never expires (e.g. Page token from a long-lived user token)
    const nowSec = Math.floor(Date.now() / 1000);
    const daysLeft = expiresAt ? Math.max(0, Math.floor((expiresAt - nowSec) / DAY_SECONDS)) : null;
    return {
      valid: !!d.is_valid,
      expired: !d.is_valid && !!expiresAt && expiresAt <= nowSec,
      type: d.type,
      daysLeft,
      error: d.is_valid ? null : (d.error && d.error.message) || "Token is not valid",
    };
  } catch (err) {
    return { valid: false, expired: false, daysLeft: null, error: String(err.message || err) };
  }
}

async function refreshInstagramToken(token, fetchImpl = fetch) {
  try {
    const url = `${IG_GRAPH}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`;
    const body = await (await fetchImpl(url)).json();
    if (!body.access_token) return { ok: false, error: (body.error && body.error.message) || "Refresh failed" };
    return { ok: true, token: body.access_token, expiresInDays: Math.round((body.expires_in || 0) / DAY_SECONDS) };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

// Swaps a freshly minted Facebook user token (from the Graph API Explorer) for the
// Page token of pageId. A Page token derived from a long-lived user token never
// expires, so this is the one-time step that ends the recurring FB expiry.
async function exchangeFacebookPageToken({ userToken, appId, appSecret, pageId, fetchImpl = fetch }) {
  if (!userToken || !appId || !appSecret || !pageId) {
    return { ok: false, error: "Need a user token, FB_APP_ID, FB_APP_SECRET and FB_PAGE_ID" };
  }
  try {
    const exUrl = `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(userToken)}`;
    const ex = await (await fetchImpl(exUrl)).json();
    if (!ex.access_token) return { ok: false, error: (ex.error && ex.error.message) || "Token exchange failed" };
    const acctUrl = `${GRAPH}/me/accounts?fields=id,access_token&access_token=${encodeURIComponent(ex.access_token)}`;
    const accts = await (await fetchImpl(acctUrl)).json();
    if (!Array.isArray(accts.data)) return { ok: false, error: (accts.error && accts.error.message) || "Could not list Pages for this token" };
    const page = accts.data.find((p) => String(p.id) === String(pageId));
    if (!page || !page.access_token) return { ok: false, error: `Page ${pageId} is not managed by this token's account` };
    return { ok: true, token: page.access_token };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

async function checkInstagram(token, fetchImpl) {
  if (!token) return { platform: "instagram", status: "invalid", detail: "IG_ACCESS_TOKEN not set" };
  try {
    const body = await (await fetchImpl(`${IG_GRAPH}/me?fields=id,username&access_token=${encodeURIComponent(token)}`)).json();
    if (body && body.id) return { platform: "instagram", status: "ok", detail: `Valid for @${body.username || body.id} (renew with --refresh)` };
    return { platform: "instagram", status: "invalid", detail: (body && body.error && body.error.message) || "Instagram rejected the token" };
  } catch (err) {
    return { platform: "instagram", status: "invalid", detail: String(err.message || err) };
  }
}

async function checkAll(env, fetchImpl = fetch) {
  const fb = await inspectMetaToken({ token: env.FB_ACCESS_TOKEN, appId: env.FB_APP_ID, appSecret: env.FB_APP_SECRET, fetchImpl });
  const status = classify(fb);
  const detail = fb.error || (fb.daysLeft === null ? "Never expires" : `${fb.daysLeft} day(s) left`);
  return [
    { platform: "facebook", status, detail },
    await checkInstagram(env.IG_ACCESS_TOKEN, fetchImpl),
  ];
}

module.exports = { classify, inspectMetaToken, refreshInstagramToken, exchangeFacebookPageToken, checkAll, WARN_DAYS };
