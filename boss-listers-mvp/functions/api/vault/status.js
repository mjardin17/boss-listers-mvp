// functions/api/vault/status.js
// GET /api/vault/status — get connection status for all platforms

import { getVault } from '../../../lib/vault/credentialVault.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestGet({ request, env, data }) {
  try {
    const vault = getVault();
    const status = await vault.getStatus();
    return jsonResponse({ ok: true, status });
  } catch (err) {
    console.error('[vault/status]', err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
