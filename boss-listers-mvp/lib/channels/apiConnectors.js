// lib/channels/apiConnectors.js
// Official-API connector structures: eBay, Etsy, Shopify, WooCommerce.
// Each is a real skeleton against the provider's documented API with
// working env-var detection and honest status reporting — but every
// network-touching method guards on credentials and NONE claims
// "connected" without a live authenticated test call succeeding.

const { BaseConnector, CONNECTION_STATUS } = require("./connector");

/** Thrown by EbayConnector.createListing() on any failure. Carries the
 * Python bridge service's structured error fields so a caller can branch
 * on `code` (e.g. "offer_created_not_published" means real, recoverable
 * state exists on eBay's side and must not be retried blindly). */
class EbayListingError extends Error {
  constructor(code, message, { statusCode, step, offerId, ebayStatus, ebayBody } = {}) {
    super(message);
    this.name = "EbayListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
    this.step = step;
    this.offerId = offerId;
    this.ebayStatus = ebayStatus;
    this.ebayBody = ebayBody;
  }
}

// ─────────────────────────────────────────────────────────────
// eBay — code exists in inventory-sync/ (Supabase Edge Function).
// Status is AWAITING_APPROVAL until Josh's developer account clears.
//
// createListing() does NOT reimplement eBay's listing API here — that
// logic lives in lib/ebay_listing.py (the canonical client, see CLAUDE.md)
// and is called through a small internal HTTP bridge
// (scripts/ebay_listing_service.py, localhost only). This mirrors the
// architecture decision already made after a prior JS eBay connector
// duplicated that logic and shipped bugs already fixed in the Python
// client.
// ─────────────────────────────────────────────────────────────
class EbayConnector extends BaseConnector {
  constructor() {
    super("ebay");
    // In-memory only — never persisted, never logged. Access tokens last
    // ~7200s; refreshing on every listing call would be wasteful and adds
    // an extra round trip to every publish attempt. Keyed per tenantId
    // (plus a "__shared__" slot for the app-owner fallback) so different
    // customers' tokens never collide or leak into each other's requests.
    this._accessTokenCache = {};
  }

