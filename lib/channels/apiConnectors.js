// lib/channels/apiConnectors.js
// Official-API connector structures: eBay, Etsy, Shopify, WooCommerce.
// Each is a real skeleton against the provider's documented API with
// working env-var detection and honest status reporting — but every
// network-touching method guards on credentials and NONE claims
// "connected" without a live authenticated test call succeeding.

const fs = require("fs");
const path = require("path");
const { BaseConnector, CONNECTION_STATUS } = require("./connector");

/** Thrown by EbayConnector.createListing() on any failure. Carries eBay's
 * structured error fields so a caller can branch on `code` and `step`
 * (e.g. step "publish" with an offerId means an unpublished offer already
 * exists on eBay's side and must not be recreated blindly). */
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
// eBay — native JS against eBay's REST APIs. No Python bridge, no
// Shopify routing.
//   Auth:    OAuth refresh_token grant (user token; app keys alone can't
//            list). Shared EBAY_REFRESH_TOKEN, or a tenant's own token
//            stored by pages/api/channels/ebay/callback.js.
//   Status:  testConnection() refreshes AND makes a read-only Sell
//            Account API call — "connected" means eBay accepted the token
//            against the real seller account, not just a token exchange.
//   Listing: Sell Inventory API — inventory_item -> offer -> publish.
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
  // 5-minute safety margin before the real expiry — never hand out a token
  // that could expire mid-request.
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

  static apiBase() {
    return process.env.EBAY_ENVIRONMENT === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
  }

  /** Refreshes the shared user token, then makes one read-only Sell Account
   * call (fulfillment policies). Connected only if eBay accepts the token
   * against the real seller account. Creates nothing. */
  async testConnection() {
    let accessToken;
    try {
      accessToken = await this._getAccessToken();
    } catch (err) {
      const hint = err.ebayError === "invalid_grant"
        ? " EBAY_REFRESH_TOKEN is not a valid refresh token for this app — reconnect eBay (Channels page → Connect eBay) to mint a new one."
        : "";
      return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: `${err.message}.${hint}` };
    }

    try {
      const res = await fetch(`${EbayConnector.apiBase()}/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const e = body?.errors?.[0];
        return {
          status: CONNECTION_STATUS.CONFIG_REQUIRED,
          detail: `Token OK, but Sell Account API returned HTTP ${res.status}${e ? ` (${e.errorId}: ${e.message})` : ""}`,
        };
      }
      const count = body?.fulfillmentPolicies?.length ?? 0;
      return {
        status: CONNECTION_STATUS.CONNECTED,
        detail: `Authenticated to eBay seller account (${count} fulfillment ${count === 1 ? "policy" : "policies"} on EBAY_US)`,
      };
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
      // eBay's OAuth errors are safe to surface (error code + description, no token material).
      const errBody = await res.json().catch(() => null);
      const err = new EbayListingError(
        "token_refresh_failed",
        `eBay token refresh returned HTTP ${res.status}${errBody?.error ? ` (${errBody.error}: ${errBody.error_description})` : ""}`,
        { statusCode: res.status },
      );
      err.ebayError = errBody?.error;
      throw err;
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
   * Create (and optionally publish) an eBay listing via direct calls to
   * eBay's Sell Inventory API — no external bridge service. Three-step
   * flow: PUT inventory_item, POST offer, POST offer/{id}/publish.
   *
   * @param {object} product  sku, title, description, price, category_id,
   *   quantity, condition (eBay enum, e.g. "NEW"), image_urls (string[]),
   *   marketplace_id (default "EBAY_US"), currency (default "USD"), aspects
   *   (object of string[] values, optional).
   * @param {object} policies fulfillment_policy_id, payment_policy_id,
   *   return_policy_id, merchant_location_key. All four required to reach
   *   the offer step, no defaults — eBay rejects an offer without them.
   * @param {object} [options]
   * @param {boolean} [options.dryRun=true] Defaults to true — returns the
   *   three request payloads without calling eBay at all.
   * @param {string} [options.confirm] Must be exactly "PUBLISH_LIVE" to
   *   actually publish the offer (step 3). With dryRun:false but no
   *   confirm, steps 1-2 run for real (a real but unpublished offer is
   *   created) and step 3 is skipped — matches the old bridge's safety
   *   contract, so a caller can create a draft without risking a live
   *   listing by forgetting one flag.
   * @param {string} [options.tenantId] Resolved server-side from the
   *   caller's own session — NEVER accept directly from client input.
   * @returns {Promise<object>}
   * @throws {EbayListingError}
   */
  async createListing(product, policies, options = {}) {
    const { dryRun = true, confirm, tenantId } = options;

    if (!product?.sku || !product?.title) {
      throw new EbayListingError("missing_fields", "product.sku and product.title are required", { statusCode: 400 });
    }

    const marketplaceId = product.marketplace_id || "EBAY_US";
    const currency = product.currency || "USD";

    const inventoryItemBody = {
      condition: product.condition || "NEW",
      product: {
        title: product.title,
        description: product.description || "",
        ...(product.aspects ? { aspects: product.aspects } : {}),
        ...(product.image_urls?.length ? { imageUrls: product.image_urls } : {}),
      },
      availability: {
        shipToLocationAvailability: { quantity: product.quantity ?? 1 },
      },
    };

    const offerBody = {
      sku: product.sku,
      marketplaceId,
      format: "FIXED_PRICE",
      availableQuantity: product.quantity ?? 1,
      categoryId: product.category_id,
      listingDescription: product.description || product.title,
      listingPolicies: {
        fulfillmentPolicyId: policies?.fulfillment_policy_id,
        paymentPolicyId: policies?.payment_policy_id,
        returnPolicyId: policies?.return_policy_id,
      },
      pricingSummary: { price: { value: String(product.price ?? "0.00"), currency } },
      merchantLocationKey: policies?.merchant_location_key,
    };

    if (dryRun) {
      const apiBase = EbayConnector.apiBase();
      // Everything eBay requires before an offer can be created or published.
      const missing = [
        ["product.category_id", product.category_id],
        ["product.price", product.price],
        ["policies.fulfillment_policy_id", policies?.fulfillment_policy_id],
        ["policies.payment_policy_id", policies?.payment_policy_id],
        ["policies.return_policy_id", policies?.return_policy_id],
        ["policies.merchant_location_key", policies?.merchant_location_key],
      ].filter(([, v]) => v === undefined || v === null || v === "").map(([k]) => k);
      return {
        ok: true,
        dry_run: true,
        published: false,
        ready_for_live: missing.length === 0,
        missing,
        payloads: { inventory_item: inventoryItemBody, offer: offerBody },
        would_call: [
          `PUT ${apiBase}/sell/inventory/v1/inventory_item/${encodeURIComponent(product.sku)}`,
          `POST ${apiBase}/sell/inventory/v1/offer`,
          `POST ${apiBase}/sell/inventory/v1/offer/{offerId}/publish (only with confirm: "PUBLISH_LIVE")`,
        ],
      };
    }

    if (!policies?.fulfillment_policy_id || !policies?.payment_policy_id || !policies?.return_policy_id || !policies?.merchant_location_key) {
      throw new EbayListingError(
        "missing_fields",
        "fulfillment_policy_id, payment_policy_id, return_policy_id, and merchant_location_key are all required for a live offer.",
        { statusCode: 400 },
      );
    }

    const accessToken = await this._getAccessToken(tenantId);
    const apiBase = process.env.EBAY_ENVIRONMENT === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
    const authHeaders = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Content-Language": "en-US",
    };

    let invRes;
    try {
      invRes = await fetch(`${apiBase}/sell/inventory/v1/inventory_item/${encodeURIComponent(product.sku)}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify(inventoryItemBody),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new EbayListingError("request_failed", `eBay inventory_item request failed: ${err.message}`, { statusCode: 502, step: "inventory_item" });
    }
    if (!invRes.ok) {
      const errBody = await invRes.json().catch(() => null);
      throw new EbayListingError(
        "inventory_item_failed",
        `eBay inventory_item creation failed (HTTP ${invRes.status}): ${JSON.stringify(errBody?.errors || errBody)}`,
        { statusCode: invRes.status, step: "inventory_item", ebayBody: errBody },
      );
    }

    let offerRes;
    try {
      offerRes = await fetch(`${apiBase}/sell/inventory/v1/offer`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify(offerBody),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new EbayListingError("request_failed", `eBay offer request failed: ${err.message}`, { statusCode: 502, step: "offer" });
    }
    const offerData = await offerRes.json().catch(() => null);
    if (!offerRes.ok || !offerData?.offerId) {
      throw new EbayListingError(
        "offer_creation_failed",
        `eBay offer creation failed (HTTP ${offerRes.status}): ${JSON.stringify(offerData?.errors || offerData)}`,
        { statusCode: offerRes.status, step: "offer", ebayBody: offerData },
      );
    }
    const offerId = offerData.offerId;

    if (confirm !== "PUBLISH_LIVE") {
      return { ok: true, dry_run: false, published: false, sku: product.sku, offerId, note: "Offer created but not published — pass confirm: \"PUBLISH_LIVE\" to go live." };
    }

    let pubRes;
    try {
      pubRes = await fetch(`${apiBase}/sell/inventory/v1/offer/${offerId}/publish`, {
        method: "POST",
        headers: authHeaders,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new EbayListingError("request_failed", `eBay publish request failed: ${err.message}`, { statusCode: 502, step: "publish", offerId });
    }
    const pubData = await pubRes.json().catch(() => null);
    if (!pubRes.ok || !pubData?.listingId) {
      throw new EbayListingError(
        "publish_failed",
        `eBay publish failed (HTTP ${pubRes.status}): ${JSON.stringify(pubData?.errors || pubData)}`,
        { statusCode: pubRes.status, step: "publish", offerId, ebayBody: pubData },
      );
    }

    return { ok: true, dry_run: false, published: true, sku: product.sku, offerId, listingId: pubData.listingId, url: `https://www.ebay.com/itm/${pubData.listingId}` };
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

    // api_key must be the colon-joined "<keystring>:<shared_secret>" pair —
    // EtsyListingClient.__init__ (lib/etsy_listing.py) rejects a bare
    // keystring outright with EtsyValidationError before any network call,
    // exactly matching what testConnection() above already found live: a
    // bare keystring gets 403 "Shared secret is required in x-api-key
    // header." A prior version of this line sent the bare keystring, which
    // would have failed every single Etsy listing call, including dry-run
    // drafts, on first use.
    const requestBody = {
      access_token: accessToken || "dry-run-placeholder",
      shop_id: shopId || "dry-run-placeholder",
      api_key: `${process.env.ETSY_KEYSTRING}:${process.env.ETSY_SHARED_SECRET}`,
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

/** Thrown by FacebookConnector.createListing() on any failure. Mirrors
 * EbayListingError/EtsyListingError's shape so callers can branch
 * consistently across all three connectors. */
class FacebookListingError extends Error {
  constructor(code, message, { statusCode, step, listingId, facebookStatus } = {}) {
    super(message);
    this.name = "FacebookListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
    this.step = step;
    this.listingId = listingId;
    this.facebookStatus = facebookStatus;
  }
}

// ─────────────────────────────────────────────────────────────
// Facebook Marketplace — Graph API, Catalog/Product endpoints.
// Docs: https://developers.facebook.com/docs/marketing-api/catalog/
//
// Not per-tenant like eBay/Etsy: FB_ACCESS_TOKEN/FB_PAGE_ID are a single
// shared Page token, read directly from env, matching how
// lib/facebook_marketplace_listing.py's own _config() reads them.
// FB_APP_ID/FB_APP_SECRET (also in .env) are a DIFFERENT, weaker
// credential — they prove the Meta app itself is registered, but cannot
// create a listing on their own; a real Page access token is required.
//
// createListing() does NOT reimplement Facebook's Marketplace API here —
// that logic lives in lib/facebook_marketplace_listing.py (canonical
// client, 13 tests), called through the same internal Python bridge
// service used for eBay/Etsy (scripts/listing_service.py, localhost
// only, /facebook/create-listing).
// ─────────────────────────────────────────────────────────────
class FacebookConnector extends BaseConnector {
  static ENV = ["FB_ACCESS_TOKEN", "FB_PAGE_ID"];
  static GRAPH_BASE = "https://graph.facebook.com/v25.0";

  constructor() { super("facebook"); }

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(FacebookConnector.ENV)) {
      const hasAppCreds = this.hasRequiredEnv(["FB_APP_ID", "FB_APP_SECRET"]);
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: hasAppCreds
          ? "Meta app credentials present (FB_APP_ID/FB_APP_SECRET), but listing requires a Page access token: set FB_ACCESS_TOKEN and FB_PAGE_ID."
          : "Not configured — needs FB_ACCESS_TOKEN (Page access token with CATALOG_MANAGEMENT) and FB_PAGE_ID.",
      };
    }
    return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "Page token present — run Test Connection to verify (never assumed connected without a live test)." };
  }

  /** Live check: fetches the Page's own name via Graph API. Proves the
   * token is valid AND actually authorized for this specific page_id —
   * a token for a different page would fail here even though it's a
   * real, live Meta token. */
  async testConnection() {
    if (!this.hasRequiredEnv(FacebookConnector.ENV)) {
      return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "FB_ACCESS_TOKEN and FB_PAGE_ID are both required." };
    }
    try {
      const res = await fetch(
        `${FacebookConnector.GRAPH_BASE}/${process.env.FB_PAGE_ID}?fields=id,name&access_token=${encodeURIComponent(process.env.FB_ACCESS_TOKEN)}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      const body = await res.json().catch(() => null);
      return res.ok
        ? { status: CONNECTION_STATUS.CONNECTED, detail: `Connected to Page "${body?.name || process.env.FB_PAGE_ID}"` }
        : { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: `Facebook auth failed (HTTP ${res.status}): ${body?.error?.message || "unknown error"}` };
    } catch (err) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: err.name === "TimeoutError" ? "Facebook did not respond within 10s" : `Facebook request failed: ${err.message}`,
      };
    }
  }

  /**
   * Create a product in the Page's Commerce product catalog via direct
   * Graph API calls — no bridge service. Two-step: look up the Page's
   * default catalog (GET {page_id}/product_catalogs), then POST a product
   * into it. Requires a Page Access Token (not an app token) with
   * catalog_management — see testConnection()'s doc comment.
   *
   * @param {object} product title, description, price (number, USD),
   *   sku (used as retailer_id), images (string[]), condition
   *   ("new"|"refurbished"|"used", default "new"), category (optional).
   * @param {object} [options]
   * @param {boolean} [options.dryRun=true]
   * @param {string} [options.confirm] Must be exactly "PUBLISH_LIVE" to
   *   actually create the catalog product; with dryRun:false and no
   *   confirm, only the catalog lookup runs (proves the token/permissions
   *   work) and the product POST is skipped.
   * @returns {Promise<object>}
   * @throws {FacebookListingError}
   */
  async createListing(product, options = {}) {
    const { dryRun = true, confirm } = options;

    if (!product?.title || !product?.sku) {
      throw new FacebookListingError("missing_fields", "product.title and product.sku are required", { statusCode: 400 });
    }

    const productBody = {
      retailer_id: product.sku,
      name: product.title,
      description: product.description || "",
      price: Math.round(Number(product.price || 0) * 100),
      currency: "USD",
      availability: "in stock",
      condition: product.condition || "new",
      image_url: product.images?.[0] || "",
      url: product.url || `https://facebook.com/${process.env.FB_PAGE_ID || "page"}`,
    };

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        published: false,
        payload: productBody,
        would_call: [
          `GET ${FacebookConnector.GRAPH_BASE}/{FB_PAGE_ID}/product_catalogs`,
          `POST ${FacebookConnector.GRAPH_BASE}/{catalog_id}/products (only with confirm: "PUBLISH_LIVE")`,
        ],
      };
    }

    if (!this.hasRequiredEnv(FacebookConnector.ENV)) {
      throw new FacebookListingError("facebook_not_configured", "FB_ACCESS_TOKEN and FB_PAGE_ID must both be set.", { statusCode: 409 });
    }
    const token = process.env.FB_ACCESS_TOKEN;

    let catalogRes;
    try {
      catalogRes = await fetch(
        `${FacebookConnector.GRAPH_BASE}/${process.env.FB_PAGE_ID}/product_catalogs?access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(15_000) },
      );
    } catch (err) {
      throw new FacebookListingError("request_failed", `Facebook catalog lookup failed: ${err.message}`, { statusCode: 502, step: "catalog_lookup" });
    }
    const catalogData = await catalogRes.json().catch(() => null);
    if (!catalogRes.ok) {
      throw new FacebookListingError(
        "catalog_lookup_failed",
        `Facebook catalog lookup failed (HTTP ${catalogRes.status}): ${catalogData?.error?.message || "unknown error"}`,
        { statusCode: catalogRes.status, step: "catalog_lookup", facebookStatus: catalogData },
      );
    }
    const catalogId = catalogData?.data?.[0]?.id;
    if (!catalogId) {
      throw new FacebookListingError(
        "no_catalog",
        "This Page has no product catalog set up — create one in Commerce Manager before listing products.",
        { statusCode: 409, step: "catalog_lookup" },
      );
    }

    if (confirm !== "PUBLISH_LIVE") {
      return { ok: true, dry_run: false, published: false, catalogId, note: "Catalog found and token verified, but product not created — pass confirm: \"PUBLISH_LIVE\" to create it." };
    }

    let productRes;
    try {
      productRes = await fetch(`${FacebookConnector.GRAPH_BASE}/${catalogId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...productBody, access_token: token }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new FacebookListingError("request_failed", `Facebook product creation failed: ${err.message}`, { statusCode: 502, step: "create_product" });
    }
    const productData = await productRes.json().catch(() => null);
    if (!productRes.ok || !productData?.id) {
      throw new FacebookListingError(
        "product_creation_failed",
        `Facebook product creation failed (HTTP ${productRes.status}): ${productData?.error?.message || "unknown error"}`,
        { statusCode: productRes.status, step: "create_product", facebookStatus: productData },
      );
    }

    return { ok: true, dry_run: false, published: true, catalogId, listingId: productData.id };
  }
}

