# OAuth API Reference

Complete API documentation for OAuth endpoints and modules.

## Endpoints

### `GET /api/oauth/authorize`

Initiate OAuth flow with CSRF protection.

**Query Parameters:**
- `platform` (required): `instagram`, `tiktok`, `youtube`, `facebook`, `twitter`, `linkedin`, `snapchat`, or `pinterest`
- `redirect` (optional): URL to redirect to after callback (handled by client)

**Headers:**
- `Authorization: Bearer {userSessionToken}` (required)

**Response:**
```json
{
  "ok": true,
  "authUrl": "https://api.instagram.com/oauth/authorize?...",
  "state": "a1b2c3d4e5f6g7h8...",
  "platform": "instagram",
  "expiresIn": 600
}
```

**Error Response:**
```json
{
  "ok": false,
  "error": "Missing or invalid platform parameter"
}
```

**Status Codes:**
- `200` — Success
- `400` — Missing/invalid platform
- `401` — Not authenticated
- `405` — Wrong HTTP method
- `500` — Server error (Supabase unavailable)

---

### `GET /api/oauth/[platform]/callback`

Handle OAuth provider callback. Automatically called by the OAuth provider after user authorizes.

**Query Parameters:**
- `code` (required): Authorization code from provider
- `state` (required): CSRF state token
- `error` (optional): Error code if user denied authorization
- `error_description` (optional): Error details

**Response:**
```json
{
  "ok": true,
  "platform": "instagram",
  "accountIdentifier": "my_business_account",
  "message": "Successfully connected to Instagram"
}
```

**Error Response:**
```json
{
  "ok": false,
  "error": "OAuth callback failed",
  "errorType": "csrf_failed",
  "platform": "instagram"
}
```

**Error Types:**
- `csrf_failed` — State token invalid or expired
- `token_exchange_failed` — Provider rejected code
- `session_invalid` — User not authenticated
- `unknown` — Other error

**Status Codes:**
- `200` — Success
- `400` — Missing code/state or provider error
- `401` — Not authenticated
- `405` — Wrong HTTP method
- `500` — OAuth processing failed
- `502` — Provider API error
- `504` — Provider timeout

---

## Modules

### `lib/tokenManager.js`

Token encryption, storage, and CSRF state management.

#### `encryptToken(plaintext, secretKey)`

Encrypt data using AES-256-GCM.

**Parameters:**
- `plaintext` (string): Data to encrypt
- `secretKey` (string): Hex-encoded 32-byte secret

**Returns:** Base64-encoded ciphertext (includes salt, IV, tag)

**Throws:** `Error` if SECRET_KEY is missing

**Example:**
```javascript
const tokenManager = require('./lib/tokenManager');

const encrypted = tokenManager.encryptToken(
  '{"accessToken": "..."}',
  process.env.SECRET_KEY
);
```

---

#### `decryptToken(encrypted, secretKey)`

Decrypt data encrypted with `encryptToken`.

**Parameters:**
- `encrypted` (string): Base64-encoded ciphertext
- `secretKey` (string): Hex-encoded 32-byte secret

**Returns:** Decrypted plaintext

**Throws:** `Error` if decryption fails (wrong key, tampered data)

**Example:**
```javascript
const plaintext = tokenManager.decryptToken(encrypted, process.env.SECRET_KEY);
const data = JSON.parse(plaintext);
```

---

#### `storeOAuthState(env, state, platform, expiresInSeconds)`

Store CSRF state token in Supabase.

**Parameters:**
- `env` (object): `{ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }`
- `state` (string): Hex state token from `generateState()`
- `platform` (string): Platform name
- `expiresInSeconds` (number): Expiry time (default: 600)

**Returns:** State token (same as input)

**Throws:** Error if Supabase unavailable

**Example:**
```javascript
const state = tokenManager.generateState();
await tokenManager.storeOAuthState(env, state, 'instagram', 600);
```

---

#### `verifyOAuthState(env, state, platform)`

Verify state token and consume it (prevents replay attacks).

**Parameters:**
- `env` (object): `{ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }`
- `state` (string): State from OAuth callback
- `platform` (string): Platform name

**Returns:** `true` if valid

**Throws:** Error if state is invalid, expired, or already consumed

**Example:**
```javascript
try {
  await tokenManager.verifyOAuthState(env, state, 'instagram');
  // State is valid, proceed
} catch (err) {
  // State invalid or expired
}
```

---

#### `generateState()`

Generate cryptographically secure CSRF state token.

**Returns:** 64-character hex string (32 random bytes)

**Example:**
```javascript
const state = tokenManager.generateState();
// "a1b2c3d4e5f6..." (64 chars)
```

