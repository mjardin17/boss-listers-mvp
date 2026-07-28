// lib/channels/apiConnectors.js
// Official-API connector structures: eBay, Etsy, Shopify, WooCommerce.
// Each is a real skeleton against the provider's documented API with
// working env-var detection and honest status reporting — but every
// network-touching method guards on credentials and NONE claims
// "connected" without a live authenticated test call succeeding.

const { BaseConnector, CONNECTION_STATUS } = require("./connector");

// ─────────────────────────────────────────────────────────────
// eBay — code exists in inventory-sync/ (Supabase Edge Function).
// Status is AWAITING_APPROVAL until Josh's developer account clears.
// ─────────────────────────────────────────────────────────────
class EbayConnector extends BaseConnector {
  constructor() { super("ebay"); }

  static ENV = ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_REFRESH_TOKEN", "EBAY_ENVIRONMENT"];

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(EbayConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.AWAITING_APPROVAL,
        detail: "Awaiting eBay Developer approval. Sync engine (ebay-sync Edge Function) is built and deployed separately — see inventory-sync/DEPLOY.md steps 3-6.",
      };
    }
    return this.testConnection();
  }

  async testConnection() {
    // Mirrors ebay-sync's token exchange: a successful client-credentials
    // refresh IS the authenticated test.
    const url = process.env.EBAY_ENVIRONMENT === "sandbox"
      ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
      : "https://api.ebay.com/identity/v1/oauth2/token";
    const auth = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: process.env.EBAY_REFRESH_TOKEN,
        scope: "https://api.ebay.com/oauth/api_scope/sell.inventory",
      }),
    });
    return res.ok
      ? { status: CONNECTION_STATUS.CONNECTED, detail: "OAuth token exchange succeeded" }
      : { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: `eBay auth failed (HTTP ${res.status})` };
  }
}

// ─────────────────────────────────────────────────────────────
// Etsy — Open API v3, OAuth 2.0 + PKCE.
// Docs: https://developers.etsy.com/documentation
// ─────────────────────────────────────────────────────────────
class EtsyConnector extends BaseConnector {
  constructor() { super("etsy"); }

  static ENV = ["ETSY_KEYSTRING", "ETSY_SHARED_SECRET", "ETSY_REDIRECT_URI", "ETSY_REFRESH_TOKEN"];
  static OAUTH_SCOPES = "listings_r listings_w transactions_r shops_r";
  static API_BASE = "https://openapi.etsy.com/v3/application";

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(EtsyConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: "Ready for credentials: register an app at etsy.com/developers, then set ETSY_KEYSTRING / ETSY_SHARED_SECRET / ETSY_REDIRECT_URI and complete OAuth via /api/channels/etsy/callback.",
      };
    }
    return this.testConnection();
  }

  async testConnection() {
    const res = await fetch(`${EtsyConnector.API_BASE}/openapi-ping`, {
      headers: { "x-api-key": process.env.ETSY_KEYSTRING },
    });
    return res.ok
      ? { status: CONNECTION_STATUS.CONNECTED, detail: "Etsy API ping succeeded" }
      : { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: `Etsy ping failed (HTTP ${res.status})` };
  }

  // importListings / createListing / updateListing / syncInventory /
  // importOrders / refreshToken: implemented when credentials exist —
  // endpoints are documented in CHANNEL_SETUP.md. Until then the base
  // class raises UnsupportedOperationError, which the API routes report
  // honestly instead of pretending success.
}

// ─────────────────────────────────────────────────────────────
// Shopify — GraphQL Admin API, per-store access token.
// Docs: https://shopify.dev/docs/api/admin-graphql
// ─────────────────────────────────────────────────────────────
class ShopifyConnector extends BaseConnector {
  constructor() { super("shopify"); }

  static ENV = ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_ACCESS_TOKEN"];
  static API_VERSION = "2026-04";

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(ShopifyConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.NOT_CONNECTED,
        detail: "Optional — not configured. Needs a Shopify store + custom app token (SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN).",
      };
    }
    return this.testConnection();
  }

  async testConnection() {
    const res = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${ShopifyConnector.API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query: "{ shop { name } }" }),
      },
    );
    return res.ok
      ? { status: CONNECTION_STATUS.CONNECTED, detail: "Shopify Admin API reachable" }
      : { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: `Shopify auth failed (HTTP ${res.status})` };
  }
}

// ─────────────────────────────────────────────────────────────
// WooCommerce — REST API v3, consumer key/secret over HTTPS.
// Docs: https://woocommerce.github.io/woocommerce-rest-api-docs/
// ─────────────────────────────────────────────────────────────
class WooCommerceConnector extends BaseConnector {
  constructor() { super("woocommerce"); }

  static ENV = ["WOOCOMMERCE_STORE_URL", "WOOCOMMERCE_CONSUMER_KEY", "WOOCOMMERCE_CONSUMER_SECRET"];

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(WooCommerceConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.NOT_CONNECTED,
        detail: "Optional — not configured. Needs a WooCommerce site (WOOCOMMERCE_STORE_URL, WOOCOMMERCE_CONSUMER_KEY, WOOCOMMERCE_CONSUMER_SECRET).",
      };
    }
    return this.testConnection();
  }

  async testConnection() {
    const url = new URL("/wp-json/wc/v3/system_status", process.env.WOOCOMMERCE_STORE_URL);
    url.searchParams.set("consumer_key", process.env.WOOCOMMERCE_CONSUMER_KEY);
    url.searchParams.set("consumer_secret", process.env.WOOCOMMERCE_CONSUMER_SECRET);
    const res = await fetch(url);
    return res.ok
      ? { status: CONNECTION_STATUS.CONNECTED, detail: "WooCommerce REST API reachable" }
      : { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: `WooCommerce auth failed (HTTP ${res.status})` };
  }
}

module.exports = { EbayConnector, EtsyConnector, ShopifyConnector, WooCommerceConnector };