class InstagramListingError extends Error {
  constructor(code, message, { statusCode, step, instagramStatus } = {}) {
    super(message);
    this.name = "InstagramListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
    this.step = step;
    this.instagramStatus = instagramStatus;
  }
}

class InstagramConnector extends BaseConnector {
  static ENV = ["IG_ACCESS_TOKEN", "IG_APP_ID"];
  static GRAPH_BASE = "https://graph.instagram.com/v25.0";

  constructor() { super("instagram"); }

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(InstagramConnector.ENV)) {
      const hasAppCreds = this.hasRequiredEnv(["IG_APP_ID", "IG_APP_SECRET"]);
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: hasAppCreds
          ? "Instagram app credentials present (IG_APP_ID/IG_APP_SECRET), but listing requires an access token: set IG_ACCESS_TOKEN."
          : "Not configured — needs IG_ACCESS_TOKEN (user access token with INSTAGRAM_SHOP_MANAGEMENT) and IG_APP_ID.",
      };
    }
    return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "Instagram token present — run Test Connection to verify." };
  }

  async testConnection() {
    if (!this.hasRequiredEnv(InstagramConnector.ENV)) {
      return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "IG_ACCESS_TOKEN and IG_APP_ID are both required." };
    }
    try {
      const res = await fetch(
        `${InstagramConnector.GRAPH_BASE}/me?fields=id,name&access_token=${encodeURIComponent(process.env.IG_ACCESS_TOKEN)}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      const body = await res.json().catch(() => null);
      return res.ok
        ? { status: CONNECTION_STATUS.CONNECTED, detail: `Connected to Instagram account "${body?.name || body?.id}"` }
        : { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: `Instagram auth failed (HTTP ${res.status}): ${body?.error?.message || "unknown error"}` };
    } catch (err) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: err.name === "TimeoutError" ? "Instagram did not respond within 10s" : `Instagram request failed: ${err.message}`,
      };
    }
  }

  /**
   * Posts the product as an Instagram photo post (Content Publishing API,
   * direct calls — no bridge) with a caption built from title/price/
   * description. Two-step: create a media container, then publish it.
   *
   * This is NOT Instagram Shopping's product-catalog feature — that reuses
   * the same Facebook Commerce Catalog as FacebookConnector and needs a
   * Page+catalog link, out of scope here. This posts a real, real photo
   * with the listing details in the caption, same category of "real
   * direct API call" as every other connector in this file.
   *
   * @param {object} product title, description, price, images (string[],
   *   required — IG posts need at least one image URL), sku (optional,
   *   included in caption for reference).
   * @param {object} [options]
   * @param {boolean} [options.dryRun=true]
   * @param {string} [options.confirm] Must be "PUBLISH_LIVE" to actually
   *   publish; with dryRun:false and no confirm, only the media container
   *   is created (proves the token works) and publish is skipped.
   * @returns {Promise<object>}
   * @throws {InstagramListingError}
   */
  async createListing(product, options = {}) {
    const { dryRun = true, confirm } = options;

    if (!product?.title || !product?.images?.length) {
      throw new InstagramListingError("missing_fields", "product.title and at least one product.images URL are required", { statusCode: 400 });
    }

    const priceLine = product.price != null ? `$${Number(product.price).toFixed(2)}` : "";
    const caption = [product.title, priceLine, product.description, product.sku ? `SKU: ${product.sku}` : ""]
      .filter(Boolean).join("\n\n");

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        published: false,
        payload: { image_url: product.images[0], caption },
        would_call: [
          `POST ${InstagramConnector.GRAPH_BASE}/me/media`,
          `POST ${InstagramConnector.GRAPH_BASE}/me/media_publish (only with confirm: "PUBLISH_LIVE")`,
        ],
      };
    }

    if (!this.hasRequiredEnv(InstagramConnector.ENV)) {
      throw new InstagramListingError("instagram_not_configured", "IG_ACCESS_TOKEN and IG_APP_ID must both be set.", { statusCode: 409 });
    }
    const token = process.env.IG_ACCESS_TOKEN;

    let containerRes;
    try {
      containerRes = await fetch(`${InstagramConnector.GRAPH_BASE}/me/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: product.images[0], caption, access_token: token }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new InstagramListingError("request_failed", `Instagram media container request failed: ${err.message}`, { statusCode: 502, step: "create_container" });
    }
    const containerData = await containerRes.json().catch(() => null);
    if (!containerRes.ok || !containerData?.id) {
      throw new InstagramListingError(
        "container_creation_failed",
        `Instagram media container failed (HTTP ${containerRes.status}): ${containerData?.error?.message || "unknown error"}`,
        { statusCode: containerRes.status, step: "create_container", instagramStatus: containerData },
      );
    }
    const containerId = containerData.id;

    if (confirm !== "PUBLISH_LIVE") {
      return { ok: true, dry_run: false, published: false, containerId, note: "Media container created but not published — pass confirm: \"PUBLISH_LIVE\" to post it." };
    }

    let publishRes;
    try {
      publishRes = await fetch(`${InstagramConnector.GRAPH_BASE}/me/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: containerId, access_token: token }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new InstagramListingError("request_failed", `Instagram publish request failed: ${err.message}`, { statusCode: 502, step: "publish", containerId });
    }
    const publishData = await publishRes.json().catch(() => null);
    if (!publishRes.ok || !publishData?.id) {
      throw new InstagramListingError(
        "publish_failed",
        `Instagram publish failed (HTTP ${publishRes.status}): ${publishData?.error?.message || "unknown error"}`,
        { statusCode: publishRes.status, step: "publish", containerId, instagramStatus: publishData },
      );
    }

    return { ok: true, dry_run: false, published: true, containerId, listingId: publishData.id, url: `https://www.instagram.com/p/${publishData.id}/` };
  }
}

