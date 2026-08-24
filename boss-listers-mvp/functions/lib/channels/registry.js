// lib/channels/registry.js
// Single source of truth for what channels exist, how each connects,
// and its live status. The Channels page and /api/channels read this.

const { CONNECTION_STATUS } = require("./connector");
const { EbayConnector, EtsyConnector, ShopifyConnector, WooCommerceConnector } = require("./apiConnectors");
const { MANUAL_PLATFORMS } = require("./manualPackage");

const API_CONNECTORS = {
  ebay: new EbayConnector(),
  etsy: new EtsyConnector(),
  shopify: new ShopifyConnector(),
  woocommerce: new WooCommerceConnector(),
};

/** Static descriptors — merged with live status at request time. */
const CHANNELS = [
  { id: "ebay",        label: "eBay",                 mode: "api",    setup: "CHANNEL_SETUP.md#ebay" },
  { id: "etsy",        label: "Etsy",                 mode: "api",    setup: "CHANNEL_SETUP.md#etsy" },
  { id: "shopify",     label: "Shopify",              mode: "api",    setup: "CHANNEL_SETUP.md#shopify", optional: true },
  { id: "woocommerce", label: "WooCommerce",          mode: "api",    setup: "CHANNEL_SETUP.md#woocommerce", optional: true },
  { id: "facebook",    label: "Facebook Marketplace", mode: "manual", setup: "CHANNEL_SETUP.md#manual-channels" },
  { id: "offerup",     label: "OfferUp",              mode: "manual", setup: "CHANNEL_SETUP.md#manual-channels" },
  { id: "craigslist",  label: "Craigslist",           mode: "manual", setup: "CHANNEL_SETUP.md#manual-channels" },
  { id: "mercari",     label: "Mercari",              mode: "manual", setup: "CHANNEL_SETUP.md#manual-channels" },
  { id: "poshmark",    label: "Poshmark",             mode: "manual", setup: "CHANNEL_SETUP.md#manual-channels" },
];

/**
 * Live status for every channel. Manual channels are always available
 * (they need no credentials); API channels report their honest state.
 * `probe: true` runs real network tests on configured API channels.
 */
async function getChannelStatuses({ probe = false } = {}) {
  return Promise.all(CHANNELS.map(async (ch) => {
    if (ch.mode === "manual") {
      return {
        ...ch,
        status: CONNECTION_STATUS.MANUAL,
        detail: `Manual listing package available (${MANUAL_PLATFORMS[ch.id].label})`,
      };
    }
    const connector = API_CONNECTORS[ch.id];
    try {
      const result = probe
        ? await connector.getConnectionStatus()
        : await staticStatus(connector);
      return { ...ch, ...result };
    } catch (err) {
      return { ...ch, status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: err.message };
    }
  }));
}

/** Env-presence check only — no network. Used for fast page loads. */
async function staticStatus(connector) {
  const envNames = connector.constructor.ENV || [];
  if (!connector.hasRequiredEnv(envNames)) {
    // Delegate to the connector's own no-creds message (it knows whether
    // that means awaiting-approval, config-required, or optional).
    return connector.getConnectionStatus();
  }
  return {
    status: CONNECTION_STATUS.CONFIG_REQUIRED,
    detail: "Credentials present — run Test Connection to verify (never assumed connected without a live test).",
  };
}

module.exports = { CHANNELS, API_CONNECTORS, getChannelStatuses };
