// pages/api/oauth/authorize.js
// Generate authorization URL for OAuth flow with CSRF protection
// Query: ?platform=instagram&redirect=/dashboard&scope=optional

const tokenManager = require('../../../lib/tokenManager');
const socialMediaAuth = require('../../../lib/socialMediaAuth');
const { rest } = require('../../../lib/supabaseRest');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  const { platform, redirect } = req.query;

  // Validate request
  if (!platform || typeof platform !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Missing or invalid platform parameter',
    });
  }

  // Validate platform is supported
  if (!socialMediaAuth.OAUTH_CONFIGS[platform.toLowerCase()]) {
    return res.status(400).json({
      ok: false,
      error: `Unsupported platform: ${platform}`,
    });
  }

  // Verify user is authenticated
  const authHeader = req.headers.authorization || '';
  const userAccessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!userAccessToken) {
    return res.status(401).json({
      ok: false,
      error: 'Authentication required',
    });
  }

  // Generate CSRF state token
  const state = tokenManager.generateState();

  try {
    // Store state for verification in callback
    await tokenManager.storeOAuthState(
      {
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        SECRET_KEY: process.env.SECRET_KEY,
      },
      state,
      platform,
      600, // 10 minutes
    );

    // Generate authorization URL
    const authUrl = socialMediaAuth.getAuthorizationUrl(platform.toLowerCase(), state);

    // Build redirect URL if provided
    let finalRedirect = authUrl;
    if (redirect) {
      // Store redirect URL temporarily in state record
      // (client can handle it on callback)
      res.setHeader('X-OAuth-Redirect', redirect);
    }

    return res.status(200).json({
      ok: true,
      authUrl,
      state,
      platform: platform.toLowerCase(),
      expiresIn: 600,
    });
  } catch (err) {
    console.error(`[OAuth] Authorization URL generation failed:`, err.message);

    return res.status(500).json({
      ok: false,
      error: 'Failed to generate authorization URL',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}