/** Thrown by BonanzaConnector.createListing() on any failure. Mirrors the
 * other connectors' error shape for consistent caller handling. */
class BonanzaListingError extends Error {
  constructor(code, message, { statusCode, step, bonanzaStatus } = {}) {
    super(message);
    this.name = "BonanzaListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
    this.step = step;
    this.bonanzaStatus = bonanzaStatus;
  }
}

// ─────────────────────────────────────────────────────────────
// Bonanza — "Bonapitit" API. NOT a per-resource REST API — a single
// envelope endpoint (secure_request) closer in shape to eBay's legacy
// Trading API. Docs: api.bonanza.com/docs (verified against the real docs
// 2026-08-24; an earlier version of this connector and of
// lib/bonanza_listing.py assumed a REST shape that does not match the real
// API at all and would have failed on first live call).
//
// Three credentials, not one:
//   BONANZA_DEV_ID / BONANZA_CERT_ID — per-developer-account, sent as HTTP
//     headers on every call. Get these at api.bonanza.com/accounts/new.
//   BONANZA_ACCESS_TOKEN — the per-seller bonanzleAuthToken, obtained via
//     fetchToken() then the seller approving access at the returned
//     authenticationURL. Goes in the request BODY, not a header.
//
// createListing() does NOT reimplement Bonanza's API here — that logic
// lives in lib/bonanza_listing.py (canonical client), called through the
// same internal Python bridge service used for eBay/Etsy/Facebook
// (scripts/listing_service.py, localhost only, /bonanza/create-listing).
// ─────────────────────────────────────────────────────────────
class BonanzaConnector extends BaseConnector {
  static ENV = ["BONANZA_DEV_ID", "BONANZA_CERT_ID", "BONANZA_ACCESS_TOKEN"];
  static API_URL = "https://api.bonanza.com/api_requests/secure_request";

  constructor() { super("bonanza"); }

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(["BONANZA_DEV_ID", "BONANZA_CERT_ID"])) {
      return {
        status: CONNECTION_STATUS.NOT_CONNECTED,
        detail: "Optional — not configured. Get BONANZA_DEV_ID/BONANZA_CERT_ID at api.bonanza.com/accounts/new, then complete fetchToken + seller approval for BONANZA_ACCESS_TOKEN.",
      };
    }
    if (!this.hasRequiredEnv(BonanzaConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: "Dev/cert ID present, but BONANZA_ACCESS_TOKEN is missing — call fetchToken and have the seller approve via authenticationURL.",
      };
    }
    return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "Credentials present — run Test Connection to verify (never assumed connected without a live test)." };
  }

  /** Live check: calls the real envelope endpoint with a lightweight,
   * harmless request (getBoothItems — per the docs, one of the two secure
   * calls that doesn't require a user token) to prove dev_id/cert_id
   * actually authenticate, not just that they're present. */
  async testConnection() {
    if (!this.hasRequiredEnv(["BONANZA_DEV_ID", "BONANZA_CERT_ID"])) {
      return { status: CONNECTION_STATUS.NOT_CONNECTED, detail: "BONANZA_DEV_ID and BONANZA_CERT_ID are both required." };
    }
    try {
      const res = await fetch("https://api.bonanza.com/api_requests/secure_request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BONANZLE-API-DEV-NAME": process.env.BONANZA_DEV_ID,
          "X-BONANZLE-API-CERT-NAME": process.env.BONANZA_CERT_ID,
        },
        body: JSON.stringify({ getBoothItemsRequest: {} }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await res.json().catch(() => null);
      const errorMessage = body?.getBoothItemsResponse?.errorMessage || body?.errorMessage;
      return res.ok && !errorMessage
        ? { status: CONNECTION_STATUS.CONNECTED, detail: "Bonanza dev/cert ID authenticated successfully" }
        : { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: `Bonanza auth failed: ${errorMessage || `HTTP ${res.status}`}` };
    } catch (err) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: err.name === "TimeoutError" ? "Bonanza did not respond within 10s" : `Bonanza request failed: ${err.message}`,
      };
    }
  }

  /** Static-key auth check for scripts/check-connections.js — thin wrapper
   * around getConnectionStatus(), which already tiers BONANZA_DEV_ID/
   * CERT_ID/ACCESS_TOKEN presence and runs the read-only live test
   * (getBoothItemsRequest — no writes). */
  async authenticate() {
    const result = await this.getConnectionStatus();
    return { connected: result.status === CONNECTION_STATUS.CONNECTED, detail: result.detail };
  }

  /**
   * Create a Bonanza listing via a direct call to the same secure_request
   * envelope endpoint testConnection() already proves works — no bridge.
   * Uses addFixedPriceItem, the Bonapitit-API equivalent of eBay Trading
   * API's AddFixedPriceItem (Bonanza's API is explicitly modeled on it).
   *
   * NOTE: the exact addFixedPriceItem field names below are a best-effort
   * mapping from the documented BonanzaListing shape onto the envelope
   * pattern proven by testConnection() — they have not been exercised
   * against a live seller token (none exists yet). Verify against
   * api.bonanza.com/docs once BONANZA_ACCESS_TOKEN is available, before
   * trusting a live (non-dry-run) call.
   *
   * @param {object} listing title, description, price, quantity, sku,
   *   category_id (int), condition, image_urls (string[]),
   *   ships_within_days, shipping_cost, free_shipping, returns_accepted.
   * @param {object} [options]
   * @param {boolean} [options.dryRun=true]
   * @param {string} [options.confirm] Must be exactly "PUBLISH_LIVE" for a
   *   live publish; ignored for dry runs.
   * @returns {Promise<object>}
   * @throws {BonanzaListingError}
   */
  async createListing(listing, options = {}) {
    const { dryRun = true, confirm } = options;

    if (!listing?.title || !listing?.sku) {
      throw new BonanzaListingError("missing_fields", "listing.title and listing.sku are required", { statusCode: 400 });
    }

    const itemBody = {
      title: listing.title,
      description: listing.description || "",
      primaryCategoryId: listing.category_id,
      sku: listing.sku,
      startPrice: Number(listing.price ?? 0),
      quantity: listing.quantity ?? 1,
      condition: listing.condition || "New",
      pictureDetails: listing.image_urls?.length ? { pictureURL: listing.image_urls } : undefined,
      dispatchTimeMax: listing.ships_within_days ?? 3,
      shippingDetails: {
        shippingServiceCost: listing.free_shipping ? 0 : Number(listing.shipping_cost ?? 0),
        freeShipping: !!listing.free_shipping,
      },
      returnPolicy: { returnsAccepted: !!listing.returns_accepted },
    };

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        published: false,
        payload: { addFixedPriceItemRequest: { item: itemBody } },
        would_call: [`POST ${BonanzaConnector.API_URL} (addFixedPriceItemRequest, only with confirm: "PUBLISH_LIVE")`],
      };
    }

    if (!this.hasRequiredEnv(BonanzaConnector.ENV)) {
      throw new BonanzaListingError("bonanza_not_configured", "BONANZA_DEV_ID, BONANZA_CERT_ID, and BONANZA_ACCESS_TOKEN must all be set.", { statusCode: 409 });
    }
    if (confirm !== "PUBLISH_LIVE") {
      return { ok: true, dry_run: false, published: false, note: "Live call skipped — pass confirm: \"PUBLISH_LIVE\" to actually create the listing." };
    }

    let res;
    try {
      res = await fetch(BonanzaConnector.API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BONANZLE-API-DEV-NAME": process.env.BONANZA_DEV_ID,
          "X-BONANZLE-API-CERT-NAME": process.env.BONANZA_CERT_ID,
        },
        body: JSON.stringify({ addFixedPriceItemRequest: { accessToken: process.env.BONANZA_ACCESS_TOKEN, item: itemBody } }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw new BonanzaListingError("request_failed", `Bonanza listing request failed: ${err.message}`, { statusCode: 502, step: "add_item" });
    }

    const body = await res.json().catch(() => null);
    const response = body?.addFixedPriceItemResponse;
    const errorMessage = response?.errorMessage || body?.errorMessage;
    if (!res.ok || errorMessage || !response?.itemId) {
      throw new BonanzaListingError(
        "listing_failed",
        `Bonanza listing failed: ${errorMessage || `HTTP ${res.status}`}`,
        { statusCode: res.ok ? 502 : res.status, step: "add_item", bonanzaStatus: body },
      );
    }

    return { ok: true, dry_run: false, published: true, listingId: response.itemId, url: response.viewItemURL || null };
  }
}

