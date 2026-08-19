// functions/api/vault/save-credentials.js
// POST /api/vault/save-credentials — save platform credentials
// body: { platform: 'poshmark', credentials: { email: '...', password: '...' } }

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
    const { platform, credentials } = body || {};

    if (!platform || !credentials) {
      return jsonResponse({ ok: false, error: 'platform and credentials required' }, 400);
    }

    if (!Object.values(SUPPORTED_PLATFORMS).includes(platform)) {
      return jsonResponse({ ok: false, error: `Unknown platform: ${platform}` }, 400);
    }

    const vault = getVault();

    // Save each credential key
    const saved = {};
    for (const [key, value] of Object.entries(credentials)) {
      await vault.saveCredential(platform, key, value);
      saved[key] = true;
    }

    // Test connection
    const testResult = await vault.testConnection(platform);

    return jsonResponse({
      ok: true,
      platform,
      saved,
      testResult,
      message: `Credentials saved for ${platform}`,
    });
  } catch (err) {
    console.error('[vault/save-credentials]', err.message);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
