// lib/clientAuth.js
// Browser-side session helper. Every /api/* route now requires a valid
// Supabase access token (see functions/_middleware.js) — this is what
// every page uses to attach it and to redirect to /login when missing.

const STORAGE_KEY = "boss_auth_session";

function getSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setSession(session) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

function requireSession() {
  const session = getSession();
  if (!session?.accessToken) {
    if (typeof window !== "undefined") window.location.href = "/login";
    return null;
  }
  return session;
}

let renewalInFlight = null; // shared, because a renewal token can only be used once

// Swaps the saved renewal token for a fresh login. Resolves true if the session was renewed.
async function renewSession() {
  const session = getSession();
  if (!session?.refreshToken) return false;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    const body = await res.json();
    if (!res.ok || !body.access_token) return false;
    setSession({ ...session, accessToken: body.access_token, refreshToken: body.refresh_token || session.refreshToken });
    return true;
  } catch {
    return false;
  }
}

function renewOnce() {
  if (!renewalInFlight) renewalInFlight = renewSession().finally(() => { renewalInFlight = null; });
  return renewalInFlight;
}

function sendWithToken(url, options) {
  const session = getSession();
  const headers = { ...(options.headers || {}) };
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;
  return fetch(url, { ...options, headers });
}

// Drop-in replacement for fetch() against our own /api/* routes: attaches
// the bearer token automatically. On a 401 it renews the login once and
// retries; only if that fails does it bounce to /login.
async function authedFetch(url, options = {}) {
  let res = await sendWithToken(url, options);
  let renewed = false;

  // A 401 here can mean two different things server-side (functions/_middleware.js):
  // "no token / bad token" (really logged out) or "authenticated but no
  // tenant yet" (login.js's backfill missed, e.g. an older session created
  // before that fix existed). Only the first is a real logout — wiping a
  // genuinely valid session on the second just re-triggers the same bounce
  // forever instead of ever reaching the page that would explain it.
  if (res.status === 401 && typeof window !== "undefined") {
    let noTenant = false;
    try {
      const body = await res.clone().json();
      noTenant = body?.error === "Invalid session or no tenant";
    } catch {
      // non-JSON body — fall through, treat as a real logout below
    }
    // "no tenant" is not a real logout — bouncing to /login here just
    // re-triggers the same failure forever with no visible explanation.
    // Leave the session intact and let the caller's own error handling
    // (every page already does `if (!res.ok) setError(data.error)`) show
    // the real message on screen instead of silently redirecting.
    if (!noTenant) {
      renewed = await renewOnce();
      if (renewed) res = await sendWithToken(url, options);
      if (!renewed || res.status === 401) {
        clearSession();
        window.location.href = "/login";
      }
    }
  }

  return res;
}

module.exports = { getSession, setSession, clearSession, requireSession, authedFetch };
