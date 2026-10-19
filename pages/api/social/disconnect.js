// POST /api/social/disconnect   body: { platform }
// Removes THIS user's stored OAuth credentials for one social platform via
// lib/supabaseCredentials.deleteSocialMediaCredentials(). Mirrors the
// marketplace disconnect routes' shape (pages/api/channels/*/disconnect.js)
// but keyed by user_id, matching how social credentials are stored.

const socialMediaAuth = require('../../../lib/socialMediaAuth');
const supabaseAuth = require('../../../lib/supabaseAuth');
const supabaseCredentials = require('../../../lib/supabaseCredentials');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const userAccessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!userAccessToken) {
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }

  const { platform } = req.body || {};
  const normalizedPlatform = String(platform || '').toLowerCase();
  if (!normalizedPlatform || !socialMediaAuth.OAUTH_CONFIGS[normalizedPlatform]) {
    return res.status(400).json({ ok: false, error: `Unknown platform: ${platform}` });
  }

  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SECRET_KEY: process.env.SECRET_KEY,
  };

  try {
    const user = await supabaseAuth.getUserFromToken(env, userAccessToken);
    if (!user || !user.id) {
      return res.status(401).json({ ok: false, error: 'Invalid session' });
    }
    await supabaseCredentials.deleteSocialMediaCredentials(env, user.id, normalizedPlatform);
    return res.status(200).json({ ok: true, platform: normalizedPlatform });
  } catch (err) {
    console.error('[api/social/disconnect]', err.message);
    return res.status(502).json({ ok: false, error: err.message });
  }
}