---

### `lib/supabaseCredentials.js`

High-level credential storage and retrieval.

#### `storeSocialMediaCredentials(env, userId, platform, oauthData)`

Store encrypted OAuth credentials for a user.

**Parameters:**
- `env` (object): `{ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SECRET_KEY }`
- `userId` (string): User ID from auth.users
- `platform` (string): Platform name
- `oauthData` (object): Contains:
  - `accessToken` (string, required)
  - `refreshToken` (string, optional)
  - `expiresAt` (number, optional): Unix timestamp
  - `expiresIn` (number, optional): Seconds until expiry
  - `scopes` (array, optional): Permission scopes
  - `accountIdentifier` (string, optional): Display name
  - `additionalData` (object, optional): Platform-specific data

**Returns:** Supabase insert/update response

**Throws:** Error if validation fails or Supabase error

**Example:**
```javascript
await storeSocialMediaCredentials(env, userId, 'instagram', {
  accessToken: 'IGABCDEF123456...',
  refreshToken: 'IGDEFGH789012...',
  expiresAt: Date.now() + 3600 * 1000,
  accountIdentifier: 'my_business_account',
  scopes: ['instagram_business_basic', 'instagram_business_content_publish']
});
```

---

#### `getSocialMediaCredentials(env, userId, platform)`

Retrieve and decrypt credentials.

**Parameters:**
- `env` (object): `{ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SECRET_KEY }`
- `userId` (string): User ID
- `platform` (string): Platform name

**Returns:** Credential object with:
- `accessToken` (string)
- `refreshToken` (string|null)
- `expiresAt` (number|null): Unix timestamp
- `scopes` (array)
- `accountIdentifier` (string|null)
- `storedAt` (string): ISO timestamp
- `updatedAt` (string): ISO timestamp

**Returns:** `null` if no credentials found

**Throws:** Error if decryption fails

**Example:**
```javascript
const creds = await getSocialMediaCredentials(env, userId, 'instagram');
const accessToken = creds.accessToken; // Ready to use
```

---

#### `refreshCredentialsIfNeeded(env, userId, platform)`

Get credentials, auto-refreshing if expired.

**Parameters:**
- `env` (object): `{ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SECRET_KEY }`
- `userId` (string): User ID
- `platform` (string): Platform name

**Returns:** Fresh or stale credentials (whichever available)

**Behavior:**
- If credentials don't expire soon: return as-is
- If expired and refresh token available: refresh and return new credentials
- If no refresh token: return stale credentials
- If refresh fails: return stale credentials with warning logged

**Example:**
```javascript
const creds = await refreshCredentialsIfNeeded(env, userId, 'instagram');
const accessToken = creds.accessToken; // Safe to use
```

---

#### `deleteSocialMediaCredentials(env, userId, platform)`

Revoke and delete stored credentials.

**Parameters:**
- `env` (object): `{ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }`
- `userId` (string): User ID
- `platform` (string): Platform name

**Returns:** Supabase delete response

**Throws:** Error if validation fails

**Example:**
```javascript
await deleteSocialMediaCredentials(env, userId, 'instagram');
```

---

#### `listConnectedPlatforms(env, userId)`

Get all connected platforms for a user.

**Parameters:**
- `env` (object): `{ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY }`
- `userId` (string): User ID

**Returns:** Array of platform objects:
```json
[
  {
    "platform": "instagram",
    "accountIdentifier": "my_business_account",
    "expiresAt": "2024-12-31T23:59:59Z",
    "scopes": ["instagram_business_basic", "..."],
    "connectedAt": "2024-01-15T12:00:00Z",
    "lastRefreshed": "2024-01-20T15:30:00Z"
  }
]
```

**Example:**
```javascript
const platforms = await listConnectedPlatforms(env, userId);
platforms.forEach(p => {
  console.log(`${p.platform}: ${p.accountIdentifier}`);
});
```

---

### `lib/socialMediaAuth.js`

Platform-specific OAuth configuration.

#### `OAUTH_CONFIGS`

Object containing configuration for all platforms:

```javascript
{
  instagram: {
    name: "Instagram",
    clientId: "...",
    clientSecret: "...",
    redirectUri: "http://localhost:3001/api/oauth/instagram/callback",
    authUrl: "https://api.instagram.com/oauth/authorize",
    tokenUrl: "https://graph.instagram.com/v18.0/oauth/access_token",
    scope: "instagram_business_basic,instagram_business_content_publish",
    apiBase: "https://graph.instagram.com/v18.0"
  },
  // ... other platforms
}
```

---

#### `getAuthorizationUrl(platform, state)`

