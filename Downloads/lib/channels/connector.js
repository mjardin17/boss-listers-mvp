// lib/channels/connector.js
// Common connector contract every channel implements. API connectors
// (eBay, Etsy, Shopify, WooCommerce) implement these against official
// APIs; manual channels implement the subset that makes sense and mark
// the rest unsupported.
//
// RULES (enforced across all connectors):
//  * No connector may claim status "connected" unless a real
//    authenticated API call succeeded (testConnection()).
//  * Secrets come from server-side env vars only — never from the DB,
//    never from the client, never hardcoded.
//  * Every sync writes a sync log row; failures increment retry_count.
//  * Nothing cross-posts automatically — user confirmation required.

/** Every connector returns this from getConnectionStatus(). */
const CONNECTION_STATUS = Object.freeze({
  CONNECTED: "connected",           // real API test succeeded
  NOT_CONNECTED: "not_connected",
  AWAITING_APPROVAL: "awaiting_approval",
  MANUAL: "manual_workflow",
  CONFIG_REQUIRED: "configuration_required",
});

/** Thrown by any interface method a channel doesn't support. */
class UnsupportedOperationError extends Error {
  constructor(channel, operation) {
    super(`${channel} does not support ${operation}`);
    this.name = "UnsupportedOperationError";
    this.statusCode = 400;
  }
}

/**
 * Base connector. Subclasses override what they support.
 * Method set matches the channel architecture spec:
 * connect, disconnect, testConnection, importListings, createListing,
 * updateListing, endListing, syncInventory, importOrders, refreshToken,
 * getConnectionStatus.
 */
class BaseConnector {
  /** @param {string} channel machine name, e.g. "etsy" */
  constructor(channel) {
    this.channel = channel;
  }

  unsupported(op) {
    throw new UnsupportedOperationError(this.channel, op);
  }

  async connect() { this.unsupported("connect"); }
  async disconnect() { this.unsupported("disconnect"); }
  async testConnection() { this.unsupported("testConnection"); }
  async importListings() { this.unsupported("importListings"); }
  async createListing() { this.unsupported("createListing"); }
  async updateListing() { this.unsupported("updateListing"); }
  async endListing() { this.unsupported("endListing"); }
  async syncInventory() { this.unsupported("syncInventory"); }
  async importOrders() { this.unsupported("importOrders"); }
  async refreshToken() { this.unsupported("refreshToken"); }

  /** @returns {Promise<{status: string, detail: string}>} */
  async getConnectionStatus() {
    return { status: CONNECTION_STATUS.NOT_CONNECTED, detail: "Not configured" };
  }

  /** True when every required env var is present (never logs values). */
  hasRequiredEnv(names) {
    return names.every((n) => Boolean(process.env[n]));
  }
}

module.exports = { BaseConnector, CONNECTION_STATUS, UnsupportedOperationError };
