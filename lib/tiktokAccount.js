// lib/tiktokAccount.js
// The signed-in user's own connected TikTok account (Login Kit), read from the encrypted
// social_media_credentials row that pages/api/oauth/[platform]/callback.js stores.
// Refreshes the access token when it is about to expire (TikTok access tokens last a day,
// refresh tokens a year). The token never leaves the server.

const { refreshCredentialsIfNeeded } = require("./supabaseCredentials");

function credentialEnv() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SECRET_KEY: process.env.SECRET_KEY,
  };
}

/**
 * @param {string} userId
 * @returns {Promise<string|null>} a usable access token, or null when TikTok is not connected
 */
async function getTikTokAccessToken(userId, { refresh = refreshCredentialsIfNeeded } = {}) {
  if (!userId) return null;
  const creds = await refresh(credentialEnv(), userId, "tiktok");
  if (!creds || !creds.accessToken) return null;
  if (creds.expiresAt && creds.expiresAt <= Date.now()) return null; // expired and could not be refreshed
  return creds.accessToken;
}

module.exports = { getTikTokAccessToken };
