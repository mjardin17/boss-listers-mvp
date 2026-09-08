// lib/supabaseCredentials.js
// Supabase-backed credential storage with encryption

const tokenManager = require('./tokenManager');

/**
 * Store social media credentials for a user after OAuth callback
 */
async function storeSocialMediaCredentials(env, userId, platform, oauthData) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  if (!platform) {
    throw new Error('Platform is required');
  }

  if (!oauthData || !oauthData.accessToken) {
    throw new Error('Access token is required');
  }

  const credentialData = {
    accessToken: oauthData.accessToken,
    refreshToken: oauthData.refreshToken || null,
    expiresAt: oauthData.expiresAt || null,
    expiresIn: oauthData.expiresIn || null,
    scopes: oauthData.scopes || [],
    accountIdentifier: oauthData.accountIdentifier || null,
    additionalData: oauthData.additionalData || {},
  };

  return tokenManager.storeCredentials(env, userId, platform, credentialData);
}

/**
 * Retrieve and decrypt credentials for a platform
 */
async function getSocialMediaCredentials(env, userId, platform) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  if (!platform) {
    throw new Error('Platform is required');
  }

  return tokenManager.getCredentials(env, userId, platform);
}

/**
 * Refresh credentials if expired
 * Returns updated credentials or null if refresh not supported
 */
async function refreshCredentialsIfNeeded(env, userId, platform) {
  const credentials = await getSocialMediaCredentials(env, userId, platform);

  if (!credentials) {
    return null;
  }

  // Check if expired or will expire in 5 minutes
  const now = Date.now();
  const expiresAt = credentials.expiresAt || Infinity;
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt > now + bufferMs) {
    // Not expired, return as-is
    return credentials;
  }

  // Expired or expiring soon
  if (!credentials.refreshToken) {
    // No refresh token, can't refresh
    return credentials;
  }

  // Call the appropriate refresh handler
  const socialMediaAuth = require('./socialMediaAuth');
  try {
    const refreshed = await socialMediaAuth.refreshAccessToken(platform, credentials.refreshToken);

    if (refreshed) {
      // Store the updated credentials
      await storeSocialMediaCredentials(env, userId, platform, refreshed);
      return refreshed;
    }
  } catch (err) {
    console.error(`Failed to refresh ${platform} credentials:`, err.message);
    // Return stale credentials rather than failing
    return credentials;
  }

  return credentials;
}

/**
 * Delete credentials for a platform
 */
async function deleteSocialMediaCredentials(env, userId, platform) {
  if (!userId || !platform) {
    throw new Error('User ID and platform are required');
  }

  const { rest } = require('./supabaseRest');

  return rest(
    env,
    'DELETE',
    `/social_media_credentials?user_id=eq.${userId}&platform=eq.${platform.toLowerCase()}`,
  );
}

/**
 * List all connected platforms for a user
 */
async function listConnectedPlatforms(env, userId) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const { rest } = require('./supabaseRest');

  const records = await rest(env, 'GET', `/social_media_credentials?user_id=eq.${userId}`);

  return (records || []).map((record) => ({
    platform: record.platform,
    accountIdentifier: record.account_identifier,
    expiresAt: record.expires_at,
    scopes: record.scopes ? record.scopes.split(',') : [],
    connectedAt: record.created_at,
    lastRefreshed: record.updated_at,
  }));
}

module.exports = {
  storeSocialMediaCredentials,
  getSocialMediaCredentials,
  refreshCredentialsIfNeeded,
  deleteSocialMediaCredentials,
  listConnectedPlatforms,
};
