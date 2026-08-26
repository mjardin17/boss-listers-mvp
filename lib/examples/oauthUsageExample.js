// lib/examples/oauthUsageExample.js
// Example usage of OAuth handlers and credential management

/**
 * EXAMPLE 1: Initiate OAuth Flow
 * Client-side (frontend)
 */
async function initiateOAuthFlow(platform) {
  try {
    // 1. Get authorization URL from backend
    const response = await fetch(`/api/oauth/authorize?platform=${platform}`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('sessionToken')}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to get authorization URL');
    }

    const { authUrl, state } = await response.json();

    // 2. Redirect to OAuth provider
    window.location.href = authUrl;

    // 3. After user authorizes, browser will redirect back to:
    // /api/oauth/[platform]/callback?code=AUTH_CODE&state=STATE_TOKEN
  } catch (err) {
    console.error('OAuth error:', err.message);
  }
}

/**
 * EXAMPLE 2: Handle OAuth Callback
 * Server-side (handled automatically by /api/oauth/[platform]/callback.js)
 * But here's what happens internally:
 */
async function handleOAuthCallbackExample(req, res) {
  const { platform } = req.query;
  const { code, state } = req.query;

  // Environment variables needed
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SECRET_KEY: process.env.SECRET_KEY,
  };

  try {
    // 1. Verify CSRF state (prevents replay attacks)
    const tokenManager = require('../tokenManager');
    await tokenManager.verifyOAuthState(env, state, platform);

    // 2. Exchange code for access token
    const socialMediaAuth = require('../socialMediaAuth');
    const tokenData = await socialMediaAuth.getAccessToken(platform, code);

    // 3. Store encrypted credentials
    const userId = 'current-user-id'; // From session
    const supabaseCredentials = require('../supabaseCredentials');
    await supabaseCredentials.storeSocialMediaCredentials(
      env,
      userId,
      platform,
      {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt: tokenData.expiresAt,
        accountIdentifier: 'account-name',
      }
    );

    return res.status(200).json({
      ok: true,
      message: `Successfully connected to ${platform}`
    });
  } catch (err) {
    console.error(`OAuth error: ${err.message}`);
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}

/**
 * EXAMPLE 3: Get Stored Credentials (for API calls)
 * Before making API requests to a social media platform
 */
async function makePostRequest(userId, platform, postData) {
  const supabaseCredentials = require('../supabaseCredentials');

  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SECRET_KEY: process.env.SECRET_KEY,
  };

  try {
    // 1. Get credentials (auto-refreshes if expired)
    const credentials = await supabaseCredentials.refreshCredentialsIfNeeded(
      env,
      userId,
      platform
    );

    if (!credentials) {
      throw new Error(`No credentials found for ${platform}`);
    }

    // 2. Use access token in API request
    const apiResponse = await makeInstagramPost(
      credentials.accessToken,
      postData
    );

    return {
      ok: true,
      postId: apiResponse.id
    };
  } catch (err) {
    console.error(`Post creation failed: ${err.message}`);
    return {
      ok: false,
      error: err.message
    };
  }
}

/**
 * EXAMPLE 4: List Connected Platforms
 * Show user which platforms they've authorized
 */
async function getConnectedPlatforms(userId) {
  const supabaseCredentials = require('../supabaseCredentials');

  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SECRET_KEY: process.env.SECRET_KEY,
  };

  try {
    const platforms = await supabaseCredentials.listConnectedPlatforms(
      env,
      userId
    );

    return platforms.map(p => ({
      platform: p.platform,
      account: p.accountIdentifier,
      expiresAt: new Date(p.expiresAt).toLocaleDateString(),
      connected: true
    }));
  } catch (err) {
    console.error(`Failed to list platforms: ${err.message}`);
    return [];
  }
}

/**
 * EXAMPLE 5: Disconnect a Platform
 * User revokes access to a platform
 */
async function disconnectPlatform(userId, platform) {
  const supabaseCredentials = require('../supabaseCredentials');

  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SECRET_KEY: process.env.SECRET_KEY,
  };

  try {
    await supabaseCredentials.deleteSocialMediaCredentials(
      env,
      userId,
      platform
    );

    // Optional: Revoke token on platform side
    // (depends on platform's API support)

    return {
      ok: true,
      message: `Disconnected from ${platform}`
    };
  } catch (err) {
    console.error(`Disconnect failed: ${err.message}`);
    return {
      ok: false,
      error: err.message
    };
  }
}

/**
 * EXAMPLE 6: Token Encryption/Decryption
 * Direct token management (usually handled automatically)
 */