  static ENV = ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET", "EBAY_REFRESH_TOKEN", "EBAY_ENVIRONMENT"];
  static LISTING_SERVICE_URL = process.env.EBAY_LISTING_SERVICE_URL || "http://127.0.0.1:8791";
  // 5-minute safety margin before the real expiry — never hand out a token
  // that could expire mid-request to the bridge service.
  static TOKEN_EXPIRY_SAFETY_MARGIN_MS = 5 * 60 * 1000;

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
    const url = process.env.EBAY_ENVIRONMENT === "sandbox"
      ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
      : "https://api.ebay.com/identity/v1/oauth2/token";
    const auth = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: process.env.EBAY_REFRESH_TOKEN,
          scope: "https://api.ebay.com/oauth/api_scope/sell.inventory",
        }),
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok
        ? { status: CONNECTION_STATUS.CONNECTED, detail: "OAuth token exchange succeeded" }
        : { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: `eBay auth failed (HTTP ${res.status})` };
    } catch (err) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: err.name === "TimeoutError" ? "eBay did not respond within 10s" : `eBay request failed: ${err.message}`,
      };
    }
  }

  /** Fetches and decrypts a TENANT's own eBay refresh token via the
   * service_role-only RPC (see migration 0014). Requires
   * SUPABASE_SERVICE_ROLE_KEY — never exposed to the client, server-only.
   * Returns null if this tenant hasn't connected eBay, so callers can
   * fall back or report a clear "not connected" error rather than crash. */
  async _getTenantRefreshToken(tenantId) {
    if (!tenantId) return null;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      throw new EbayListingError(
        "service_role_key_missing",
        "SUPABASE_SERVICE_ROLE_KEY is not configured — cannot look up a tenant's own eBay connection.",
        { statusCode: 500 },
      );
    }
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/get_decrypted_marketplace_token`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_tenant_id: tenantId,
        p_marketplace: "ebay",
        p_environment: process.env.EBAY_ENVIRONMENT === "sandbox" ? "sandbox" : "production",
      }),
    });
    if (!res.ok) {
      throw new EbayListingError(
        "tenant_token_lookup_failed", `Failed to look up tenant's eBay connection (HTTP ${res.status})`,
        { statusCode: 502 },
      );
    }
    const token = await res.json();
    return token || null; // RPC returns null (as JSON `null`) when not connected
  }

  /** Cached OAuth access token for createListing(). Separate from
   * testConnection() above — that method is a status probe and must not
   * change behavior for it. Never logs, never returns the token itself to
   * a caller outside this class.
   *
   * When `tenantId` is given, uses THAT tenant's own connected eBay
   * account (via _getTenantRefreshToken) instead of the shared
   * EBAY_REFRESH_TOKEN — this is the fix for a real bug found by security
   * review: without this, every tenant's "connected" eBay account was
   * decorative, and listings were silently created under the app owner's
   * shared account regardless of which customer initiated them. Cache key
   * includes tenantId so different tenants' tokens never collide. */
  async _getAccessToken(tenantId) {
    const now = Date.now();
    const cacheKey = tenantId || "__shared__";
    if (this._accessTokenCache?.[cacheKey] && now < this._accessTokenCache[cacheKey].expiresAt) {
      return this._accessTokenCache[cacheKey].token;
    }
    this._accessTokenCache = this._accessTokenCache || {};

    let refreshToken = process.env.EBAY_REFRESH_TOKEN;
    if (tenantId) {
      const tenantToken = await this._getTenantRefreshToken(tenantId);
      if (!tenantToken) {
        throw new EbayListingError(
          "ebay_not_connected",
          "This account hasn't connected eBay yet.",
          { statusCode: 409 },
        );
      }
      refreshToken = tenantToken;
    }

    const url = process.env.EBAY_ENVIRONMENT === "sandbox"
      ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
      : "https://api.ebay.com/identity/v1/oauth2/token";
    const auth = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${auth}` },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          // Must match exactly what the refresh token was originally
          // granted for — a refresh request asking for a scope not in the
          // original consent is rejected by eBay with HTTP 400, not a
          // helpful "missing scope" message. Confirmed the hard way once
          // already. The current EBAY_REFRESH_TOKEN was consented with
          // BOTH of these scopes (needed sell.account added for the
          // Business Policies APIs — fulfillment/payment/return policy —
          // which sell.inventory alone cannot read or write).
          scope: "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account",
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new EbayListingError(
        "token_refresh_failed",
        err.name === "TimeoutError"
          ? "eBay did not respond within 10s while refreshing the access token"
          : `eBay token refresh failed: ${err.message}`,
        { statusCode: 502 },
      );
    }

    if (!res.ok) {
      throw new EbayListingError(
        "token_refresh_failed", `eBay token refresh returned HTTP ${res.status}`,
        { statusCode: res.status },
      );
    }

    const body = await res.json();
    if (!body.access_token) {
      throw new EbayListingError(
        "token_refresh_failed",
        "eBay token refresh succeeded but returned no access_token",
        { statusCode: 502 },
      );
    }

    const expiresInMs = (body.expires_in || 7200) * 1000;
    this._accessTokenCache[cacheKey] = {
      token: body.access_token,
      expiresAt: now + expiresInMs - EbayConnector.TOKEN_EXPIRY_SAFETY_MARGIN_MS,
    };

    return body.access_token;
  }

  /**
   * Create (and optionally publish) an eBay listing via the internal
   * Python bridge service — see scripts/ebay_listing_service.py. This
   * class does NOT reimplement eBay's Inventory API; it only fetches an
   * access token and forwards the request.
   *
   * @param {object} product  Matches EbayProduct fields: sku, title,
   *   description, price, category_id, quantity, condition, image_urls,
   *   marketplace_id, currency, aspects.
   * @param {object} policies Matches EbayListingPolicies fields:
   *   fulfillment_policy_id, payment_policy_id, return_policy_id,
   *   merchant_location_key. All four required, no defaults.
   * @param {object} [options]
   * @param {boolean} [options.dryRun=true] Defaults to true. Publishing a
   *   real listing requires explicitly passing `dryRun: false` here AND
   *   `confirm: "PUBLISH_LIVE"` AND the bridge service having been started
   *   with --allow-live. Any one missing keeps this a dry run or refuses.
   * @param {string} [options.confirm] Must be exactly "PUBLISH_LIVE" for a
   *   live request; ignored for dry runs.
   * @param {boolean} [options.sandbox=false] Use eBay's sandbox API host.
   * @param {string} [options.tenantId] When given, uses THIS tenant's own
   *   connected eBay account instead of the shared app-owner credentials.
   *   Must be resolved server-side from the caller's own session (e.g. via
   *   resolveSession() in lib/supabaseAuth.js) — NEVER accept a tenantId
   *   directly from client input, or one tenant could create listings
   *   under another tenant's eBay account.
   * @returns {Promise<object>} The bridge service's response: {ok,
   *   dry_run, published, sku, offer_id, listing_id, steps, payloads}.
   * @throws {EbayListingError}
   */
  async createListing(product, policies, options = {}) {
    const { dryRun = true, confirm, sandbox = false, tenantId } = options;

    const accessToken = await this._getAccessToken(tenantId);

    const requestBody = {
      access_token: accessToken,
      product,
      policies,
      dry_run: dryRun,
      sandbox,
    };
    if (confirm !== undefined) requestBody.confirm = confirm;

    const headers = { "Content-Type": "application/json" };
    if (dryRun === false) {
      // The bridge enforces this independently regardless of whether it's
      // sent — but sending it whenever present means a live call never
      // silently fails just because one call site forgot the header.
      const serviceToken = process.env.EBAY_LISTING_SERVICE_TOKEN;
      if (serviceToken) headers["X-Listing-Service-Token"] = serviceToken;
    }

    let res;
    try {
      res = await fetch(`${EbayConnector.LISTING_SERVICE_URL}/ebay/create-listing`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new EbayListingError(
        "bridge_unreachable",
        err.name === "TimeoutError"
          ? "eBay listing service did not respond within 30s"
          : `eBay listing service unreachable at ${EbayConnector.LISTING_SERVICE_URL} — is it running? (${err.message})`,
        { statusCode: 503 },
      );
    }

    let body;
    try {
      body = await res.json();
    } catch {
      throw new EbayListingError(
        "bridge_bad_response",
        `eBay listing service returned a non-JSON response (HTTP ${res.status})`,
        { statusCode: 502 },
      );
    }

    if (!res.ok) {
      const detail = (body && typeof body.detail === "object") ? body.detail : body;
      throw new EbayListingError(
        (detail && detail.code) || "listing_failed",
        (detail && detail.message) || `eBay listing service returned HTTP ${res.status}`,
        {
          statusCode: res.status,
          step: detail && detail.step,
          offerId: detail && detail.offer_id,
          ebayStatus: detail && detail.ebay_status,
          ebayBody: detail && detail.ebay_body,
        },
      );
    }

    return body;
  }
}

/** Thrown by EtsyConnector.createListing() on any failure. Mirrors
 * EbayListingError's shape (code/step/listingId instead of offerId) so
 * callers can branch consistently across both connectors. `listingId` is
 * set as soon as a draft exists on Etsy's side — unlike eBay's offer_id,
 * this means a caller can resume (add missing images, retry activation)
 * instead of creating a duplicate draft. */
class EtsyListingError extends Error {
  constructor(code, message, { statusCode, step, listingId, etsyStatus, etsyBody } = {}) {
    super(message);
    this.name = "EtsyListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
    this.step = step;
    this.listingId = listingId;
    this.etsyStatus = etsyStatus;
    this.etsyBody = etsyBody;
  }
}

// ─────────────────────────────────────────────────────────────
// Etsy — Open API v3, OAuth 2.0 + PKCE (public-client style — the token
// exchange has no client_secret in the request body, unlike eBay's
// confidential-client Basic-auth exchange; the code_verifier proves the
// request came from the browser that started the flow instead).
// Docs: https://developers.etsy.com/documentation
//
// createListing() does NOT reimplement Etsy's listing API here — that
// logic lives in lib/etsy_listing.py (canonical client, see CLAUDE.md),
// called through the same internal Python bridge service used for eBay
// (scripts/listing_service.py, localhost only, /etsy/create-listing).
// ─────────────────────────────────────────────────────────────
class EtsyConnector extends BaseConnector {
  static ENV = ["ETSY_KEYSTRING", "ETSY_SHARED_SECRET", "ETSY_REDIRECT_URI"];
  static OAUTH_SCOPES = "listings_r listings_w transactions_r shops_r";
  static API_BASE = "https://openapi.etsy.com/v3/application";
  static LISTING_SERVICE_URL = process.env.ETSY_LISTING_SERVICE_URL || process.env.EBAY_LISTING_SERVICE_URL || "http://127.0.0.1:8791";
  static TOKEN_EXPIRY_SAFETY_MARGIN_MS = 5 * 60 * 1000;

  constructor() {
    super("etsy");
    // Keyed per tenantId, same reasoning as EbayConnector — never shared
    // across different customers' access tokens.
    this._accessTokenCache = {};
  }

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(EtsyConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: "Ready for credentials: register an app at etsy.com/developers, then set ETSY_KEYSTRING / ETSY_SHARED_SECRET / ETSY_REDIRECT_URI. Per-tenant connection happens via Connect Etsy on the Channels page, not a single shared refresh token.",
      };
    }
    return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "App credentials present — connect a shop via Connect Etsy to test a real listing call." };
  }

  /** App-level ping — proves the app credentials are valid, independent of
   * any tenant's connection. Etsy's openapi-ping endpoint needs only the
   * api key, no OAuth token, so this can run before any tenant connects.
   *
   * x-api-key must be `<keystring>:<shared_secret>`. VERIFIED against the
   * live production API 2026-08-20: the keystring alone returns
   * 403 "Shared secret is required in x-api-key header."; the colon-joined
   * pair returns 200 with the real application_id. Do not drop the secret. */
  async testConnection() {
    const keystring = process.env.ETSY_KEYSTRING;
    const sharedSecret = process.env.ETSY_SHARED_SECRET;
    if (!keystring || !sharedSecret) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: "Etsy ping needs both ETSY_KEYSTRING and ETSY_SHARED_SECRET (x-api-key is the colon-joined pair)",
      };
    }
    try {
      const res = await fetch(`${EtsyConnector.API_BASE}/openapi-ping`, {
        headers: { "x-api-key": `${keystring}:${sharedSecret}` },
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok
        ? { status: CONNECTION_STATUS.CONNECTED, detail: "Etsy API ping succeeded (app-level key only — connect a shop separately to list)" }
        : { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: `Etsy ping failed (HTTP ${res.status})` };
    } catch (err) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: err.name === "TimeoutError" ? "Etsy did not respond within 10s" : `Etsy request failed: ${err.message}`,
      };
    }
  }

  /** Fetches a tenant's decrypted Etsy refresh token + metadata (shop_id)
   * via the service_role-only RPCs (migrations 0013-0015). Returns null if
   * this tenant hasn't connected Etsy. Requires SUPABASE_SERVICE_ROLE_KEY. */
  async _getTenantConnection(tenantId) {
    if (!tenantId) return null;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      throw new EtsyListingError(
        "service_role_key_missing",
        "SUPABASE_SERVICE_ROLE_KEY is not configured — cannot look up a tenant's own Etsy connection.",
        { statusCode: 500 },
      );
    }
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };
    const environment = "production";

    const [tokenRes, metaRes] = await Promise.all([
      fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/get_decrypted_marketplace_token`, {
        method: "POST", headers,
        body: JSON.stringify({ p_tenant_id: tenantId, p_marketplace: "etsy", p_environment: environment }),
      }),
      fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/get_marketplace_connection_metadata`, {
        method: "POST", headers,
        body: JSON.stringify({ p_tenant_id: tenantId, p_marketplace: "etsy", p_environment: environment }),
      }),
    ]);
    if (!tokenRes.ok) {
      throw new EtsyListingError(
        "tenant_token_lookup_failed", `Failed to look up tenant's Etsy connection (HTTP ${tokenRes.status})`,
        { statusCode: 502 },
      );
    }
    const refreshToken = await tokenRes.json();
    if (!refreshToken) return null; // RPC returns null when not connected

    const metadata = metaRes.ok ? await metaRes.json() : null;
    const shopId = metadata?.shopId || metadata?.shop_id || null;
    if (!shopId) {
      throw new EtsyListingError(
        "etsy_shop_id_missing",
        "This Etsy connection has no shop_id on record — reconnect via Connect Etsy.",
        { statusCode: 409 },
      );
    }
    return { refreshToken, shopId };
  }

  /** Cached OAuth access token for createListing(). Refreshing uses Etsy's
   * public-client PKCE token endpoint — client_id only, no client_secret in
   * the body, per Etsy's documented OAuth flow. [Likely, not yet exercised
   * against a live token — app registration was pending review as of
   * 2026-08-20. Re-verify the exact refresh request shape the first time
   * this actually runs.] */
  async _getAccessToken(tenantId) {
    const now = Date.now();
    const cacheKey = tenantId || "__shared__";
    if (this._accessTokenCache?.[cacheKey] && now < this._accessTokenCache[cacheKey].expiresAt) {
      return this._accessTokenCache[cacheKey];
    }
    this._accessTokenCache = this._accessTokenCache || {};

    const conn = await this._getTenantConnection(tenantId);
    if (!conn) {
      throw new EtsyListingError("etsy_not_connected", "This account hasn't connected Etsy yet.", { statusCode: 409 });
    }

    let res;
    try {
      res = await fetch("https://api.etsy.com/v3/public/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: process.env.ETSY_KEYSTRING,
          refresh_token: conn.refreshToken,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new EtsyListingError(
        "token_refresh_failed",
        err.name === "TimeoutError" ? "Etsy did not respond within 10s while refreshing the access token" : `Etsy token refresh failed: ${err.message}`,
        { statusCode: 502 },
      );
    }

    if (!res.ok) {
      throw new EtsyListingError("token_refresh_failed", `Etsy token refresh returned HTTP ${res.status}`, { statusCode: res.status });
    }
    const body = await res.json();
    if (!body.access_token) {
      throw new EtsyListingError("token_refresh_failed", "Etsy token refresh succeeded but returned no access_token", { statusCode: 502 });
    }

    const expiresInMs = (body.expires_in || 3600) * 1000;
    const cached = { token: body.access_token, shopId: conn.shopId, expiresAt: now + expiresInMs - EtsyConnector.TOKEN_EXPIRY_SAFETY_MARGIN_MS };
    this._accessTokenCache[cacheKey] = cached;
    return cached;
  }

  /**
   * Create (and optionally activate) an Etsy listing via the internal
   * Python bridge service (/etsy/create-listing). This class does not
   * reimplement Etsy's Listings API; it only fetches an access token +
   * shop_id and forwards the request.
   *
   * @param {object} product Matches EtsyProduct fields — see
   *   lib/etsy_listing.py: sku, title, description, price, who_made,
   *   when_made, is_supply, taxonomy_id, shipping_profile_id, images.
   * @param {object} [options]
   * @param {boolean} [options.dryRun=true] Creating a DRAFT is free even
   *   with dryRun:false — only target_state:"active" is the money/live
   *   boundary and needs the full gate (dryRun:false + confirm +
   *   service token + the bridge started with --allow-live etsy).
   * @param {"draft"|"active"} [options.targetState="draft"]
   * @param {string} [options.confirm] Must be exactly "PUBLISH_LIVE" to
   *   activate; ignored for drafts.
   * @param {string} [options.tenantId] Resolved server-side from the
   *   caller's own session — never accept directly from client input.
   * @returns {Promise<object>} The bridge service's response.
   * @throws {EtsyListingError}
   */
  async createListing(product, options = {}) {
    const { dryRun = true, targetState = "draft", confirm, tenantId } = options;

    let accessToken = null;
    let shopId = null;
    if (!dryRun || targetState === "active") {
      const cached = await this._getAccessToken(tenantId);
      accessToken = cached.token;
      shopId = cached.shopId;
    }

    const requestBody = {
      access_token: accessToken || "dry-run-placeholder",
      shop_id: shopId || "dry-run-placeholder",
      api_key: process.env.ETSY_KEYSTRING,
      product,
      dry_run: dryRun,
      target_state: targetState,
    };
    if (confirm !== undefined) requestBody.confirm = confirm;

    const headers = { "Content-Type": "application/json" };
    if (dryRun === false && targetState === "active") {
      const serviceToken = process.env.ETSY_LISTING_SERVICE_TOKEN || process.env.EBAY_LISTING_SERVICE_TOKEN;
      if (serviceToken) headers["X-Listing-Service-Token"] = serviceToken;
    }

    let res;
    try {
      res = await fetch(`${EtsyConnector.LISTING_SERVICE_URL}/etsy/create-listing`, {
        method: "POST", headers, body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new EtsyListingError(
        "bridge_unreachable",
        err.name === "TimeoutError" ? "Etsy listing service did not respond within 30s" : `Etsy listing service unreachable at ${EtsyConnector.LISTING_SERVICE_URL} — is it running? (${err.message})`,
        { statusCode: 503 },
      );
    }

    let body;
    try {
      body = await res.json();
    } catch {
      throw new EtsyListingError("bridge_bad_response", `Etsy listing service returned a non-JSON response (HTTP ${res.status})`, { statusCode: 502 });
    }

    if (!res.ok) {
      const detail = (body && typeof body.detail === "object") ? body.detail : body;
      throw new EtsyListingError(
        (detail && detail.code) || "listing_failed",
        (detail && detail.message) || `Etsy listing service returned HTTP ${res.status}`,
        { statusCode: res.status, step: detail && detail.step, listingId: detail && detail.listing_id, etsyStatus: detail && detail.etsy_status, etsyBody: detail && detail.etsy_body },
      );
    }

    return body;
  }
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
    try {
      const res = await fetch(
        `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${ShopifyConnector.API_VERSION}/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
          },
          body: JSON.stringify({ query: "{ shop { name } }" }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      return res.ok
        ? { status: CONNECTION_STATUS.CONNECTED, detail: "Shopify Admin API reachable" }
        : { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: `Shopify auth failed (HTTP ${res.status})` };
    } catch (err) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: err.name === "TimeoutError" ? "Shopify did not respond within 10s" : `Shopify request failed: ${err.message}`,
      };
    }
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

  static normalizeUrl(raw) {
    const url = new URL(raw);
    if (url.protocol !== "https:") {
      throw new Error(
        "WOOCOMMERCE_STORE_URL must use https:// — Basic Auth over HTTP would leak the consumer secret."
      );
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  }

  async testConnection() {
    const base = WooCommerceConnector.normalizeUrl(process.env.WOOCOMMERCE_STORE_URL);
    const endpoint = `${base}/wp-json/wc/v3/system_status`;
    const key = process.env.WOOCOMMERCE_CONSUMER_KEY;
    const secret = process.env.WOOCOMMERCE_CONSUMER_SECRET;
    const auth = Buffer.from(`${key}:${secret}`).toString("base64");

    const attempt = (url, headers) =>
      fetch(url, { headers, signal: AbortSignal.timeout(10_000) });

    let res;
    try {
      res = await attempt(endpoint, { Authorization: `Basic ${auth}` });

      if (res.status === 401) {
        const fallback = new URL(endpoint);
        fallback.searchParams.set("consumer_key", key);
        fallback.searchParams.set("consumer_secret", secret);
        res = await attempt(fallback.toString(), {});
      }
    } catch (err) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: err.name === "TimeoutError"
          ? "WooCommerce store did not respond within 10s"
          : `WooCommerce request failed: ${err.message}`,
      };
    }

    return res.ok
      ? { status: CONNECTION_STATUS.CONNECTED, detail: "WooCommerce REST API reachable" }
      : { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: `WooCommerce auth failed (HTTP ${res.status})` };
  }
}

module.exports = { EbayConnector, EbayListingError, EtsyConnector, EtsyListingError, ShopifyConnector, WooCommerceConnector };
