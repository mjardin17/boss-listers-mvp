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
    // Instagram Business Login: the approval code is exchanged at api.instagram.com
    // (graph.instagram.com is for later long-lived token exchanges, not the code).
    tokenUrl: "https://api.instagram.com/oauth/access_token",
    scope: "instagram_business_basic,instagram_business_content_publish",
    apiBase: "https://graph.instagram.com/v18.0",
  },
  // TikTok Login Kit (web) + Content Posting API, v2. TikTok calls the app id a
  // "client key" and sends it as client_key, and wants scopes comma-separated.
  // Verified against developers.tiktok.com: /v2/auth/authorize/, /v2/oauth/token/.
  // The redirect URI must match one registered on the TikTok app exactly.
  tiktok: {
    name: "TikTok",
    clientId: process.env.TIKTOK_CLIENT_KEY || process.env.TIKTOK_CLIENT_ID,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    clientIdParam: "client_key",
    redirectUri: `${process.env.APP_URL}/api/oauth/tiktok/callback`,
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scope: process.env.TIKTOK_SCOPES || "user.info.basic,video.publish",
    apiBase: "https://open.tiktokapis.com/v2",
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
    authUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    scope: "boards:read,pins:read,pins:write,user_accounts:read",
    apiBase: "https://api.pinterest.com/v5",
  },
};

/**
 * Get OAuth authorization URL for a platform
 */
function getAuthorizationUrl(platform, state) {
  const config = OAUTH_CONFIGS[platform];
  if (!config) throw new Error(`Unknown platform: ${platform}`);

  const params = new URLSearchParams({
    [config.clientIdParam || "client_id"]: config.clientId,
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

  const headers = { "Content-Type": "application/x-www-form-urlencoded" };

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    [config.clientIdParam || "client_id"]: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  const data = await response.json().catch(() => ({}));
  // TikTok can answer HTTP 200 with { error, error_description } and no token.
  if (!response.ok || !data.access_token) {
    const reason = data.error_description
      || (typeof data.error === "string" ? data.error : null)
      || data.error_message || data.error?.message || JSON.stringify(data.error || data);
    throw new Error(`${platform} token exchange failed: ${reason}`);
  }

  return tokenResult(platform, data, null);
}

/** Normalizes a token-endpoint answer. Scopes come back comma- or space-separated. */
function tokenResult(platform, data, previousRefreshToken) {
  const expiresIn = Number(data.expires_in) || null;
  const scopes = typeof data.scope === "string" ? data.scope.split(/[\s,]+/).filter(Boolean) : [];
  return {
    platform,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || previousRefreshToken || null,
    expiresIn,
    expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
    scopes,
    ...(data.open_id ? { openId: data.open_id } : {}),
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
        [config.clientIdParam || "client_id"]: config.clientId,
        client_secret: config.clientSecret,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) return null;

    return tokenResult(platform, data, refreshToken);
  } catch {
    return null;
  }
}

/**
 * Platform-specific profile fetching. Single source of truth — used both
 * by pages/api/oauth/[platform]/callback.js (right after connecting, for
 * a display name) and by the live-check path in pages/api/social/status.js
 * (?live=true — proves a STORED token still actually works, not just that
 * a row exists). Each returns { identifier, data }.
 */
const PROFILE_FETCHERS = {
  instagram: async (accessToken) => {
    const res = await fetch('https://graph.instagram.com/me?fields=username,id', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Instagram profile fetch failed: ${res.status}`);
    const data = await res.json();
    return { identifier: data.username, data: { instagramId: data.id, username: data.username } };
  },
  tiktok: async (accessToken) => {
    const res = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data.error && data.error.code && data.error.code !== 'ok')) {
      throw new Error(`TikTok profile fetch failed: ${(data.error && data.error.message) || res.status}`);
    }
    const user = (data.data && data.data.user) || {};
    return {
      identifier: user.display_name || user.open_id || null,
      data: { tiktokOpenId: user.open_id || null, displayName: user.display_name || null, avatarUrl: user.avatar_url || null },
    };
  },
  youtube: async (accessToken) => {
    const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`YouTube profile fetch failed: ${res.status}`);
    const data = await res.json();
    const channel = data.items?.[0];
    return { identifier: channel?.snippet?.title, data: { channelId: channel?.id, channelTitle: channel?.snippet?.title } };
  },
  facebook: async (accessToken) => {
    const res = await fetch('https://graph.facebook.com/me?fields=id,name', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Facebook profile fetch failed: ${res.status}`);
    const data = await res.json();
    return { identifier: data.name, data: { facebookId: data.id, name: data.name } };
  },
  twitter: async (accessToken) => {
    const res = await fetch('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Twitter profile fetch failed: ${res.status}`);
    const data = await res.json();
    return { identifier: data.data?.username, data: { twitterId: data.data?.id, username: data.data?.username } };
  },
  linkedin: async (accessToken) => {
    const res = await fetch('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`LinkedIn profile fetch failed: ${res.status}`);
    const data = await res.json();
    return { identifier: data.id, data: { linkedinId: data.id } };
  },
  snapchat: async (accessToken) => {
    const res = await fetch('https://adsapi.snapchat.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Snapchat profile fetch failed: ${res.status}`);
    const data = await res.json();
    return { identifier: data.id, data: { snapchatId: data.id } };
  },
  pinterest: async (accessToken) => {
    const res = await fetch('https://api.pinterest.com/v5/user_account', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Pinterest profile fetch failed: ${res.status}`);
    const data = await res.json();
    return { identifier: data.username, data: { pinterestId: data.id || data.username, username: data.username } };
  },
};

module.exports = {
  OAUTH_CONFIGS,
  getAuthorizationUrl,
  getAccessToken,
  refreshAccessToken,
  tokenResult,
  PROFILE_FETCHERS,
};
