// lib/supabaseRest.js
// Shared REST wrapper for Supabase calls (extracted from supabaseInventory.js)

function assertConfigured(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase not configured (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing)');
  }
}

async function rest(env, method, path, body = null, extraHeaders = null) {
  assertConfigured(env);
  const url = `${env.SUPABASE_URL}/rest/v1${path}`;
  const opts = {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(extraHeaders || {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    throw new Error(`Supabase ${method} ${path}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

module.exports = { rest, assertConfigured };
