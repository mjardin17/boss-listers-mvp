// lib/supabaseAuth.js
// Supabase Auth over plain fetch — no SDK (Cloudflare Workers runtime has
// no Node APIs, and @supabase/supabase-js pulls in more than this needs).
// Mirrors the existing lib/supabaseRest.js convention.

function assertConfigured(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error('Supabase auth not configured (SUPABASE_URL or SUPABASE_ANON_KEY missing)');
  }
}

async function signUp(env, email, password) {
  assertConfigured(env);
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.msg || body.error_description || `Sign-up failed (${res.status})`);
  return body; // { access_token, refresh_token, user, ... }
}

async function signIn(env, email, password) {
  assertConfigured(env);
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.msg || body.error_description || 'Invalid email or password');
  return body; // { access_token, refresh_token, user, ... }
}

// Validates a user's access token and returns their Supabase user record,
// or null if the token is missing/invalid/expired. Never throws.
async function getUserFromToken(env, accessToken) {
  assertConfigured(env);
  if (!accessToken) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// Fetches the tenant(s) the token's user belongs to. Queries as the user
// (their own bearer token, not service role) so RLS on tenant_members
// naturally restricts this to their own membership rows.
async function getMyTenants(env, accessToken) {
  assertConfigured(env);
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/tenant_members?select=tenant_id,role`,
    { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return [];
  return res.json(); // [{ tenant_id, role }, ...]
}

// One-shot: given a bearer token, return { userId, email, tenantId, role }
// or null if the token doesn't resolve to an authenticated user with a
// tenant. This is the primary entry point used by _middleware.js.
async function resolveSession(env, accessToken) {
  const user = await getUserFromToken(env, accessToken);
  if (!user || !user.id) return null;

  const memberships = await getMyTenants(env, accessToken);
  if (!memberships.length) return null; // authenticated but no tenant yet

  const primary = memberships.find((m) => m.role === 'owner') || memberships[0];
  return {
    userId: user.id,
    email: user.email,
    tenantId: primary.tenant_id,
    role: primary.role,
    accessToken,
  };
}

// Creates a tenant for a freshly signed-up user via the create_tenant_for_user
// RPC (runs as the user via their own token, security definer on the DB side
// handles the actual insert).
async function createTenantForUser(env, accessToken, tenantName) {
  assertConfigured(env);
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/create_tenant_for_user`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_name: tenantName }),
  });
  if (!res.ok) throw new Error(`create_tenant_for_user failed: ${res.status} ${await res.text()}`);
  return res.json(); // returns the new tenant uuid
}

module.exports = { signUp, signIn, getUserFromToken, getMyTenants, resolveSession, createTenantForUser };
