// lib/tokenManager.js
// Token encryption, storage, and refresh management
// Uses env.SECRET_KEY for AES-256 encryption (Node.js crypto)

const crypto = require('crypto');
const { rest } = require('./supabaseRest');

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Derive a 32-byte key from SECRET_KEY using PBKDF2
 * (salt is stored in the ciphertext, making each encryption unique)
 */
function deriveKey(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, 100000, 32, 'sha256');
}

/**
 * Encrypt token data using AES-256-GCM
 * Returns: base64(salt + iv + ciphertext + tag)
 */
function encryptToken(plaintext, secretKey) {
  if (!secretKey) {
    throw new Error('SECRET_KEY not configured');
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(secretKey, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintext, 'utf8', '');
  ciphertext += cipher.final('');

  const tag = cipher.getAuthTag();
  const encrypted = Buffer.concat([salt, iv, ciphertext, tag]);

  return encrypted.toString('base64');
}

/**
 * Decrypt token data
 * Input: base64(salt + iv + ciphertext + tag)
 */
function decryptToken(encrypted, secretKey) {
  if (!secretKey) {
    throw new Error('SECRET_KEY not configured');
  }

  const buffer = Buffer.from(encrypted, 'base64');

  const salt = buffer.subarray(0, SALT_LENGTH);
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = buffer.subarray(buffer.length - TAG_LENGTH);
  const ciphertext = buffer.subarray(SALT_LENGTH + IV_LENGTH, buffer.length - TAG_LENGTH);

  const key = deriveKey(secretKey, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let plaintext = decipher.update(ciphertext, 'binary', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Store encrypted credentials in Supabase
 */
async function storeCredentials(env, userId, platform, credentialData) {
  const secretKey = env.SECRET_KEY || process.env.SECRET_KEY;
  if (!secretKey) {
    throw new Error('SECRET_KEY environment variable not set');
  }

  const encryptedData = encryptToken(JSON.stringify(credentialData), secretKey);
  const now = new Date().toISOString();

  const payload = {
    user_id: userId,
    platform: platform.toLowerCase(),
    encrypted_credentials: encryptedData,
    account_identifier: credentialData.accountIdentifier || null,
    scopes: credentialData.scopes ? credentialData.scopes.join(',') : null,
    expires_at: credentialData.expiresAt ? new Date(credentialData.expiresAt).toISOString() : null,
    created_at: now,
    updated_at: now,
  };

  // Upsert: try updating first, then insert if not found
  try {
    const existing = await rest(
      env,
      'GET',
      `/social_media_credentials?user_id=eq.${userId}&platform=eq.${platform.toLowerCase()}`,
    );

    if (existing && existing.length > 0) {
      // Update existing
      return rest(
        env,
        'PATCH',
        `/social_media_credentials?user_id=eq.${userId}&platform=eq.${platform.toLowerCase()}`,
        payload,
      );
    }
  } catch {
    // Not found, will insert below
  }

  // Insert new
  return rest(env, 'POST', '/social_media_credentials', payload);
}

/**
 * Retrieve and decrypt credentials from Supabase
 */
async function getCredentials(env, userId, platform) {
  const secretKey = env.SECRET_KEY || process.env.SECRET_KEY;
  if (!secretKey) {
    throw new Error('SECRET_KEY environment variable not set');
  }

  const records = await rest(
    env,
    'GET',
    `/social_media_credentials?user_id=eq.${userId}&platform=eq.${platform.toLowerCase()}`,
  );

  if (!records || records.length === 0) {
    return null;
  }

  const record = records[0];

  try {
    const decrypted = decryptToken(record.encrypted_credentials, secretKey);
    return {
      ...JSON.parse(decrypted),
      accountIdentifier: record.account_identifier,
      expiresAt: record.expires_at ? new Date(record.expires_at).getTime() : null,
      scopes: record.scopes ? record.scopes.split(',') : [],
      storedAt: record.created_at,
      updatedAt: record.updated_at,
    };
  } catch (err) {
    throw new Error(`Failed to decrypt credentials: ${err.message}`);
  }
}

/**
 * Store temporary OAuth state for CSRF protection
 * Returns the state token
 */
async function storeOAuthState(env, state, platform, expiresInSeconds = 600) {
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  await rest(env, 'POST', '/oauth_states', {
    state,
    platform: platform.toLowerCase(),
    expires_at: expiresAt,
  });

  return state;
}

/**
 * Verify and consume OAuth state (prevents replay attacks)
 */
async function verifyOAuthState(env, state, platform) {
  if (!state) {
    throw new Error('Missing OAuth state');
  }

  const records = await rest(
    env,
    'GET',
    `/oauth_states?state=eq.${encodeURIComponent(state)}&platform=eq.${platform.toLowerCase()}`,
  );

  if (!records || records.length === 0) {
    throw new Error('Invalid or expired OAuth state');
  }

  const record = records[0];
  const expiresAt = new Date(record.expires_at);

  if (expiresAt < new Date()) {
    // Clean up expired state
    await rest(env, 'DELETE', `/oauth_states?id=eq.${record.id}`);
    throw new Error('OAuth state expired');
  }

  // Consume the state (delete it so it can't be reused)
  await rest(env, 'DELETE', `/oauth_states?id=eq.${record.id}`);

  return true;
}

/**
 * Generate a cryptographically secure random state token
 */
function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  encryptToken,
  decryptToken,
  storeCredentials,
  getCredentials,
  storeOAuthState,
  verifyOAuthState,
  generateState,
};