async function tokenEncryptionExample() {
  const tokenManager = require('../tokenManager');

  const secretKey = process.env.SECRET_KEY;

  // Encrypt a token
  const originalToken = 'igabcdef123456..._access_token';
  const encrypted = tokenManager.encryptToken(originalToken, secretKey);
  console.log('Encrypted:', encrypted);

  // Decrypt it back
  const decrypted = tokenManager.decryptToken(encrypted, secretKey);
  console.log('Decrypted:', decrypted);
  console.log('Match:', originalToken === decrypted);
}

/**
 * EXAMPLE 7: Handle Token Refresh
 * Automatically called when credentials are retrieved
 */
async function tokenRefreshExample() {
  const socialMediaAuth = require('../socialMediaAuth');
  const supabaseCredentials = require('../supabaseCredentials');

  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SECRET_KEY: process.env.SECRET_KEY,
  };

  const userId = 'user-123';
  const platform = 'instagram';

  try {
    // refreshCredentialsIfNeeded checks:
    // 1. Are credentials stored?
    // 2. Are they expired or expiring soon?
    // 3. Is there a refresh token?
    // 4. Can we refresh?
    //
    // If yes to all: refresh and store new credentials
    // If no refresh token: return stale credentials
    // If refresh fails: return stale credentials

    const credentials = await supabaseCredentials.refreshCredentialsIfNeeded(
      env,
      userId,
      platform
    );

    console.log(`Access token: ${credentials.accessToken.substring(0, 20)}...`);
    console.log(`Expires at: ${new Date(credentials.expiresAt).toISOString()}`);
  } catch (err) {
    console.error(`Token refresh failed: ${err.message}`);
  }
}

/**
 * EXAMPLE 8: Error Handling
 * Proper error handling in production
 */
async function robustOAuthHandler(req, res) {
  const { platform, code, state } = req.query;

  // Validation
  if (!platform) {
    return res.status(400).json({
      ok: false,
      error: 'Missing platform parameter'
    });
  }

  if (!code) {
    return res.status(400).json({
      ok: false,
      error: 'Missing authorization code (OAuth denied by user?)',
      errorType: 'user_cancelled'
    });
  }

  if (!state) {
    return res.status(400).json({
      ok: false,
      error: 'Missing state token (CSRF protection)',
      errorType: 'csrf_failed'
    });
  }

  // Check authentication
  const authHeader = req.headers.authorization || '';
  const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!userToken) {
    return res.status(401).json({
      ok: false,
      error: 'Session required',
      errorType: 'session_expired'
    });
  }

  // Process OAuth
  try {
    // ... OAuth flow ...
    return res.status(200).json({
      ok: true,
      platform,
      message: `Connected to ${platform}`
    });
  } catch (err) {
    // Distinguish error types for client
    let errorType = 'unknown';
    if (err.message.includes('state')) errorType = 'csrf_failed';
    if (err.message.includes('token')) errorType = 'token_failed';
    if (err.message.includes('session')) errorType = 'session_invalid';

    console.error(`[${platform}] OAuth error: ${err.message}`);

    return res.status(500).json({
      ok: false,
      error: 'OAuth failed',
      errorType,
      platform,
      // Only include details in dev mode
      ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
  }
}

/**
 * EXAMPLE 9: React Component Usage
 * Frontend component for OAuth flow
 */
async function ReactOAuthConnectExample() {
  // import { useState } from 'react';

  // function ConnectPlatform({ platform }) {
  //   const [loading, setLoading] = useState(false);
  //   const [error, setError] = useState(null);

  //   const handleConnect = async () => {
  //     try {
  //       setLoading(true);
  //       setError(null);

  //       // 1. Get authorization URL
  //       const response = await fetch(
  //         `/api/oauth/authorize?platform=${platform}`,
  //         {
  //           headers: {
  //             'Authorization': `Bearer ${localStorage.getItem('token')}`
  //           }
  //         }
  //       );

  //       if (!response.ok) {
  //         throw new Error('Failed to start OAuth flow');
  //       }

  //       const { authUrl } = await response.json();

  //       // 2. Redirect to OAuth provider
  //       window.location.href = authUrl;
  //     } catch (err) {
  //       setError(err.message);
  //       setLoading(false);
  //     }
  //   };

  //   return (
  //     <div>
  //       <button onClick={handleConnect} disabled={loading}>
  //         {loading ? 'Connecting...' : `Connect ${platform}`}
  //       </button>
  //       {error && <p style={{ color: 'red' }}>{error}</p>}
  //     </div>
  //   );
  // }
}

module.exports = {
  initiateOAuthFlow,
  handleOAuthCallbackExample,
  makePostRequest,
  getConnectedPlatforms,
  disconnectPlatform,
  tokenEncryptionExample,
  tokenRefreshExample,
  robustOAuthHandler,
};
