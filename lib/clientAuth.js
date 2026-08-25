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

// Drop-in replacement for fetch() against our own /api/* routes: attaches
// the bearer token automatically, and bounces to /login on a 401 (expired
// or missing session) instead of leaving the caller with a silent failure.
async function authedFetch(url, options = {}) {
  const session = getSession();
  const headers = { ...(options.headers || {}) };
  if (session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  const res = await fetch(url, { ...options, headers });

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
      clearSession();
      window.location.href = "/login";
    }
  }

  return res;
}

module.exports = { getSession, setSession, clearSession, requireSession, authedFetch };
