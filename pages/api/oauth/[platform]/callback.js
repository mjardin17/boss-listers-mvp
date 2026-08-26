// pages/api/oauth/[platform]/callback.js
// Universal OAuth callback handler for all social media platforms
// Query: ?code=AUTH_CODE&state=STATE_TOKEN&error=ERROR_CODE

const tokenManager = require('../../../../lib/tokenManager');
const socialMediaAuth = require('../../../../lib/socialMediaAuth');
const supabaseCredentials = require('../../../../lib/supabaseCredentials');
const { rest } = require('../../../../lib/supabaseRest');

// Platform-specific profile fetching logic
const PROFILE_FETCHERS = {
  instagram: fetchInstagramProfile,
  tiktok: fetchTikTokProfile,
  youtube: fetchYouTubeProfile,
  facebook: fetchFacebookProfile,
  twitter: fetchTwitterProfile,
  linkedin: fetchLinkedInProfile,
  snapchat: fetchSnapchatProfile,
  pinterest: fetchPinterestProfile,
};

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
    return res.status(400).json({
      ok: false,
      error: `Unsupported platform: ${platform}`,
    });
  }

  // Handle OAuth errors from provider
  if (error) {
    const errorMsg = error_description || error;
    console.error(`[OAuth] ${platform} authorization error:`, errorMsg);

    return res.status(400).json({
      ok: false,
      error: `Authorization failed: ${errorMsg}`,
      platform: normalizedPlatform,
    });
  }

  // Validate code and state
  if (!code || typeof code !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Missing authorization code',
      platform: normalizedPlatform,
    });
  }

  if (!state || typeof state !== 'string') {
    return res.status(400).json({
      ok: false,
      error: 'Missing state parameter (CSRF protection)',
      platform: normalizedPlatform,
    });
  }

  // Verify user is authenticated (via session/cookie)
  const authHeader = req.headers.authorization || '';
  const userAccessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!userAccessToken) {
    return res.status(401).json({
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
      return res.status(502).json({
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

    // 4. Get user ID from Supabase auth token
    let userId;
    try {
      const meRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          apikey: process.env.SUPABASE_ANON_KEY,
        },
      });

      if (!meRes.ok) {
        console.error(`[OAuth] Failed to resolve user ID:`, meRes.statusText);
        return res.status(401).json({
          ok: false,
          error: 'Invalid session',
          platform: normalizedPlatform,
        });
      }

      const me = await meRes.json();
      userId = me.id;
    } catch (err) {
      console.error(`[OAuth] User resolution failed:`, err.message);
      return res.status(500).json({
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
    return res.status(200).json({
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

    return res.status(500).json({
      ok: false,
      error: 'OAuth callback failed',
      errorType,
      platform: normalizedPlatform,
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
}

// Platform-specific profile fetchers

async function fetchInstagramProfile(accessToken) {
  const res = await fetch('https://graph.instagram.com/me?fields=username,id', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Instagram profile fetch failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    identifier: data.username,
    data: { instagramId: data.id, username: data.username },
  };
}

async function fetchTikTokProfile(accessToken) {
  const res = await fetch('https://open.tiktokapi.com/v1/user/info/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`TikTok profile fetch failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    identifier: data.user?.open_id,
    data: { tiktokId: data.user?.open_id },
  };
}

async function fetchYouTubeProfile(accessToken) {
  const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`YouTube profile fetch failed: ${res.status}`);
  }

  const data = await res.json();
  const channel = data.items?.[0];
  return {
    identifier: channel?.snippet?.title,
    data: { channelId: channel?.id, channelTitle: channel?.snippet?.title },
  };
}

async function fetchFacebookProfile(accessToken) {
  const res = await fetch('https://graph.facebook.com/me?fields=id,name', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Facebook profile fetch failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    identifier: data.name,
    data: { facebookId: data.id, name: data.name },
  };
}

async function fetchTwitterProfile(accessToken) {
  const res = await fetch('https://api.twitter.com/2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Twitter profile fetch failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    identifier: data.data?.username,
    data: { twitterId: data.data?.id, username: data.data?.username },
  };
}

async function fetchLinkedInProfile(accessToken) {
  const res = await fetch('https://api.linkedin.com/v2/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`LinkedIn profile fetch failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    identifier: data.id,
    data: { linkedinId: data.id },
  };
}

async function fetchSnapchatProfile(accessToken) {
  const res = await fetch('https://adsapi.snapchat.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Snapchat profile fetch failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    identifier: data.id,
    data: { snapchatId: data.id },
  };
}

async function fetchPinterestProfile(accessToken) {
  const res = await fetch('https://api.pinterest.com/v1/user/account?access_token=' + accessToken, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Pinterest profile fetch failed: ${res.status}`);
  }

  const data = await res.json();
  return {
    identifier: data.username,
    data: { pinterestId: data.id, username: data.username },
  };
}
