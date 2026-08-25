// lib/vault/credentialVault.js
// Simple in-memory credential vault for Boss Listers multi-platform posting
// Stores platform credentials (API keys, tokens, OAuth refresh tokens)
// In production, use Supabase Vault or AWS Secrets Manager

const PLATFORMS = {
  POSHMARK: 'poshmark',
  MERCARI: 'mercari',
  FACEBOOK: 'facebook',
  EBAY: 'ebay',
  ETSY: 'etsy',
  SHOPIFY: 'shopify',
};

class CredentialVault {
  constructor() {
    // In-memory storage (production: use Supabase/AWS Secrets)
    this.credentials = {};
    this.connectionStatus = {};
    this.initializeStatus();
  }

  initializeStatus() {
    Object.values(PLATFORMS).forEach(platform => {
      this.connectionStatus[platform] = {
        status: 'not_connected',
        lastChecked: null,
        error: null,
      };
    });
  }

  // Save credential for a platform
  async saveCredential(platform, credentialKey, credentialValue) {
    if (!Object.values(PLATFORMS).includes(platform)) {
      throw new Error(`Unknown platform: ${platform}`);
    }

    if (!this.credentials[platform]) {
      this.credentials[platform] = {};
    }

    this.credentials[platform][credentialKey] = credentialValue;
    this.connectionStatus[platform].lastChecked = new Date().toISOString();

    return {
      ok: true,
      platform,
      credentialKey,
      savedAt: this.connectionStatus[platform].lastChecked,
    };
  }

  // Get credential for a platform
  async getCredential(platform, credentialKey) {
    if (!Object.values(PLATFORMS).includes(platform)) {
      throw new Error(`Unknown platform: ${platform}`);
    }

    const platformCreds = this.credentials[platform];
    if (!platformCreds) {
      return null;
    }

    return platformCreds[credentialKey] || null;
  }

  // Get all credentials for a platform (use with caution)
  async getPlatformCredentials(platform) {
    if (!Object.values(PLATFORMS).includes(platform)) {
      throw new Error(`Unknown platform: ${platform}`);
    }

    return this.credentials[platform] || {};
  }

  // List all connected platforms
  async listConnectedPlatforms() {
    return Object.entries(this.credentials)
      .filter(([_, creds]) => Object.keys(creds).length > 0)
      .map(([platform]) => ({
        platform,
        status: this.connectionStatus[platform].status,
        lastChecked: this.connectionStatus[platform].lastChecked,
      }));
  }

  // Remove credentials for a platform
  async removeCredentials(platform) {
    if (!Object.values(PLATFORMS).includes(platform)) {
      throw new Error(`Unknown platform: ${platform}`);
    }

    const had = !!this.credentials[platform];
    delete this.credentials[platform];
    this.connectionStatus[platform].status = 'not_connected';
    this.connectionStatus[platform].lastChecked = new Date().toISOString();

    return {
      ok: true,
      platform,
      removed: had,
    };
  }

  // Test connection to a platform (stub — implement per platform)
  async testConnection(platform) {
    if (!Object.values(PLATFORMS).includes(platform)) {
      throw new Error(`Unknown platform: ${platform}`);
    }

    const creds = this.credentials[platform];
    if (!creds || Object.keys(creds).length === 0) {
      this.connectionStatus[platform].status = 'not_connected';
      this.connectionStatus[platform].error = 'No credentials stored';
      return {
        ok: false,
        platform,
        status: 'not_connected',
        error: 'No credentials stored',
      };
    }

    // TODO: Implement per-platform API test
    // For now, assume credentials are valid if stored
    this.connectionStatus[platform].status = 'connected';
    this.connectionStatus[platform].error = null;

    return {
      ok: true,
      platform,
      status: 'connected',
      testedAt: new Date().toISOString(),
    };
  }

  // Get vault status
  async getStatus() {
    return {
      platforms: this.connectionStatus,
      connected: Object.entries(this.connectionStatus)
        .filter(([_, status]) => status.status === 'connected')
        .map(([platform]) => platform),
      totalPlatforms: Object.keys(PLATFORMS).length,
    };
  }
}

// Singleton instance
let vaultInstance = null;

export function getVault() {
  if (!vaultInstance) {
    vaultInstance = new CredentialVault();
  }
  return vaultInstance;
}

export const SUPPORTED_PLATFORMS = PLATFORMS;
export { CredentialVault };