// ─────────────────────────────────────────────────────────────
// Shopify — GraphQL Admin API, per-store access token.
// Docs: https://shopify.dev/docs/api/admin-graphql
// ─────────────────────────────────────────────────────────────
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

  /** Static-key auth check for scripts/check-connections.js — thin wrapper
   * around getConnectionStatus() so the env-presence check and the
   * read-only live test (GET system_status, no writes) aren't duplicated. */
  async authenticate() {
    const result = await this.getConnectionStatus();
    return { connected: result.status === CONNECTION_STATUS.CONNECTED, detail: result.detail };
  }

  /**
   * Create a product listing via WooCommerce's REST API v3. Unlike
   * eBay/Etsy, WooCommerce has no separate "offer" or "draft object" step —
   * one POST creates the product with a `status` field. The safety model
   * mirrors eBay/Etsy anyway for consistency: `dryRun` (default true)
   * returns the payload without any network call; going live additionally
   * requires `options.publish: true` AND `options.confirm === "PUBLISH_LIVE"`
   * — so a caller can create real DRAFT products (visible only in the
   * store's admin, not on the storefront) with just `dryRun: false`, the
   * same middle ground Etsy's target_state:"draft" already has.
   *
   * @param {object} product { title, description, shortDescription, price,
   *   sku, images: string[], quantity, condition }
   * @param {object} [options]
   * @param {boolean} [options.dryRun=true]
   * @param {boolean} [options.publish=false] Only meaningful when dryRun is
   *   false. false => creates a real draft product. true => goes live on
   *   the storefront and additionally requires options.confirm.
   * @param {string} [options.confirm] Must be exactly "PUBLISH_LIVE" to
   *   publish; ignored otherwise.
   * @returns {Promise<object>}
   * @throws {WooCommerceListingError}
   */
  async createListing(product, options = {}) {
    const { dryRun = true, publish = false, confirm } = options;

    if (!product || !product.title) {
      throw new WooCommerceListingError(
        "invalid_product", "product.title is required.", { statusCode: 400 },
      );
    }
    if (publish && confirm !== "PUBLISH_LIVE") {
      throw new WooCommerceListingError(
        "confirm_required",
        "Publishing live requires options.publish=true AND options.confirm==='PUBLISH_LIVE'.",
        { statusCode: 400 },
      );
    }

    const payload = {
      name: product.title,
      type: "simple",
      status: publish ? "publish" : "draft",
      regular_price: typeof product.price === "number" ? product.price.toFixed(2) : String(product.price || ""),
      description: product.description || "",
      short_description: product.shortDescription || product.condition || "",
      images: (product.images || []).filter(Boolean).map((src) => ({ src })),
      manage_stock: true,
      stock_quantity: Number.isFinite(product.quantity) ? product.quantity : 1,
    };
    if (product.sku) payload.sku = String(product.sku);

    if (dryRun) {
      return { ok: true, dry_run: true, published: false, payload };
    }

    if (!this.hasRequiredEnv(WooCommerceConnector.ENV)) {
      throw new WooCommerceListingError(
        "not_configured",
        "WOOCOMMERCE_STORE_URL / WOOCOMMERCE_CONSUMER_KEY / WOOCOMMERCE_CONSUMER_SECRET are not set.",
        { statusCode: 409 },
      );
    }

    const base = WooCommerceConnector.normalizeUrl(process.env.WOOCOMMERCE_STORE_URL);
    const auth = Buffer.from(
      `${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`,
    ).toString("base64");

    let res;
    try {
      res = await fetch(`${base}/wp-json/wc/v3/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new WooCommerceListingError(
        "request_failed",
        err.name === "TimeoutError" ? "WooCommerce did not respond within 15s" : `WooCommerce request failed: ${err.message}`,
        { statusCode: 502 },
      );
    }

    let body;
    try {
      body = await res.json();
    } catch {
      throw new WooCommerceListingError(
        "bad_response", `WooCommerce returned a non-JSON response (HTTP ${res.status})`, { statusCode: 502 },
      );
    }

    if (!res.ok) {
      throw new WooCommerceListingError(
        body?.code || "listing_failed",
        body?.message || `WooCommerce returned HTTP ${res.status}`,
        { statusCode: res.status, wooBody: body },
      );
    }

    return {
      ok: true,
      dry_run: false,
      published: payload.status === "publish",
      productId: body.id,
      permalink: body.permalink,
      payload,
    };
  }
}

/** Thrown by WooCommerceConnector.createListing() on any failure. Mirrors
 * EbayListingError/EtsyListingError's shape for consistent caller handling. */
class WooCommerceListingError extends Error {
  constructor(code, message, { statusCode, wooBody } = {}) {
    super(message);
    this.name = "WooCommerceListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
    this.wooBody = wooBody;
  }
}

/** Thrown by AmazonConnector.createListing() on any failure. Mirrors
 * EbayListingError/EtsyListingError's shape for consistent caller handling. */
class AmazonListingError extends Error {
  constructor(code, message, { statusCode } = {}) {
    super(message);
    this.name = "AmazonListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
  }
}

/**
 * Amazon Selling Partner API (SP-API) — per-tenant OAuth via Login with
 * Amazon (LWA), same shared-app-registration / per-tenant-consent shape as
 * EbayConnector/EtsyConnector: one AMAZON_CLIENT_ID/SECRET app registration,
 * each tenant authorizes their own Seller Central account separately and
 * their refresh token is stored via store_marketplace_connection.
 *
 * createListing() is NOT implemented here — unlike eBay/Etsy's simple
 * REST+bearer-token calls, SP-API's Listings Items API requires AWS SigV4
 * request signing against a region-specific endpoint (na/eu/fe), which is a
 * separate, substantial piece of work. This class only covers connecting
 * the account; wiring up an actual listing bridge is future work.
 */
class AmazonConnector extends BaseConnector {
  static ENV = ["AMAZON_CLIENT_ID", "AMAZON_CLIENT_SECRET"];
  static TOKEN_EXPIRY_SAFETY_MARGIN_MS = 5 * 60 * 1000;

  constructor() {
    super("amazon");
    this._accessTokenCache = {};
  }

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(AmazonConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: "Ready for credentials: register an app at developer.amazonservices.com, then set AMAZON_CLIENT_ID / AMAZON_CLIENT_SECRET. Per-tenant connection happens via Connect Amazon on the Channels page.",
      };
    }
    return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "App credentials present — connect a Seller Central account via Connect Amazon to test a real call." };
  }

  /** No app-level ping exists for SP-API (every call needs a seller's own
   * authorized token) — unlike Etsy's openapi-ping, there's nothing to test
   * before a tenant connects. */
  async testConnection() {
    if (!this.hasRequiredEnv(AmazonConnector.ENV)) {
      return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "AMAZON_CLIENT_ID and AMAZON_CLIENT_SECRET are both required." };
    }
    return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "App credentials present. SP-API has no app-level ping — connect a Seller Central account to verify a real connection." };
  }

  /** Fetches a tenant's decrypted Amazon refresh token via the same
   * generic service_role-only RPCs EtsyConnector uses, keyed by
   * p_marketplace: "amazon". */
  async _getTenantConnection(tenantId) {
    if (!tenantId) return null;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      throw new AmazonListingError(
        "service_role_key_missing",
        "SUPABASE_SERVICE_ROLE_KEY is not configured — cannot look up a tenant's own Amazon connection.",
        { statusCode: 500 },
      );
    }
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };
    const tokenRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/get_decrypted_marketplace_token`, {
      method: "POST", headers,
      body: JSON.stringify({ p_tenant_id: tenantId, p_marketplace: "amazon", p_environment: "production" }),
    });
    if (!tokenRes.ok) {
      throw new AmazonListingError(
        "tenant_token_lookup_failed", `Failed to look up tenant's Amazon connection (HTTP ${tokenRes.status})`,
        { statusCode: 502 },
      );
    }
    const refreshToken = await tokenRes.json();
    return refreshToken ? { refreshToken } : null;
  }

  /** Cached LWA access token, refreshed via Amazon's standard OAuth token
   * endpoint (grant_type=refresh_token) — the same endpoint used for the
   * initial code exchange in pages/api/channels/amazon/callback.js. */
  async _getAccessToken(tenantId) {
    const now = Date.now();
    const cacheKey = tenantId || "__shared__";
    if (this._accessTokenCache?.[cacheKey] && now < this._accessTokenCache[cacheKey].expiresAt) {
      return this._accessTokenCache[cacheKey];
    }

    const conn = await this._getTenantConnection(tenantId);
    if (!conn) {
      throw new AmazonListingError("amazon_not_connected", "This account hasn't connected Amazon yet.", { statusCode: 409 });
    }

    let res;
    try {
      res = await fetch("https://api.amazon.com/auth/o2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: conn.refreshToken,
          client_id: process.env.AMAZON_CLIENT_ID,
          client_secret: process.env.AMAZON_CLIENT_SECRET,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new AmazonListingError(
        "token_refresh_failed",
        err.name === "TimeoutError" ? "Amazon did not respond within 10s while refreshing the access token" : `Amazon token refresh failed: ${err.message}`,
        { statusCode: 502 },
      );
    }
    if (!res.ok) {
      throw new AmazonListingError("token_refresh_failed", `Amazon token refresh returned HTTP ${res.status}`, { statusCode: res.status });
    }
    const body = await res.json();
    if (!body.access_token) {
      throw new AmazonListingError("token_refresh_failed", "Amazon token refresh succeeded but returned no access_token", { statusCode: 502 });
    }

    const expiresInMs = (body.expires_in || 3600) * 1000;
    const cached = { token: body.access_token, expiresAt: now + expiresInMs - AmazonConnector.TOKEN_EXPIRY_SAFETY_MARGIN_MS };
    this._accessTokenCache[cacheKey] = cached;
    return cached;
  }

  /** @param {string} inventory.sellerId Required — the Amazon Merchant/Seller
   *   ID, used as a path segment (not looked up automatically; get it from
   *   Seller Central > Account Info, or the Get Marketplace Participations call).
   * @param {string} inventory.marketplaceId Required — e.g. "ATVPDKIKX0DER"
   *   for the US marketplace. Determines both the query param and which
   *   region's SP-API endpoint to call.
   * @param {string} [inventory.productType="PRODUCT"] An Amazon product-type
   *   name from the Product Type Definitions API. "PRODUCT" is a generic
   *   fallback that works for basic listings but real categories (shoes,
   *   electronics, etc.) have their own required attributes beyond what
   *   this method sets — look those up via Product Type Definitions first
   *   for anything beyond a minimal generic listing.
   * @param {boolean} [options.dryRun=true] Matches every other connector —
   *   creating a real Amazon listing requires dryRun:false explicitly.
   *
   * As of October 2, 2023, SP-API no longer requires AWS IAM / Signature
   * Version 4 — a plain LWA bearer token in x-amz-access-token is sufficient
   * for all operations including Listings Items
   * (https://developer-docs.amazon.com/sp-api/changelog/sp-api-will-no-longer-require-aws-iam-or-aws-signature-version-4).
   * The class comment describing this as needing SigV4 was written against
   * pre-2023 SP-API and is out of date — _getAccessToken() above already
   * does everything auth-wise that's actually required. */
  async createListing(inventory, options = {}) {
    const { dryRun = true } = options;

    if (!inventory.sku || !inventory.title) {
      throw new AmazonListingError("missing_fields", "SKU and title are required", { statusCode: 400 });
    }
    if (!inventory.sellerId || !inventory.marketplaceId) {
      throw new AmazonListingError(
        "missing_fields",
        "sellerId and marketplaceId are required — SP-API's Listings Items endpoint is scoped per-seller and per-marketplace with no safe default.",
        { statusCode: 400 },
      );
    }

    const marketplaceId = inventory.marketplaceId;
    const productType = inventory.productType || "PRODUCT";
    const attributes = {
      condition_type: [{ value: inventory.condition || "new_new", marketplace_id: marketplaceId }],
      item_name: [{ value: inventory.title, language_tag: "en_US", marketplace_id: marketplaceId }],
    };
    if (inventory.description) {
      attributes.product_description = [{ value: inventory.description, language_tag: "en_US", marketplace_id: marketplaceId }];
    }
    if (inventory.imageUrl) {
      attributes.main_product_image_locator = [{ media_location: inventory.imageUrl, marketplace_id: marketplaceId }];
    }
    if (inventory.price != null) {
      attributes.purchasable_offer = [
        {
          marketplace_id: marketplaceId,
          currency: inventory.currency || "USD",
          our_price: [{ schedule: [{ value_with_tax: Number(inventory.price) }] }],
        },
      ];
    }
    if (inventory.quantity != null) {
      attributes.fulfillment_availability = [{ fulfillment_channel_code: "DEFAULT", quantity: inventory.quantity }];
    }

    const productBody = { productType, requirements: "LISTING", attributes };

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        published: false,
        payload: productBody,
        would_put_to: `https://sellingpartnerapi-na.amazon.com/listings/2021-08-01/items/${inventory.sellerId}/${encodeURIComponent(inventory.sku)}?marketplaceIds=${marketplaceId}`,
        note: "productType defaults to the generic \"PRODUCT\" — real Amazon categories require category-specific attributes from the Product Type Definitions API beyond what's set here.",
      };
    }

    const { token } = await this._getAccessToken(inventory.tenantId);
    if (!token) {
      throw new AmazonListingError("amazon_not_connected", "Amazon Seller Central account not connected", { statusCode: 409 });
    }

    // SP-API is region-sharded; NA is the default here since that's the
    // only region this codebase has ever configured. EU/FE sellers would
    // need "https://sellingpartnerapi-eu.amazon.com" / "-fe" instead.
    const endpoint = `https://sellingpartnerapi-na.amazon.com/listings/2021-08-01/items/${inventory.sellerId}/${encodeURIComponent(inventory.sku)}?marketplaceIds=${marketplaceId}`;
    const putRes = await fetch(endpoint, {
      method: "PUT",
      headers: {
        "x-amz-access-token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(productBody),
      signal: AbortSignal.timeout(30_000),
    });
    const putData = await putRes.json().catch(() => null);
    if (!putRes.ok || putData?.status === "REJECTED" || putData?.status === "INVALID") {
      throw new AmazonListingError(
        "product_creation_failed",
        `Amazon SP-API error: ${JSON.stringify(putData?.issues || putData) || putRes.statusText}`,
        { statusCode: putRes.status },
      );
    }

    return {
      listingId: inventory.sku,
      url: `https://sellercentral.amazon.com/skucentral?asin=&sku=${encodeURIComponent(inventory.sku)}`,
      submissionId: putData?.submissionId || null,
      status: putData?.status || null,
    };
  }
}

