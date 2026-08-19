// functions/api/vault/disconnect.js
// POST /api/vault/disconnect — remove credentials for a platform
// body: { platform: 'poshmark' }

import { getVault, SUPPORTED_PLATFORMS } from '../../../lib/vault/credentialVault.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestPost({ request, env, data }) {
  try {
    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
    }

    const body = await request.json();
    const { platform } = body || {};

    if (!platform) {
      return jsonResponse({ ok: false, error: 'platform required' }, 400);
    }

    if (!Object.values(SUPPORTED_PLATFORMS).includes(platform)) {
      return jsonResponse({ ok: false, error: `Unknown platform: ${platform}` }, 400);
    }

    const vault = getVault();
    const result = await vault.removeCredentials(platform);

    return jsonResponse({
      ok: true,
      ...result,
      message: `Disconnected from ${platform}`,
    });
  } catch (err) {
    console.error('[vault/disconnect]', err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
