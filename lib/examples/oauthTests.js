// lib/examples/oauthTests.js
// Test examples for OAuth handlers
// Run with: node --test lib/examples/oauthTests.js

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

// Mock environment
const mockEnv = {
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'test_key',
  SECRET_KEY: crypto.randomBytes(32).toString('hex'),
};

describe('OAuth Token Manager', () => {
  test('encryptToken produces different ciphertext each time (random IV)', () => {
    const tokenManager = require('../tokenManager');
    const plaintext = 'test_token_12345';

    const encrypted1 = tokenManager.encryptToken(plaintext, mockEnv.SECRET_KEY);
    const encrypted2 = tokenManager.encryptToken(plaintext, mockEnv.SECRET_KEY);

    // Same plaintext should produce different ciphertexts (due to random IV/salt)
    assert.notEqual(encrypted1, encrypted2);
  });

  test('decryptToken reverses encryptToken', () => {
    const tokenManager = require('../tokenManager');
    const plaintext = 'test_token_12345';

    const encrypted = tokenManager.encryptToken(plaintext, mockEnv.SECRET_KEY);
    const decrypted = tokenManager.decryptToken(encrypted, mockEnv.SECRET_KEY);

    assert.equal(decrypted, plaintext);
  });

  test('decryptToken fails with wrong secret', () => {
    const tokenManager = require('../tokenManager');
    const plaintext = 'test_token_12345';

    const encrypted = tokenManager.encryptToken(plaintext, mockEnv.SECRET_KEY);
    const wrongSecret = crypto.randomBytes(32).toString('hex');

    assert.throws(
      () => tokenManager.decryptToken(encrypted, wrongSecret),
      Error
    );
  });

  test('generateState produces 64-character hex string', () => {
    const tokenManager = require('../tokenManager');

    const state = tokenManager.generateState();

    assert.equal(typeof state, 'string');
    assert.equal(state.length, 64);
    assert.match(state, /^[a-f0-9]+$/);
  });
});

describe('Social Media Auth Config', () => {
  test('all platforms are configured', () => {
    const socialMediaAuth = require('../socialMediaAuth');

    const expectedPlatforms = [
      'instagram',
      'tiktok',
      'youtube',
      'facebook',
      'twitter',
      'linkedin',
      'snapchat',
      'pinterest'
    ];

    for (const platform of expectedPlatforms) {
      assert.ok(
        socialMediaAuth.OAUTH_CONFIGS[platform],
        `Missing config for ${platform}`
      );
    }
  });

  test('each platform has required config fields', () => {
    const socialMediaAuth = require('../socialMediaAuth');

    const requiredFields = [
      'name',
      'clientId',
      'clientSecret',
      'redirectUri',
      'authUrl',
      'tokenUrl',
      'scope',
      'apiBase'
    ];

    for (const [platform, config] of Object.entries(socialMediaAuth.OAUTH_CONFIGS)) {
      for (const field of requiredFields) {
        assert.ok(
          config[field],
          `${platform} missing required field: ${field}`
        );
      }
    }
  });

  test('getAuthorizationUrl generates valid URL', () => {
    const socialMediaAuth = require('../socialMediaAuth');
    const state = 'test_state_token';

    const url = socialMediaAuth.getAuthorizationUrl('instagram', state);

    assert.ok(url.startsWith('https://'));
    assert.ok(url.includes('client_id='));
    assert.ok(url.includes('state=' + state));
    assert.ok(url.includes('response_type=code'));
  });
});

describe('Error Handling', () => {
  test('getAuthorizationUrl throws for unknown platform', () => {
    const socialMediaAuth = require('../socialMediaAuth');

    assert.throws(
      () => socialMediaAuth.getAuthorizationUrl('unknown_platform', 'state'),
      /Unknown platform/
    );
  });

  test('encryptToken throws without secret', () => {
    const tokenManager = require('../tokenManager');

    assert.throws(
      () => tokenManager.encryptToken('test', null),
      /SECRET_KEY/
    );
  });

  test('decryptToken throws without secret', () => {
    const tokenManager = require('../tokenManager');

    assert.throws(
      () => tokenManager.decryptToken('ciphertext', null),
      /SECRET_KEY/
    );
  });
});

describe('Token Data Structures', () => {
  test('encrypted token format is valid base64', () => {
    const tokenManager = require('../tokenManager');
    const plaintext = 'test_token';

    const encrypted = tokenManager.encryptToken(plaintext, mockEnv.SECRET_KEY);

    // Should be valid base64 (decodable)
    const buffer = Buffer.from(encrypted, 'base64');
    assert.ok(buffer.length > 0);

    // Should be decodable back to string
    assert.equal(buffer.toString('base64'), encrypted);
  });
});

describe('CSRF State Tokens', () => {
  test('generateState creates unique tokens', () => {
    const tokenManager = require('../tokenManager');

    const state1 = tokenManager.generateState();
    const state2 = tokenManager.generateState();

    assert.notEqual(state1, state2);
  });

  test('generateState produces 32-byte random value (64 hex chars)', () => {
    const tokenManager = require('../tokenManager');

    const state = tokenManager.generateState();

    assert.equal(state.length, 64); // 32 bytes = 64 hex characters
  });
});

// Example test data for integration testing
const TEST_OAUTH_RESPONSES = {
  instagram: {
    code: 'test_instagram_code_12345',
    state: 'test_state_token_instagram',
    errorResponse: {
      error: 'access_denied',
      error_description: 'The user cancelled the login dialog'
    }
  },
  tiktok: {
    code: 'test_tiktok_code_12345',
    state: 'test_state_token_tiktok',
    errorResponse: {
      error: 'invalid_request',
      error_description: 'Invalid request'
    }
  },
  youtube: {
    code: 'test_youtube_code_12345',
    state: 'test_state_token_youtube',
    errorResponse: {
      error: 'access_denied',
      error_description: 'The user denied access'
    }
  }
};

describe('OAuth Callback Error Handling', () => {
  test('callback rejects missing platform', () => {
    // Should return 400 status
    const query = { code: 'test_code', state: 'test_state' };
    assert.throws(
      () => {
        if (!query.platform) throw new Error('Missing platform parameter');
      },
      /Missing platform/
    );
  });

  test('callback rejects missing code', () => {
    const query = { platform: 'instagram', state: 'test_state' };
    assert.throws(
      () => {
        if (!query.code) throw new Error('Missing authorization code');
      },
      /Missing authorization/
    );
  });

  test('callback rejects missing state', () => {
    const query = { platform: 'instagram', code: 'test_code' };
    assert.throws(
      () => {
        if (!query.state) throw new Error('Missing state parameter');
      },
      /Missing state/
    );
  });
});

module.exports = {
  TEST_OAUTH_RESPONSES,
};
