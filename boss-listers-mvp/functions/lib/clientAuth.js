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

  if (res.status === 401 && typeof window !== "undefined") {
    clearSession();
    window.location.href = "/login";
  }

  return res;
}

module.exports = { getSession, setSession, clearSession, requireSession, authedFetch };
