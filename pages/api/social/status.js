// GET /api/social/status?live=true
// Honest connection status for every social platform wired into
// lib/socialMediaAuth.js. Two independent signals, never conflated:
//  - `configured`: the platform's OAuth app credentials (client id/secret)
//    are present in env — a deploy-time fact, checked here the same way
//    lib/channels/registry.js's staticStatus() checks marketplace channels
//    (env presence only, no network call).
//  - `connected`: THIS user has a real, stored OAuth token for the
//    platform (lib/supabaseCredentials.js / social_media_credentials
//    table), written only by pages/api/oauth/[platform]/callback.js after
//    a completed OAuth exchange. Never inferred from `configured` alone —
//    per lib/channels/connector.js's rule, nothing is "connected" without
//    a real credential on file.
//
// ?live=true additionally, per connected platform:
//  1. Calls refreshCredentialsIfNeeded() — this is the ONLY real caller of
//     that function outside its own lib/examples/oauthUsageExample.js;
//     until this route wired it in, every social OAuth token was silently
//     going stale with nothing ever refreshing it.
//  2. Pings the platform for real via PROFILE_FETCHERS (same fetchers the
//     OAuth callback uses) — proves the (now-fresh) token still works,
//     not just that a row exists.
const socialMediaAuth = require('../../../lib/socialMediaAuth');
const supabaseAuth = require('../../../lib/supabaseAuth');
const supabaseCredentials = require('../../../lib/supabaseCredentials');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const userAccessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!userAccessToken) {
    return res.status(401).json({ ok: false, error: 'Authentication required' });
  }

  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SECRET_KEY: process.env.SECRET_KEY,
  };

  const platformIds = Object.keys(socialMediaAuth.OAUTH_CONFIGS);

  // Env-presence only — no network call, matches registry.js's staticStatus().
  const configuredMap = {};
  for (const id of platformIds) {
    const cfg = socialMediaAuth.OAUTH_CONFIGS[id];
    configuredMap[id] = Boolean(cfg.clientId && cfg.clientSecret);
  }

  // Real per-user connection state. If Supabase itself isn't configured or
  // the token can't be resolved, this stays empty — every platform then
  // correctly falls back to configured/not_configured, never a fabricated
  // "connected".
  let connectedByPlatform = {};
  let userId = null;
  try {
    const user = await supabaseAuth.getUserFromToken(env, userAccessToken);
    if (user && user.id) {
      userId = user.id;
      const connectedList = await supabaseCredentials.listConnectedPlatforms(env, user.id);
      connectedByPlatform = Object.fromEntries(connectedList.map((c) => [c.platform, c]));
    }
  } catch (err) {
    console.warn('[api/social/status] Could not resolve real connection state:', err.message);
    // Non-fatal — fall through with connectedByPlatform empty.
  }

  const wantsLive = req.query.live === 'true' && userId;

  const platforms = await Promise.all(platformIds.map(async (id) => {
    const cfg = socialMediaAuth.OAUTH_CONFIGS[id];
    const connection = connectedByPlatform[id];
    const connected = Boolean(connection);
    const configured = configuredMap[id];

    let status = 'not_configured';
    if (connected) status = 'connected';
    else if (configured) status = 'configured';

    let live = null;
    if (wantsLive && connected) {
      try {
        // 1. Refresh first — the only real caller of this function; makes
        // the dead auto-refresh code path actually run.
        const fresh = await supabaseCredentials.refreshCredentialsIfNeeded(env, userId, id);
        if (!fresh || !fresh.accessToken) {
          live = { status: 'configuration_required', detail: 'No access token on file — reconnect this platform.' };
        } else {
          // 2. Then actually ping the platform with that (now-fresh) token.
          const fetcher = socialMediaAuth.PROFILE_FETCHERS[id];
          if (!fetcher) {
            live = { status: 'connected', detail: 'Token present and refreshed — no live ping available for this platform.' };
          } else {
            const profile = await fetcher(fresh.accessToken);
            live = { status: 'connected', detail: `Live-verified as ${profile.identifier || 'connected account'}.` };
          }
        }
      } catch (err) {
        live = { status: 'configuration_required', detail: `Live check failed: ${err.message} — reconnect this platform.` };
      }
    }

    return {
      id,
      label: cfg.name,
      status,
      configured,
      connected,
      accountIdentifier: connection?.accountIdentifier || null,
      connectedAt: connection?.connectedAt || null,
      live,
    };
  }));

  return res.status(200).json({ ok: true, platforms });
}