Build OAuth authorization URL.

**Parameters:**
- `platform` (string): Platform name
- `state` (string): CSRF state token

**Returns:** Full authorization URL (ready to redirect to)

**Throws:** Error if platform unknown

**Example:**
```javascript
const url = socialMediaAuth.getAuthorizationUrl('instagram', state);
// "https://api.instagram.com/oauth/authorize?client_id=...&state=..."
```

---

#### `getAccessToken(platform, code)`

Exchange authorization code for tokens.

**Parameters:**
- `platform` (string): Platform name
- `code` (string): Authorization code from callback

**Returns:** Token object:
```json
{
  "platform": "instagram",
  "accessToken": "IGABCDEF123...",
  "refreshToken": "IGDEFGH789...",
  "expiresIn": 3600,
  "expiresAt": 1234567890
}
```

**Throws:** Error if:
- Platform unknown
- Code invalid or expired
- Provider API error

**Example:**
```javascript
const tokens = await socialMediaAuth.getAccessToken('instagram', code);
```

---

#### `refreshAccessToken(platform, refreshToken)`

Refresh expired access token.

**Parameters:**
- `platform` (string): Platform name
- `refreshToken` (string): Refresh token

**Returns:** New token object (same structure as `getAccessToken`)

**Returns:** `null` if platform doesn't support refresh or refresh token is invalid

**Throws:** Error on network/API errors

**Example:**
```javascript
const newTokens = await socialMediaAuth.refreshAccessToken('instagram', refreshToken);
```

---

## Database Schema

### `social_media_credentials` Table

```sql
CREATE TABLE social_media_credentials (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  platform TEXT NOT NULL,
  encrypted_credentials TEXT NOT NULL, -- AES-256-GCM encrypted
  account_identifier TEXT,              -- For quick display
  scopes TEXT,                          -- Comma-separated
  expires_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(user_id, platform)
);
```

### `oauth_states` Table

```sql
CREATE TABLE oauth_states (
  id UUID PRIMARY KEY,
  state TEXT NOT NULL UNIQUE,     -- CSRF token
  platform TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,  -- 10-15 min expiry
  created_at TIMESTAMP
);
```

### `social_media_connections_log` Table

```sql
CREATE TABLE social_media_connections_log (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  platform TEXT NOT NULL,
  account_identifier TEXT,
  event TEXT,              -- 'oauth_connected', 'oauth_disconnected', etc
  ip_address TEXT,
  user_agent TEXT,
  error_message TEXT,
  created_at TIMESTAMP
);
```

---

## Error Codes

| Code | Meaning | Resolution |
|------|---------|-----------|
| `csrf_failed` | State token invalid/expired | Restart OAuth flow |
| `token_exchange_failed` | Provider rejected code | Check CLIENT_ID/SECRET |
| `session_invalid` | User not authenticated | User must log in |
| `platform_not_found` | Platform not configured | Add platform config to env |
| `encryption_failed` | Can't decrypt credentials | Check SECRET_KEY |
| `api_error` | Provider API error | Check platform status/credentials |
| `timeout` | Provider took too long | Retry (provider may be slow) |

---

## Security

### Encryption
- **Algorithm:** AES-256-GCM
- **Key derivation:** PBKDF2 (100,000 iterations)
- **Unique salt and IV:** Each encryption has random salt/IV
- **Authentication tag:** Prevents tampering

### CSRF Protection
- **State tokens:** Random 32-byte values, 10-minute expiry
- **Replay prevention:** States deleted after use
- **Verification:** Must match on callback

### Session Security
- **Bearer token required:** User must be authenticated
- **RLS policies:** Users can only access own credentials
- **Service role:** Only for backend operations

### Data Storage
- **Encrypted at rest:** All tokens encrypted
- **No plaintext in logs:** Error messages don't include tokens
- **Audit logging:** All connections/disconnections logged

---

## Rate Limiting

Built into Next.js API routes. Default limits:

- **Authorization endpoint:** 10 requests per minute per IP
- **Callback endpoint:** 5 requests per minute per IP
- **Token refresh:** 30 requests per hour per user

Configure in `next.config.js` if needed.

---

## Testing

See `lib/examples/oauthTests.js` for unit tests.

Run tests:
```bash
node --test lib/examples/oauthTests.js
```

Test OAuth flow manually:
```bash
# 1. Start dev server
npm run dev

# 2. Navigate to auth page
# http://localhost:3001/auth/connect/instagram

# 3. Complete OAuth flow

# 4. Check Supabase: verify credentials stored
psql ... -c "SELECT * FROM social_media_credentials;"
```