/** Thrown by TikTokShopConnector.createListing() on any failure. Mirrors
 * EbayListingError/EtsyListingError's shape for consistent caller handling. */
class TikTokShopListingError extends Error {
  constructor(code, message, { statusCode } = {}) {
    super(message);
    this.name = "TikTokShopListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
  }
}

/**
 * TikTok Shop Partner Center OAuth — per-tenant connection, same shape as
 * EtsyConnector/AmazonConnector. Verified against TikTok Shop's actual
 * Partner API docs 2026-09-13 (NOT the general TikTok Login Kit endpoints,
 * which are a different product and were wrongly used in an earlier,
 * never-tested draft of this integration):
 *   - token exchange: GET https://auth.tiktok-shops.com/api/v2/token/get
 *     with app_key/app_secret/auth_code/grant_type=authorized_code
 *     (note: "authorized_code", not the standard OAuth "authorization_code")
 *   - refresh: GET https://auth.tiktok-shops.com/api/v2/token/refresh
 *     with app_key/app_secret/refresh_token/grant_type=refresh_token
 *   - success is signaled by a JSON body with code === 0, NOT by HTTP status
 *
 * createListing() is NOT implemented — TikTok Shop's Product API requires
 * its own HMAC-SHA256 request-signing scheme, separate work from the OAuth
 * connection this class handles.
 */
class TikTokShopConnector extends BaseConnector {
  static ENV = ["TIKTOK_SHOP_APP_KEY", "TIKTOK_SHOP_APP_SECRET"];
  static TOKEN_EXPIRY_SAFETY_MARGIN_MS = 5 * 60 * 1000;

