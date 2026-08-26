// Social media authentication manager
// Handles OAuth flow and credential storage for all platforms
// See docs/OAUTH_SETUP.md for platform configuration guide

const OAUTH_CONFIGS = {
  instagram: {
    name: "Instagram",
    clientId: process.env.INSTAGRAM_CLIENT_ID,
    clientSecret: process.env.INSTAGRAM_CLIENT_SECRET,
    redirectUri: `${process.env.APP_URL}/api/oauth/instagram/callback`,
    authUrl: "https://api.instagram.com/oauth/authorize",
    tokenUrl: "https://graph.instagram.com/v18.0/oauth/access_token",
    scope: "instagram_business_basic,instagram_business_content_publish",
    apiBase: "https://graph.instagram.com/v18.0",
  },
  tiktok: {
    name: "TikTok",
    clientId: process.env.TIKTOK_CLIENT_ID,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    redirectUri: `${process.env.APP_URL}/api/oauth/tiktok/callback`,
    authUrl: "https://www.tiktok.com/v1/oauth/authorize",
    tokenUrl: "https://open.tiktokapi.com/v1/oauth/token",
    scope: "video.upload",
    apiBase: "https://open.tiktokapi.com/v1",
  },
  youtube: {
    name: "YouTube",
    clientId: process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
    redirectUri: `${process.env.APP_URL}/api/oauth/youtube/callback`,
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube",
    apiBase: "https://www.googleapis.com/youtube/v3",
  },
  facebook: {
    name: "Facebook",
    clientId: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    redirectUri: `${process.env.APP_URL}/api/oauth/facebook/callback`,
    authUrl: "https://www.facebook.com/v18.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
    scope: "pages_manage_metadata,pages_read_engagement,pages_manage_posts",
    apiBase: "https://graph.facebook.com/v18.0",
  },
  twitter: {
    name: "Twitter/X",
    clientId: process.env.TWITTER_CLIENT_ID,
    clientSecret: process.env.TWITTER_CLIENT_SECRET,
    redirectUri: `${process.env.APP_URL}/api/oauth/twitter/callback`,
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    scope: "tweet.write tweet.read",
    apiBase: "https://api.twitter.com/2",
  },
  linkedin: {
    name: "LinkedIn",
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    redirectUri: `${process.env.APP_URL}/api/oauth/linkedin/callback`,
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scope: "w_member_social",
    apiBase: "https://api.linkedin.com/v2",
  },
  snapchat: {
    name: "Snapchat",
    clientId: process.env.SNAPCHAT_CLIENT_ID,
    clientSecret: process.env.SNAPCHAT_CLIENT_SECRET,
    redirectUri: `${process.env.APP_URL}/api/oauth/snapchat/callback`,
    authUrl: "https://accounts.snapchat.com/accounts/oauth2/auth",
    tokenUrl: "https://accounts.snapchat.com/accounts/oauth2/token",
    scope: "snapchat-marketing-api",
    apiBase: "https://adsapi.snapchat.com/v1",
  },
  pinterest: {
    name: "Pinterest",
    clientId: process.env.PINTEREST_CLIENT_ID,
    clientSecret: process.env.PINTEREST_CLIENT_SECRET,
    redirectUri: `${process.env.APP_URL}/api/oauth/pinterest/callback`,
    authUrl: "https://api.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v1/oauth/token",
    scope: "pins:read,pins:write,user_accounts:read",
    apiBase: "https://api.pinterest.com/v1",
  },
};

/**
 * Get OAuth authorization URL for a platform
 */
function getAuthorizationUrl(platform, state) {
  const config = OAUTH_CONFIGS[platform];
  if (!config) throw new Error(`Unknown platform: ${platform}`);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope,
    state,
    response_type: "code",
  });

  return `${config.authUrl}?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
async function getAccessToken(platform, code) {
  const config = OAUTH_CONFIGS[platform];
  if (!config) throw new Error(`Unknown platform: ${platform}`);

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Token exchange failed");

  return {
    platform,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresIn: data.expires_in,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };
}

/**
 * Refresh access token if expired
 */
async function refreshAccessToken(platform, refreshToken) {
  const config = OAUTH_CONFIGS[platform];
  if (!config || !refreshToken) return null;

  try {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    });

    const data = await response.json();
    if (!response.ok) return null;

    return {
      platform,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
      expiresAt: Date.now() + (data.expires_in * 1000),
    };
  } catch {
    return null;
  }
}

/**
 * Platform-specific profile fetching (called from callbacks)
 */
const PROFILE_FETCHERS = {
  instagram: async (accessToken) => {
    const res = await fetch('https://graph.instagram.com/me?fields=username,id', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Instagram profile fetch failed: ${res.status}`);
    const data = await res.json();
    return { instagramId: data.id, username: data.username };
  },
  tiktok: async (accessToken) => {
    const res = await fetch('https://open.tiktokapi.com/v1/user/info/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`TikTok profile fetch failed: ${res.status}`);
    const data = await res.json();
    return { tiktokId: data.user?.open_id };
  },
};

module.exports = {
  OAUTH_CONFIGS,
  getAuthorizationUrl,
  getAccessToken,
  refreshAccessToken,
  PROFILE_FETCHERS,
};
