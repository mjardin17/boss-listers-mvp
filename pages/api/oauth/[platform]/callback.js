// pages/api/oauth/[platform]/callback.js
// Universal OAuth callback handler for all social media platforms
// Query: ?code=AUTH_CODE&state=STATE_TOKEN&error=ERROR_CODE

const tokenManager = require('../../../../lib/tokenManager');
const socialMediaAuth = require('../../../../lib/socialMediaAuth');
const supabaseCredentials = require('../../../../lib/supabaseCredentials');
const { rest } = require('../../../../lib/supabaseRest');

// Profile fetchers are the shared source of truth in lib/socialMediaAuth.js
// (also reused by the live-check path in pages/api/social/status.js) —
// this used to duplicate all 8 of these locally.
const { PROFILE_FETCHERS } = socialMediaAuth;

// The platform sends the browser here after consent. A browser navigation goes back to
// the Social Connections page with the outcome in the query (never a token or a
// message from the platform); API callers keep the JSON answer.
function wantsPage(req) {
  return String(req.headers.accept || '').includes('text/html');
}

// Only ever returns '' (same host) or http://localhost:PORT — never another site.
export function localReturnBase(state) {
  const parts = String(state || '').split('.');
  const tag = parts.length >= 3 ? parts[parts.length - 2] : '';
  const m = /^lh(\d{2,5})$/.exec(tag);
  return m ? `http://localhost:${m[1]}` : '';
}

function finish(req, res, status, body) {
  if (wantsPage(req) && body.platform) {
    const q = body.ok
      ? `connected=${encodeURIComponent(body.platform)}`
      : `connect_error=${encodeURIComponent(body.platform)}&reason=${encodeURIComponent(body.errorType || 'failed')}`;
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, `${localReturnBase(req.query.state)}/social?${q}`);
  }
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  const { platform } = req.query;
  const { code, state, error, error_description } = req.query;

  // Validate platform
  if (!platform || typeof platform !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Missing platform parameter',
    });
  }

  const normalizedPlatform = platform.toLowerCase();

  if (!socialMediaAuth.OAUTH_CONFIGS[normalizedPlatform]) {
    return finish(req, res, 400, {
      ok: false,
      error: `Unsupported platform: ${platform}`,
    });
  }

  // Handle OAuth errors from provider
  if (error) {
    const errorMsg = error_description || error;
    console.error(`[OAuth] ${platform} authorization error:`, errorMsg);

    return finish(req, res, 400, {
      ok: false,
      error: `Authorization failed: ${errorMsg}`,
      errorType: error === 'access_denied' ? 'access_denied' : 'provider_error',
      platform: normalizedPlatform,
    });
  }

  // Validate code and state
  if (!code || typeof code !== 'string') {
    return finish(req, res, 400, {
      ok: false,
      error: 'Missing authorization code',
      platform: normalizedPlatform,
    });
  }

  if (!state || typeof state !== 'string') {
    return finish(req, res, 400, {
      ok: false,
      error: 'Missing state parameter (CSRF protection)',
      platform: normalizedPlatform,
    });
  }

  // Verify user is authenticated (via session/cookie)
  const authHeader = req.headers.authorization || '';
  const userAccessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const stateUserId = state.includes('.') ? state.split('.').pop() : null;
  if (!userAccessToken && !stateUserId) {
    return finish(req, res, 401, {
      ok: false,
      error: 'Authentication required',
      platform: normalizedPlatform,
    });
  }

  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SECRET_KEY: process.env.SECRET_KEY,
  };

  try {
    // 1. Verify CSRF state token
    await tokenManager.verifyOAuthState(env, state, normalizedPlatform);

    // 2. Exchange code for access token
    const tokenData = await socialMediaAuth.getAccessToken(normalizedPlatform, code);

    if (!tokenData || !tokenData.accessToken) {
      console.error(`[OAuth] ${platform} token exchange returned no access token`);
      return finish(req, res, 502, {
        ok: false,
        error: 'Token exchange failed: no access token received',
        platform: normalizedPlatform,
      });
    }

    // 3. Fetch user profile (for display name / account identifier)
    let accountIdentifier = null;
    let additionalData = {};

    const profileFetcher = PROFILE_FETCHERS[normalizedPlatform];
    if (profileFetcher) {
      try {
        const profile = await profileFetcher(tokenData.accessToken);
        accountIdentifier = profile.identifier;
        additionalData = profile.data;
      } catch (err) {
        console.warn(`[OAuth] Failed to fetch ${platform} profile:`, err.message);
        // Non-fatal — continue without profile data
      }
    }

    if (tokenData.openId) additionalData = { openId: tokenData.openId, ...additionalData };

    // 4. Get user ID from Supabase auth token
    let userId = stateUserId;
    try {
      if (!userId) {
      const meRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          apikey: process.env.SUPABASE_ANON_KEY,
        },
      });

      if (!meRes.ok) {
        console.error(`[OAuth] Failed to resolve user ID:`, meRes.statusText);
        return finish(req, res, 401, {
          ok: false,
          error: 'Invalid session',
          platform: normalizedPlatform,
        });
      }

      const me = await meRes.json();
      userId = me.id;
      }
    } catch (err) {
      console.error(`[OAuth] User resolution failed:`, err.message);
      return finish(req, res, 500, {
        ok: false,
        error: 'Failed to resolve user',
        platform: normalizedPlatform,
      });
    }

    // 5. Store encrypted credentials
    await supabaseCredentials.storeSocialMediaCredentials(env, userId, normalizedPlatform, {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: tokenData.expiresAt,
      expiresIn: tokenData.expiresIn,
      scopes: tokenData.scopes || [],
      accountIdentifier,
      additionalData,
    });

    // 6. Log connection in audit table (optional)
    try {
      await rest(env, 'POST', '/social_media_connections_log', {
        user_id: userId,
        platform: normalizedPlatform,
        account_identifier: accountIdentifier,
        event: 'oauth_connected',
        ip_address: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        user_agent: req.headers['user-agent'],
      });
    } catch (err) {
      console.warn(`[OAuth] Failed to log connection:`, err.message);
      // Non-fatal
    }

    // 7. Return success response
    return finish(req, res, 200, {
      ok: true,
      platform: normalizedPlatform,
      accountIdentifier,
      message: `Successfully connected to ${platform}`,
    });
  } catch (err) {
    console.error(`[OAuth] Callback error for ${platform}:`, err.message);

    // Determine error category for client handling
    let errorType = 'unknown';
    if (err.message.includes('state')) {
      errorType = 'csrf_failed';
    } else if (err.message.includes('token')) {
      errorType = 'token_exchange_failed';
    } else if (err.message.includes('session')) {
      errorType = 'session_invalid';
    }

    return finish(req, res, 500, {
      ok: false,
      error: 'OAuth callback failed',
      errorType,
      platform: normalizedPlatform,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}