  constructor() {
    super("tiktok-shop");
    this._accessTokenCache = {};
  }

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(TikTokShopConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: "Ready for credentials: register an app at partner.tiktokshop.com, then set TIKTOK_SHOP_APP_KEY / TIKTOK_SHOP_APP_SECRET. Per-tenant connection happens via Connect TikTok Shop on the Channels page.",
      };
    }
    return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "App credentials present — connect a shop via Connect TikTok Shop to test a real call." };
  }

  async testConnection() {
    if (!this.hasRequiredEnv(TikTokShopConnector.ENV)) {
      return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "TIKTOK_SHOP_APP_KEY and TIKTOK_SHOP_APP_SECRET are both required." };
    }
    return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "App credentials present. TikTok Shop has no app-level ping — connect a shop to verify a real connection." };
  }

  async _getTenantConnection(tenantId) {
    if (!tenantId) return null;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      throw new TikTokShopListingError(
        "service_role_key_missing",
        "SUPABASE_SERVICE_ROLE_KEY is not configured — cannot look up a tenant's own TikTok Shop connection.",
        { statusCode: 500 },
      );
    }
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };
    const tokenRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/get_decrypted_marketplace_token`, {
      method: "POST", headers,
      body: JSON.stringify({ p_tenant_id: tenantId, p_marketplace: "tiktok-shop", p_environment: "production" }),
    });
    if (!tokenRes.ok) {
      throw new TikTokShopListingError(
        "tenant_token_lookup_failed", `Failed to look up tenant's TikTok Shop connection (HTTP ${tokenRes.status})`,
        { statusCode: 502 },
      );
    }
    const refreshToken = await tokenRes.json();
    return refreshToken ? { refreshToken } : null;
  }

  async _getAccessToken(tenantId) {
    const now = Date.now();
    const cacheKey = tenantId || "__shared__";
    if (this._accessTokenCache?.[cacheKey] && now < this._accessTokenCache[cacheKey].expiresAt) {
      return this._accessTokenCache[cacheKey];
    }

    const conn = await this._getTenantConnection(tenantId);
    if (!conn) {
      throw new TikTokShopListingError("tiktok_shop_not_connected", "This account hasn't connected TikTok Shop yet.", { statusCode: 409 });
    }

    const params = new URLSearchParams({
      app_key: process.env.TIKTOK_SHOP_APP_KEY,
      app_secret: process.env.TIKTOK_SHOP_APP_SECRET,
      refresh_token: conn.refreshToken,
      grant_type: "refresh_token",
    });

    let res;
    try {
      res = await fetch(`https://auth.tiktok-shops.com/api/v2/token/refresh?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new TikTokShopListingError(
        "token_refresh_failed",
        err.name === "TimeoutError" ? "TikTok Shop did not respond within 10s while refreshing the access token" : `TikTok Shop token refresh failed: ${err.message}`,
        { statusCode: 502 },
      );
    }
    // TikTok Shop signals success via body.code === 0, not HTTP status —
    // the HTTP layer returns 200 even for most auth failures.
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.code !== 0 || !body.data?.access_token) {
      throw new TikTokShopListingError(
        "token_refresh_failed",
        (body && body.message) || `TikTok Shop token refresh failed (HTTP ${res.status})`,
        { statusCode: 502 },
      );
    }

    const expiresInMs = (body.data.access_token_expire_in || 7 * 24 * 3600) * 1000;
    const cached = { token: body.data.access_token, expiresAt: now + expiresInMs - TikTokShopConnector.TOKEN_EXPIRY_SAFETY_MARGIN_MS };
    this._accessTokenCache[cacheKey] = cached;
    return cached;
  }

  /** TikTok Shop's own HMAC-SHA256 request signing (NOT AWS-style) — the
   * exact algorithm from partner.tiktokshop.com/docv2/page/678e3a3d4ddec3030b238faf,
   * verified against the official Go code sample 2026-09-18:
   *   1. all query params except sign & access_token, sorted alphabetically
   *   2. concatenated as {key}{value} with no separators
   *   3. prefixed with the request path
   *   4. if Content-Type isn't multipart/form-data, the raw request body is appended
   *   5. wrapped as secret + input + secret
   *   6. HMAC-SHA256 with app_secret as the key, output as lowercase hex
   * API version 202309+ sends the access token via the x-tts-access-token
   * header, NOT the query string — it is never part of the signed input. */
  static _sign(pathname, queryParams, { body = "", isMultipart = false } = {}) {
    const secret = process.env.TIKTOK_SHOP_APP_SECRET;
    const keys = Object.keys(queryParams)
      .filter((k) => k !== "sign" && k !== "access_token")
      .sort();
    let input = keys.map((k) => `${k}${queryParams[k]}`).join("");
    input = pathname + input;
    if (!isMultipart) input += body;
    input = secret + input + secret;
    const crypto = require("crypto");
    return crypto.createHmac("sha256", secret).update(input, "utf8").digest("hex");
  }

  /** Builds the common app_key/timestamp/sign query params every signed
   * TikTok Shop call needs, given the exact body that will be sent. */
  static _signedQuery(pathname, extraParams, { body = "", isMultipart = false } = {}) {
    const base = {
      app_key: process.env.TIKTOK_SHOP_APP_KEY,
      timestamp: String(Math.floor(Date.now() / 1000)),
      ...extraParams,
    };
    const sign = TikTokShopConnector._sign(pathname, base, { body, isMultipart });
    return new URLSearchParams({ ...base, sign });
  }

  /** Uploads an externally-hosted image to TikTok Shop's own CDN — required
   * because Create Product rejects any image URL not hosted by TikTok Shop
   * (confirmed in their Upload Product Image docs: "You will not be able to
   * use any image URLs that are not hosted by TikTok Shop"). Fetches the
   * source image, re-uploads as multipart/form-data, returns the `uri`
   * Create Product's main_images field expects. */
  async _uploadImage(imageUrl, accessToken, shopCipher, useCase = "MAIN_IMAGE") {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!imgRes.ok) {
      throw new TikTokShopListingError("image_fetch_failed", `Could not fetch source image (HTTP ${imgRes.status}): ${imageUrl}`, { statusCode: 400 });
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    const pathname = "/product/202309/images/upload";
    // Multipart bodies are excluded from the signature per TikTok's own
    // algorithm, so only query params matter here.
    const query = TikTokShopConnector._signedQuery(pathname, {}, { isMultipart: true });

    const form = new FormData();
    form.append("data", new Blob([imgBuffer]), "image.jpg");
    form.append("use_case", useCase);

    const res = await fetch(`https://open-api.tiktokglobalshop.com${pathname}?${query.toString()}`, {
      method: "POST",
      headers: { "x-tts-access-token": accessToken },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.code !== 0 || !body.data?.uri) {
      throw new TikTokShopListingError(
        "image_upload_failed",
        (body && body.message) || `TikTok Shop image upload failed (HTTP ${res.status})`,
        { statusCode: 502 },
      );
    }
    return body.data.uri;
  }

  /** @param {string} inventory.categoryId Required — a valid LEAF category_id
   *   from TikTok Shop's Get Categories API. There is no safe universal
   *   default; category drives which product_attributes are mandatory.
   * @param {string} inventory.shopCipher Required — from the tenant's
   *   Get Authorization Shop response, identifies which shop to post to.
   * @param {boolean} [options.dryRun=true] Matches every other connector in
   *   this file — creating a real TikTok Shop listing (and uploading a real
   *   image to their CDN) requires dryRun:false explicitly. */
  async createListing(inventory, options = {}) {
    const { dryRun = true } = options;

    if (!inventory.title || !inventory.categoryId || !inventory.shopCipher) {
      throw new TikTokShopListingError(
        "missing_fields",
        "title, categoryId, and shopCipher are required. categoryId must be a valid leaf category from the Get Categories API — there is no safe default. shopCipher comes from Get Authorization Shop.",
        { statusCode: 400 },
      );
    }

    const skuPrice = inventory.price ? String(inventory.price) : "0.00";
    const productBody = {
      save_mode: "LISTING",
      title: inventory.title,
      description: inventory.description ? `<p>${inventory.description}</p>` : "<p></p>",
      category_id: inventory.categoryId,
      main_images: [], // filled in below once uploaded (live path only)
      skus: [
        {
          seller_sku: inventory.sku || undefined,
          price: { amount: skuPrice, currency: inventory.currency || "USD" },
          inventory: [{ warehouse_id: inventory.warehouseId, quantity: inventory.quantity || 1 }],
        },
      ],
    };

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        published: false,
        payload: productBody,
        note: inventory.imageUrl
          ? "imageUrl would be uploaded to TikTok Shop's CDN via /product/202309/images/upload before this call, then its returned uri placed into main_images."
          : "No imageUrl provided — main_images would be empty, which TikTok Shop requires at least one entry for.",
      };
    }

    if (!this.hasRequiredEnv(TikTokShopConnector.ENV)) {
      throw new TikTokShopListingError("not_configured", "TIKTOK_SHOP_APP_KEY / TIKTOK_SHOP_APP_SECRET are not set.", { statusCode: 409 });
    }

    const { token } = await this._getAccessToken(inventory.tenantId);

    if (inventory.imageUrl) {
      const uri = await this._uploadImage(inventory.imageUrl, token, inventory.shopCipher);
      productBody.main_images = [{ uri }];
    }
    if (productBody.main_images.length === 0) {
      throw new TikTokShopListingError("missing_image", "TikTok Shop requires at least one main image — inventory.imageUrl was not provided.", { statusCode: 400 });
    }
    if (!inventory.warehouseId) {
      throw new TikTokShopListingError("missing_fields", "inventory.warehouseId is required to set stock — look it up via TikTok Shop's warehouse/logistics APIs.", { statusCode: 400 });
    }

    const pathname = "/product/202309/products";
    const bodyStr = JSON.stringify(productBody);
    const query = TikTokShopConnector._signedQuery(pathname, { shop_cipher: inventory.shopCipher }, { body: bodyStr });

    const createRes = await fetch(`https://open-api.tiktokglobalshop.com${pathname}?${query.toString()}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tts-access-token": token },
      body: bodyStr,
      signal: AbortSignal.timeout(30_000),
    });
    const createData = await createRes.json().catch(() => null);
    if (!createRes.ok || !createData || createData.code !== 0) {
      throw new TikTokShopListingError(
        "product_creation_failed",
        (createData && createData.message) || `TikTok Shop API error (HTTP ${createRes.status})`,
        { statusCode: createRes.status },
      );
    }

    return { listingId: String(createData.data.product_id), url: null };
  }
}

/** Thrown by ShopifyConnector.createListing() on any failure. Mirrors
 * EbayListingError/EtsyListingError's shape for consistent caller handling. */
class ShopifyListingError extends Error {
  constructor(code, message, { statusCode } = {}) {
    super(message);
    this.name = "ShopifyListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
  }
}

/**
 * Shopify Store Admin API — per-store OAuth connection (Bearer token),
 * same shared-app / per-tenant-consent shape as eBay/Etsy/Amazon/TikTok.
 * Each tenant authorizes their own Shopify store and tokens are stored
 * encrypted per-tenant via store_marketplace_connection.
 *
 * createListing() IS implemented — see below (dry-run capable, live-tested
 * 2026-09-18 against a real store, real product created). Also supports a
 * single-store static Admin-token path (SHOPIFY_ADMIN_TOKEN, auto-refreshed
 * via client_credentials) as an alternative to full per-tenant OAuth.
 */
class ShopifyConnector extends BaseConnector {
  static ENV = ["SHOPIFY_STORE_URL", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"];
  static GRAPHQL_ENDPOINT_TEMPLATE = "https://{shop}.myshopify.com/admin/api/2024-10/graphql.json";

  constructor() {
    super("shopify");
    this._accessTokenCache = {};
  }

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(ShopifyConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: "Ready for credentials: register a custom app in your Shopify store admin, then set SHOPIFY_STORE_URL / SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET. Per-store connection happens via Connect Shopify on the Channels page.",
      };
    }
    return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "App credentials present — connect a Shopify store via Connect Shopify to test a real call." };
  }

  async testConnection() {
    // Static-key path first: a single-store owner with an Admin API access
    // token doesn't need the OAuth CLIENT_ID/SECRET dance. authenticate()
    // makes a real read-only call, so prefer it when both static vars are set.
    if (this.hasRequiredEnv(["SHOPIFY_STORE_URL", "SHOPIFY_ADMIN_TOKEN"])) {
      const result = await this.authenticate();
      return result.connected
        ? { status: CONNECTION_STATUS.CONNECTED, detail: result.detail }
        : { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: result.detail };
    }
    if (!this.hasRequiredEnv(ShopifyConnector.ENV)) {
      return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "SHOPIFY_STORE_URL, SHOPIFY_CLIENT_ID, and SHOPIFY_CLIENT_SECRET are all required (or set SHOPIFY_STORE_URL + SHOPIFY_ADMIN_TOKEN for static-key auth)." };
    }
    return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "App credentials present. Shopify stores connect per-store — connect your store to verify a real connection." };
  }

  /** SHOPIFY_STORE_URL may be given as a bare domain
   * ("your-store.myshopify.com") or a full origin — normalize to an origin
   * so callers can build `${origin}/admin/api/...` paths consistently. */
  static normalizeStoreOrigin(raw) {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    if (url.protocol !== "https:") {
      throw new Error("SHOPIFY_STORE_URL must use https:// — the admin token would leak over plain HTTP.");
    }
    return url.origin;
  }

  /** Rewrites SHOPIFY_ADMIN_TOKEN (and its expiry) in .env.local in place,
   * touching no other line. Appends the keys if they aren't present yet.
   * Best-effort: a write failure is logged, never thrown — a refreshed
   * token that's live in process.env for THIS run must not be discarded
   * just because persisting it to disk failed (e.g. read-only filesystem
   * in some deploy targets). */
  static _persistAdminToken(token, expiresAt) {
    const envPath = path.join(process.cwd(), ".env.local");
    let content = "";
    try {
      content = fs.readFileSync(envPath, "utf8");
    } catch {
      content = "";
    }
    const upsert = (src, key, line) => {
      const re = new RegExp(`^${key}=.*$`, "m");
      if (re.test(src)) return src.replace(re, line);
      const sep = src === "" || src.endsWith("\n") ? "" : "\n";
      return `${src}${sep}${line}\n`;
    };
    content = upsert(content, "SHOPIFY_ADMIN_TOKEN", `SHOPIFY_ADMIN_TOKEN="${token}"`);
    content = upsert(content, "SHOPIFY_ADMIN_TOKEN_EXPIRES_AT", `SHOPIFY_ADMIN_TOKEN_EXPIRES_AT=${expiresAt}`);
    try {
      fs.writeFileSync(envPath, content, "utf8");
    } catch (err) {
      console.error("[ShopifyConnector] Failed to persist refreshed SHOPIFY_ADMIN_TOKEN to .env.local:", err.message);
    }
  }

  /** Requests a brand-new Admin API access token via the client_credentials
   * grant (the same call Dev-Dashboard-created custom apps require — these
   * tokens expire in ~24h, unlike legacy custom apps' permanent tokens).
   * Updates process.env for the rest of this process immediately and
   * persists to .env.local so a restart doesn't lose it either. */
  async _refreshAdminToken() {
    if (!this.hasRequiredEnv(["SHOPIFY_STORE_URL", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"])) {
      throw new Error(
        "Cannot refresh SHOPIFY_ADMIN_TOKEN — SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are required to request a new one.",
      );
    }
    const origin = ShopifyConnector.normalizeStoreOrigin(process.env.SHOPIFY_STORE_URL);
    const res = await fetch(`${origin}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.access_token) {
      throw new Error(
        `Shopify token refresh failed (HTTP ${res.status}): ${body?.error_description || body?.error || res.statusText}`,
      );
    }
    const expiresAt = Date.now() + (body.expires_in || 86399) * 1000;
    process.env.SHOPIFY_ADMIN_TOKEN = body.access_token;
    process.env.SHOPIFY_ADMIN_TOKEN_EXPIRES_AT = String(expiresAt);
    ShopifyConnector._persistAdminToken(body.access_token, expiresAt);
    return body.access_token;
  }

  /** Returns a live SHOPIFY_ADMIN_TOKEN, refreshing first when it's missing,
   * within 5 minutes of its recorded expiry, or when the caller already
   * knows the current one was rejected (forceRefresh, e.g. after a 401). */
  async _getValidAdminToken(forceRefresh = false) {
    const REFRESH_MARGIN_MS = 5 * 60 * 1000;
    const expiresAt = Number(process.env.SHOPIFY_ADMIN_TOKEN_EXPIRES_AT) || 0;
    const stale = !process.env.SHOPIFY_ADMIN_TOKEN || Date.now() > expiresAt - REFRESH_MARGIN_MS;
    if (forceRefresh || stale) {
      await this._refreshAdminToken();
    }
    return process.env.SHOPIFY_ADMIN_TOKEN;
  }

  /** Static-key auth check for a store's own Admin API access token —
   * separate from the per-tenant OAuth flow above (SHOPIFY_CLIENT_ID/
   * SECRET), for the common case of a single store owner who already has a
   * custom app's Admin API access token and doesn't need the OAuth consent
   * dance. Reuses SHOPIFY_STORE_URL (the same variable createListing()
   * already reads) rather than introducing a second variable for the same
   * value. Read-only: GET shop.json only, never creates/updates/deletes
   * anything. Auto-refreshes the token (before expiry, or on a live 401)
   * via the app's own CLIENT_ID/CLIENT_SECRET — no manual steps. */
  async authenticate() {
    if (
      !this.hasRequiredEnv(["SHOPIFY_STORE_URL", "SHOPIFY_ADMIN_TOKEN"]) &&
      !this.hasRequiredEnv(["SHOPIFY_STORE_URL", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"])
    ) {
      return { connected: false, detail: "Missing SHOPIFY_STORE_URL and/or SHOPIFY_ADMIN_TOKEN (or CLIENT_ID/CLIENT_SECRET to obtain one)" };
    }
    let origin;
    try {
      origin = ShopifyConnector.normalizeStoreOrigin(process.env.SHOPIFY_STORE_URL);
    } catch (err) {
      return { connected: false, detail: err.message };
    }
    const attempt = async (token) =>
      fetch(`${origin}/admin/api/2024-10/shop.json`, {
        headers: { "X-Shopify-Access-Token": token },
        signal: AbortSignal.timeout(10_000),
      });
    try {
      let token = await this._getValidAdminToken();
      let res = await attempt(token);
      if (res.status === 401) {
        // Current token was rejected live — refresh once and retry before
        // giving up, exactly the "on a 401" trigger this method promises.
        token = await this._getValidAdminToken(true);
        res = await attempt(token);
      }
      const body = await res.json().catch(() => null);
      return res.ok
        ? { connected: true, detail: `Authenticated to store "${body?.shop?.name || origin}"` }
        : { connected: false, detail: `Shopify auth failed (HTTP ${res.status}): ${body?.errors || res.statusText}` };
    } catch (err) {
      return {
        connected: false,
        detail: err.name === "TimeoutError" ? "Shopify did not respond within 10s" : `Shopify request failed: ${err.message}`,
      };
    }
  }

  async _getTenantConnection(tenantId) {
    if (!tenantId) return null;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      throw new ShopifyListingError(
        "service_role_key_missing",
        "SUPABASE_SERVICE_ROLE_KEY is not configured — cannot look up a tenant's own Shopify connection.",
        { statusCode: 500 },
      );
    }
    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };
    const tokenRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/get_decrypted_marketplace_token`, {
      method: "POST", headers,
      body: JSON.stringify({ p_tenant_id: tenantId, p_marketplace: "shopify", p_environment: "production" }),
    });
    if (!tokenRes.ok) {
      throw new ShopifyListingError(
        "tenant_token_lookup_failed", `Failed to look up tenant's Shopify connection (HTTP ${tokenRes.status})`,
        { statusCode: 502 },
      );
    }
    const accessToken = await tokenRes.json();
    if (!accessToken) return null;

    // Best-effort: the connected store's domain, stored as account_identifier
    // on the connection row (set by pages/api/channels/shopify/callback.js).
    // createListing() needs this to target the RIGHT store instead of the
    // single shared SHOPIFY_STORE_URL env var — but a lookup failure here
    // must never block listing creation, only fall back to that env var.
    let accountIdentifier = null;
    try {
      const rowRes = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/tenant_marketplace_connections?tenant_id=eq.${tenantId}&marketplace=eq.shopify&environment=eq.production&select=account_identifier`,
        { headers },
      );
      if (rowRes.ok) {
        const rows = await rowRes.json();
        accountIdentifier = rows?.[0]?.account_identifier || null;
      }
    } catch {
      // Non-fatal — createListing() falls back to SHOPIFY_STORE_URL.
    }

    return { accessToken, accountIdentifier };
  }

  async _getAccessToken(tenantId) {
    const now = Date.now();
    const cacheKey = tenantId || "__shared__";
    if (this._accessTokenCache?.[cacheKey] && now < this._accessTokenCache[cacheKey].expiresAt) {
      return this._accessTokenCache[cacheKey];
    }

    const conn = await this._getTenantConnection(tenantId);
    if (conn) {
      // Shopify per-tenant OAuth tokens don't expire — once issued, they're
      // valid until the custom app is deleted or the token is regenerated.
      // Cache indefinitely.
      const cached = {
        token: conn.accessToken,
        accountIdentifier: conn.accountIdentifier,
        expiresAt: now + (365 * 24 * 60 * 60 * 1000),
        source: "tenant_oauth",
      };
      this._accessTokenCache[cacheKey] = cached;
      return cached;
    }

    // No per-tenant OAuth connection — fall back to the single-store static
    // Admin token path (auto-refreshed via client_credentials, unlike the
    // tenant path above). This is the common single-store-owner case this
    // session set up: SHOPIFY_STORE_URL + SHOPIFY_ADMIN_TOKEN.
    if (
      this.hasRequiredEnv(["SHOPIFY_STORE_URL", "SHOPIFY_ADMIN_TOKEN"]) ||
      this.hasRequiredEnv(["SHOPIFY_STORE_URL", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"])
    ) {
      const token = await this._getValidAdminToken();
      const cached = {
        token,
        accountIdentifier: null, // createListing() falls back to SHOPIFY_STORE_URL for this source
        expiresAt: Number(process.env.SHOPIFY_ADMIN_TOKEN_EXPIRES_AT) || now,
        source: "static_admin_token",
      };
      this._accessTokenCache[cacheKey] = cached;
      return cached;
    }

    throw new ShopifyListingError("shopify_not_connected", "This account hasn't connected Shopify yet.", { statusCode: 409 });
  }

  /** @param {boolean} [options.dryRun=true] Defaults to true — matches every
   *   other connector in this file. Creating a real product requires
   *   explicitly passing dryRun:false. Dry-run builds and returns the exact
   *   payload that would be POSTed, without any network call. */
  async createListing(inventory, options = {}) {
    const { dryRun = true } = options;

    if (!inventory.sku || !inventory.title) {
      throw new ShopifyListingError("missing_fields", "SKU and title are required", { statusCode: 400 });
    }

    const productBody = {
      product: {
        title: inventory.title,
        body_html: inventory.description || "",
        vendor: "Boss Listers",
      },
    };

    if (inventory.sku) {
      productBody.product.variants = [
        {
          sku: inventory.sku,
          price: inventory.price ? String(inventory.price) : "0.00",
          quantity: inventory.quantity || 1,
        },
      ];
    }

    if (Array.isArray(inventory.images) && inventory.images.length > 0) {
      productBody.product.images = inventory.images.map((img) => ({
        src: typeof img === "string" ? img : img.src || img.url,
      }));
    } else if (inventory.imageUrl) {
      productBody.product.images = [{ src: inventory.imageUrl }];
    }

    if (dryRun) {
      // Resolve which store URL a real call would target, same fallback
      // order as the live path below, without requiring a live token.
      let previewStoreUrl = process.env.SHOPIFY_STORE_URL || null;
      try {
        if (previewStoreUrl) previewStoreUrl = ShopifyConnector.normalizeStoreOrigin(previewStoreUrl);
      } catch {
        // leave as-is; this is a preview only
      }
      return {
        ok: true,
        dry_run: true,
        published: false,
        payload: productBody,
        would_post_to: previewStoreUrl ? `${previewStoreUrl}/admin/api/2024-10/products.json` : null,
      };
    }

    const { token, accountIdentifier } = await this._getAccessToken(inventory.tenantId);
    if (!token) {
      throw new ShopifyListingError("shopify_not_connected", "Shopify store not connected", { statusCode: 409 });
    }

    // Target the connected store's own domain, not the single shared env
    // var — a tenant's connection can be to any store, and posting to
    // SHOPIFY_STORE_URL with THEIR token would hit the wrong shop. Falls
    // back to SHOPIFY_STORE_URL if account_identifier is missing/invalid so
    // a lookup gap never blocks listing creation outright.
    let storeUrl;
    try {
      if (!accountIdentifier) throw new Error("no account_identifier on connection");
      storeUrl = ShopifyConnector.normalizeStoreOrigin(accountIdentifier);
    } catch {
      storeUrl = process.env.SHOPIFY_STORE_URL;
    }
    if (!storeUrl) {
      throw new ShopifyListingError("store_url_missing", "SHOPIFY_STORE_URL not configured", { statusCode: 500 });
    }

    const endpoint = `${storeUrl}/admin/api/2024-10/products.json`;
    // Shopify's REST Admin API takes the token via X-Shopify-Access-Token,
    // not an Authorization: Bearer header — fixed here (was previously
    // wrong and would have failed live regardless of token validity).
    const post = async (tok) =>
      fetch(endpoint, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": tok,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(productBody),
        signal: AbortSignal.timeout(30_000),
      });

    let createRes = await post(token);
    if (createRes.status === 401 && this._accessTokenCache[inventory.tenantId || "__shared__"]?.source === "static_admin_token") {
      // Static token was rejected live (expired or revoked) — refresh once
      // via client_credentials and retry before failing the whole call.
      const freshToken = await this._getValidAdminToken(true);
      this._accessTokenCache[inventory.tenantId || "__shared__"] = {
        token: freshToken,
        accountIdentifier: null,
        expiresAt: Number(process.env.SHOPIFY_ADMIN_TOKEN_EXPIRES_AT) || Date.now(),
        source: "static_admin_token",
      };
      createRes = await post(freshToken);
    }

    const createData = await createRes.json();
    if (!createRes.ok) {
      throw new ShopifyListingError(
        "product_creation_failed",
        `Shopify API error: ${createData.errors?.toString() || createRes.statusText}`,
        { statusCode: createRes.status },
      );
    }

    return { listingId: String(createData.product.id), url: `${storeUrl}/admin/products/${createData.product.id}` };
  }

  /** Fetches all products from the connected Shopify store. Returns array
   * of normalized products { sku, title, description, price, quantity, image_url, condition }.
   * Uses REST API pagination (cursor-based) to handle stores with 100+ products. */
  async fetchProducts(tenantId) {
    const { token, accountIdentifier } = await this._getAccessToken(tenantId);
    if (!token) {
      throw new ShopifyListingError("shopify_not_connected", "Shopify store not connected", { statusCode: 409 });
    }

    let storeUrl;
    try {
      if (!accountIdentifier) throw new Error("no account_identifier on connection");
      storeUrl = ShopifyConnector.normalizeStoreOrigin(accountIdentifier);
    } catch {
      storeUrl = process.env.SHOPIFY_STORE_URL;
    }
    if (!storeUrl) {
      throw new ShopifyListingError("store_url_missing", "SHOPIFY_STORE_URL not configured", { statusCode: 500 });
    }

    const products = [];
    let nextUrl = `${storeUrl}/admin/api/2024-10/products.json?limit=250&fields=id,title,bodyHtml,vendor,status,variants,images`;

    while (nextUrl) {
      const res = await fetch(nextUrl, {
        headers: { "X-Shopify-Access-Token": token },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ShopifyListingError(
          "fetch_products_failed",
          `Shopify API error: ${body?.errors?.toString() || res.statusText}`,
          { statusCode: res.status },
        );
      }

      const data = await res.json();
      const shopifyProducts = data.products || [];

      for (const product of shopifyProducts) {
        if (product.status === "archived") continue; // Skip archived products

        for (const variant of product.variants || []) {
          // Each variant becomes a separate SKU in BossListers
          const imageUrl = product.images?.[0]?.src || null;
          products.push({
            sku: variant.sku || `${product.id}-${variant.id}`,
            title: product.title,
            description: product.bodyHtml || null,
            price: parseFloat(variant.price) || 0,
            quantity: variant.inventory_quantity || 0,
            image_url: imageUrl,
            condition: "new",
            source: "shopify",
            shopify_product_id: String(product.id),
            shopify_variant_id: String(variant.id),
          });
        }
      }

      // Check for pagination link in Link header (Shopify uses cursor-based pagination)
      const linkHeader = res.headers.get("link") || "";
      nextUrl = null;
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextMatch) {
          nextUrl = nextMatch[1];
        }
      }
    }

    return products;
  }
}

const { WhatnotConnector, WhatnotListingError } = require("./WhatnotConnector");
const { MercariConnector, MercariListingError } = require("./MercariConnector");
const { PoshmarkConnector, PoshmarkListingError } = require("./PoshmarkConnector");
const { DepopConnector, DepopListingError } = require("./DepopConnector");

module.exports = {
  EbayConnector, EbayListingError,
  EtsyConnector, EtsyListingError,
  FacebookConnector, FacebookListingError,
  InstagramConnector, InstagramListingError,
  BonanzaConnector, BonanzaListingError,
  ShopifyConnector, ShopifyListingError,
  WooCommerceConnector, WooCommerceListingError,
  AmazonConnector, AmazonListingError,
  TikTokShopConnector, TikTokShopListingError,
  WhatnotConnector, WhatnotListingError,
  MercariConnector, MercariListingError,
  PoshmarkConnector, PoshmarkListingError,
  DepopConnector, DepopListingError
};
