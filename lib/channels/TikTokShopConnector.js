// lib/channels/TikTokShopConnector.js
// TikTok Shop Partner API (US market by default), API version 202309.
// Docs: https://partner.us.tiktokshop.com (US) / https://partner.tiktokshop.com (ROW)
//
// Hosts (see lib/tiktokShopHosts.js, overridable by env):
//   seller authorize  US  https://services.us.tiktokshop.com/open/authorize?service_id=...
//   token get/refresh     https://auth.tiktok-shops.com/api/v2/token/get | /refresh
//   OpenAPI               https://open-api.tiktokglobalshop.com
//
// Success is body.code === 0, never HTTP status (TikTok returns 200 for most
// failures). Token exchange uses grant_type "authorized_code" (TikTok's own
// spelling). From 202309 the access token goes in the x-tts-access-token
// header and is never part of the signature.
//
// Credentials: TIKTOK_SHOP_APP_KEY / TIKTOK_SHOP_APP_SECRET (app level).
// The seller's refresh token is stored encrypted per tenant in Supabase via
// store_marketplace_connection (see pages/api/channels/tiktok-shop/callback.js),
// together with the shop_cipher in the connection metadata.
// Never log tokens, the app secret, or signed query strings.
const crypto = require("crypto");
const { BaseConnector, CONNECTION_STATUS } = require("./connector");
const { getTikTokShopHosts } = require("../tiktokShopHosts");

const API_VERSION = "202309";

class TikTokShopListingError extends Error {
  constructor(code, message, { statusCode } = {}) {
    super(message);
    this.name = "TikTokShopListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
  }
}

/** TikTok's *_expire_in fields are absolute unix timestamps (seconds); older
 * docs called them durations. Accept both and return epoch milliseconds. */
function expiryToEpochMs(value, now = Date.now()) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return now + 7 * 24 * 3600 * 1000;
  return n > 1e9 ? n * 1000 : now + n * 1000;
}

class TikTokShopConnector extends BaseConnector {
  static ENV = ["TIKTOK_SHOP_APP_KEY", "TIKTOK_SHOP_APP_SECRET"];
  static TOKEN_EXPIRY_SAFETY_MARGIN_MS = 5 * 60 * 1000;
  static API_VERSION = API_VERSION;

  static hosts() {
    return getTikTokShopHosts();
  }

  constructor() {
    super("tiktok-shop");
    this._accessTokenCache = {};
  }

  // ---------------------------------------------------------------- OAuth

  /** Seller authorization URL. service_id comes from Partner Center
   * (App & Service > your app). state is echoed back to the redirect URL. */
  static getAuthorizeUrl(state) {
    const serviceId = process.env.TIKTOK_SHOP_SERVICE_ID || process.env.NEXT_PUBLIC_TIKTOK_SHOP_SERVICE_ID;
    if (!serviceId) {
      throw new TikTokShopListingError("not_configured", "TIKTOK_SHOP_SERVICE_ID (or NEXT_PUBLIC_TIKTOK_SHOP_SERVICE_ID) is not set.", { statusCode: 409 });
    }
    const params = new URLSearchParams({ service_id: serviceId });
    if (state) params.set("state", state);
    return `${TikTokShopConnector.hosts().authorizeUrl}?${params.toString()}`;
  }

  /** Callback step: auth code -> access + refresh tokens. Returns TikTok's
   * data object (access_token, refresh_token, *_expire_in, seller_name, ...). */
  static async exchangeAuthCode(code) {
    if (!process.env.TIKTOK_SHOP_APP_KEY || !process.env.TIKTOK_SHOP_APP_SECRET) {
      throw new TikTokShopListingError("not_configured", "TIKTOK_SHOP_APP_KEY / TIKTOK_SHOP_APP_SECRET are not set.", { statusCode: 503 });
    }
    const params = new URLSearchParams({
      app_key: process.env.TIKTOK_SHOP_APP_KEY,
      app_secret: process.env.TIKTOK_SHOP_APP_SECRET,
      auth_code: code,
      grant_type: "authorized_code",
    });
    return TikTokShopConnector._tokenCall(TikTokShopConnector.hosts().tokenGetUrl, params, "token_exchange_failed");
  }

  /** Refresh step: refresh token -> new access token (and possibly a new
   * refresh token). */
  static async refreshTokens(refreshToken) {
    const params = new URLSearchParams({
      app_key: process.env.TIKTOK_SHOP_APP_KEY,
      app_secret: process.env.TIKTOK_SHOP_APP_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    return TikTokShopConnector._tokenCall(TikTokShopConnector.hosts().tokenRefreshUrl, params, "token_refresh_failed");
  }

  static async _tokenCall(url, params, errorCode) {
    let res;
    try {
      res = await fetch(`${url}?${params.toString()}`, { signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      throw new TikTokShopListingError(
        errorCode,
        err.name === "TimeoutError" ? "TikTok Shop auth server did not respond within 15s" : `TikTok Shop auth call failed: ${err.message}`,
        { statusCode: 504 },
      );
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.code !== 0 || !body.data?.access_token) {
      throw new TikTokShopListingError(errorCode, (body && body.message) || `TikTok Shop auth call failed (HTTP ${res.status})`, { statusCode: 502 });
    }
    return body.data;
  }

  // -------------------------------------------------------------- Signing

  /** TikTok Shop HMAC-SHA256 signature, per the official signing doc and Go
   * sample (partner.tiktokshop.com/docv2/page/678e3a3d4ddec3030b238faf):
   *   1. query params except sign and access_token, keys sorted A-Z
   *   2. joined as {key}{value} with no separators
   *   3. request path prepended
   *   4. raw body appended unless Content-Type is multipart/form-data
   *   5. wrapped as app_secret + input + app_secret
   *   6. HMAC-SHA256 keyed with app_secret, lowercase hex */
  static _sign(pathname, queryParams, { body = "", isMultipart = false } = {}) {
    const secret = process.env.TIKTOK_SHOP_APP_SECRET;
    const keys = Object.keys(queryParams).filter((k) => k !== "sign" && k !== "access_token").sort();
    let input = pathname + keys.map((k) => `${k}${queryParams[k]}`).join("");
    if (!isMultipart) input += body;
    input = secret + input + secret;
    return crypto.createHmac("sha256", secret).update(input, "utf8").digest("hex");
  }

  static _signedQuery(pathname, extraParams, { body = "", isMultipart = false } = {}) {
    const base = {
      app_key: process.env.TIKTOK_SHOP_APP_KEY,
      timestamp: String(Math.floor(Date.now() / 1000)),
      ...extraParams,
    };
    const sign = TikTokShopConnector._sign(pathname, base, { body, isMultipart });
    return new URLSearchParams({ ...base, sign });
  }

  /** One signed OpenAPI call. Undefined query values are dropped before
   * signing so the signature always matches what is sent. */
  static async _call(method, pathname, { accessToken, query = {}, json, form, timeoutMs = 20_000, errorCode = "api_error" } = {}) {
    const cleanQuery = {};
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") cleanQuery[k] = String(v);
    const isMultipart = Boolean(form);
    const bodyStr = json !== undefined ? JSON.stringify(json) : "";
    const qs = TikTokShopConnector._signedQuery(pathname, cleanQuery, { body: bodyStr, isMultipart });
    const headers = { "x-tts-access-token": accessToken };
    if (json !== undefined) headers["content-type"] = "application/json";

    let res;
    try {
      res = await fetch(`${TikTokShopConnector.hosts().apiHost}${pathname}?${qs.toString()}`, {
        method,
        headers,
        body: isMultipart ? form : json !== undefined ? bodyStr : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new TikTokShopListingError(
        errorCode,
        err.name === "TimeoutError" ? `TikTok Shop did not respond within ${timeoutMs / 1000}s (${pathname})` : `TikTok Shop request failed: ${err.message}`,
        { statusCode: 504 },
      );
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.code !== 0) {
      throw new TikTokShopListingError(
        errorCode,
        `${(body && body.message) || `HTTP ${res.status}`}${body?.code ? ` (TikTok code ${body.code})` : ""}`,
        { statusCode: res.ok ? 502 : res.status },
      );
    }
    return body.data || {};
  }

  // --------------------------------------------------------------- Status

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(TikTokShopConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: "Ready for credentials: create a Custom app at partner.us.tiktokshop.com, then set TIKTOK_SHOP_APP_KEY / TIKTOK_SHOP_APP_SECRET. Each seller connects via Connect TikTok Shop on the Channels page.",
      };
    }
    return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "App credentials present — connect a shop via Connect TikTok Shop to test a real call." };
  }

  /** App-level check. TikTok Shop has no app-only ping, so this checks env
   * and that the signer works, then reports honestly that a shop must be
   * connected before anything can be proven live. */
  async testConnection() {
    if (!this.hasRequiredEnv(TikTokShopConnector.ENV)) {
      const missing = TikTokShopConnector.ENV.filter((n) => !process.env[n]);
      return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: `Missing ${missing.join(", ")}.` };
    }
    const hasService = Boolean(process.env.TIKTOK_SHOP_SERVICE_ID || process.env.NEXT_PUBLIC_TIKTOK_SHOP_SERVICE_ID);
    const sig = TikTokShopConnector._sign("/authorization/202309/shops", { app_key: "x", timestamp: "0" });
    const signerOk = /^[0-9a-f]{64}$/.test(sig);
    return {
      status: CONNECTION_STATUS.CONFIG_REQUIRED,
      detail: `App key+secret present, signer ${signerOk ? "ok" : "BROKEN"}, service_id ${hasService ? "present" : "MISSING (NEXT_PUBLIC_TIKTOK_SHOP_SERVICE_ID)"}, region ${TikTokShopConnector.hosts().region}. No shop connected from this script — click Connect TikTok Shop to prove a live call.`,
    };
  }

  /** Live per-tenant check: Get Authorized Shops (read-only). */
  async testTenantConnection(tenantId) {
    if (!tenantId) return { status: CONNECTION_STATUS.NOT_CONNECTED, detail: "No tenant to check." };
    try {
      const shops = await this.getAuthorizedShops(tenantId);
      return {
        status: CONNECTION_STATUS.CONNECTED,
        detail: `Your TikTok Shop is connected (${shops.length} authorized ${shops.length === 1 ? "shop" : "shops"}${shops[0]?.name ? `: ${shops[0].name}` : ""}).`,
      };
    } catch (err) {
      return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: `${err.message} — reconnect TikTok Shop if this persists.` };
    }
  }

  // --------------------------------------------------------------- Tokens

  async _getTenantConnection(tenantId) {
    if (!tenantId) return null;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      throw new TikTokShopListingError("service_role_key_missing", "SUPABASE_SERVICE_ROLE_KEY is not configured — cannot look up a tenant's TikTok Shop connection.", { statusCode: 500 });
    }
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/get_decrypted_marketplace_token`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_tenant_id: tenantId, p_marketplace: "tiktok-shop", p_environment: "production" }),
    });
    if (!res.ok) {
      throw new TikTokShopListingError("tenant_token_lookup_failed", `Failed to look up tenant's TikTok Shop connection (HTTP ${res.status})`, { statusCode: 502 });
    }
    const refreshToken = await res.json();
    return refreshToken ? { refreshToken } : null;
  }

  /** Cached access token for a tenant; refreshes automatically when the
   * cached one is within 5 minutes of expiry. */
  async _getAccessToken(tenantId) {
    const now = Date.now();
    const cacheKey = tenantId || "__shared__";
    const hit = this._accessTokenCache[cacheKey];
    if (hit && now < hit.expiresAt) return hit;

    const conn = await this._getTenantConnection(tenantId);
    if (!conn) {
      throw new TikTokShopListingError("tiktok_shop_not_connected", "This account hasn't connected TikTok Shop yet.", { statusCode: 409 });
    }
    const data = await TikTokShopConnector.refreshTokens(conn.refreshToken);
    const cached = {
      token: data.access_token,
      expiresAt: expiryToEpochMs(data.access_token_expire_in, now) - TikTokShopConnector.TOKEN_EXPIRY_SAFETY_MARGIN_MS,
    };
    this._accessTokenCache[cacheKey] = cached;
    return cached;
  }

  // ------------------------------------------------------- Shop and catalog

  /** Get Authorized Shops with a raw access token (used right after OAuth). */
  static async getAuthorizedShopsWithToken(accessToken) {
    const data = await TikTokShopConnector._call("GET", `/authorization/${API_VERSION}/shops`, { accessToken, errorCode: "shops_lookup_failed" });
    return data.shops || [];
  }

  async getAuthorizedShops(tenantId) {
    const { token } = await this._getAccessToken(tenantId);
    return TikTokShopConnector.getAuthorizedShopsWithToken(token);
  }

  /** shop_cipher for the tenant's US shop (or first shop). */
  async getShopCipher(tenantId) {
    const shops = await this.getAuthorizedShops(tenantId);
    if (!shops.length) throw new TikTokShopListingError("no_shop", "No shops are authorized for this TikTok Shop connection.", { statusCode: 409 });
    const shop = shops.find((s) => String(s.region).toUpperCase() === "US") || shops[0];
    return shop.cipher;
  }

  async getCategories(tenantId, { shopCipher, keyword } = {}) {
    const { token } = await this._getAccessToken(tenantId);
    const cipher = shopCipher || (await this.getShopCipher(tenantId));
    const data = await TikTokShopConnector._call("GET", `/product/${API_VERSION}/categories`, {
      accessToken: token, query: { shop_cipher: cipher, keyword, locale: "en-US" }, errorCode: "categories_failed",
    });
    return data.categories || [];
  }

  async getCategoryAttributes(tenantId, categoryId, { shopCipher } = {}) {
    const { token } = await this._getAccessToken(tenantId);
    const cipher = shopCipher || (await this.getShopCipher(tenantId));
    const data = await TikTokShopConnector._call("GET", `/product/${API_VERSION}/categories/${encodeURIComponent(categoryId)}/attributes`, {
      accessToken: token, query: { shop_cipher: cipher, locale: "en-US" }, errorCode: "attributes_failed",
    });
    return data.attributes || [];
  }

  async getWarehouses(tenantId, { shopCipher } = {}) {
    const { token } = await this._getAccessToken(tenantId);
    const cipher = shopCipher || (await this.getShopCipher(tenantId));
    const data = await TikTokShopConnector._call("GET", `/logistics/${API_VERSION}/warehouses`, {
      accessToken: token, query: { shop_cipher: cipher }, errorCode: "warehouses_failed",
    });
    return data.warehouses || [];
  }

  /** Upload Product Image — Create Product only accepts TikTok-hosted image
   * URIs, so every source image is re-uploaded here first. */
  async _uploadImage(imageUrl, accessToken, useCase = "MAIN_IMAGE") {
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!imgRes.ok) {
      throw new TikTokShopListingError("image_fetch_failed", `Could not fetch source image (HTTP ${imgRes.status})`, { statusCode: 400 });
    }
    const form = new FormData();
    form.append("data", new Blob([Buffer.from(await imgRes.arrayBuffer())]), "image.jpg");
    form.append("use_case", useCase);
    const data = await TikTokShopConnector._call("POST", `/product/${API_VERSION}/images/upload`, {
      accessToken, form, timeoutMs: 30_000, errorCode: "image_upload_failed",
    });
    if (!data.uri) throw new TikTokShopListingError("image_upload_failed", "TikTok Shop image upload returned no uri.", { statusCode: 502 });
    return data.uri;
  }

  // ------------------------------------------------------------- Listing

  /** Build the Create Product body from a BossListers inventory item. */
  static buildProductBody(inventory, mainImageUris = []) {
    const body = {
      save_mode: "LISTING",
      title: inventory.title,
      description: inventory.description ? `<p>${String(inventory.description).replace(/</g, "&lt;")}</p>` : "<p></p>",
      category_id: String(inventory.categoryId),
      main_images: mainImageUris.map((uri) => ({ uri })),
      skus: [{
        seller_sku: inventory.sku || undefined,
        price: { amount: String(inventory.price ?? "0.00"), currency: inventory.currency || "USD" },
        inventory: [{ warehouse_id: inventory.warehouseId, quantity: Number(inventory.quantity) || 1 }],
      }],
      package_weight: { value: String(inventory.weightLb ?? "1"), unit: "POUND" },
    };
    if (inventory.dimensionsIn) {
      const d = inventory.dimensionsIn;
      body.package_dimensions = { length: String(d.length), width: String(d.width), height: String(d.height), unit: "INCH" };
    }
    if (Array.isArray(inventory.productAttributes) && inventory.productAttributes.length) {
      body.product_attributes = inventory.productAttributes;
    }
    if (inventory.brandId) body.brand_id = String(inventory.brandId);
    return body;
  }

  /**
   * Create a product on the tenant's TikTok Shop.
   * Required: title, categoryId (leaf, from getCategories), price, imageUrl(s).
   * Optional: shopCipher and warehouseId (looked up if missing), sku,
   *   quantity, weightLb, dimensionsIn {length,width,height},
   *   productAttributes [{id, values:[{id}|{name}]}] from getCategoryAttributes.
   * dryRun defaults to TRUE like every other connector: nothing is uploaded or
   * created unless the caller passes { dryRun: false }.
   */
  async createListing(inventory, options = {}) {
    const { dryRun = true } = options;
    if (!inventory.title || !inventory.categoryId) {
      throw new TikTokShopListingError("missing_fields", "title and categoryId are required. categoryId must be a leaf category from getCategories().", { statusCode: 400 });
    }
    const imageUrls = [].concat(inventory.imageUrls || [], inventory.imageUrl || []).filter(Boolean).slice(0, 9);

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        published: false,
        payload: TikTokShopConnector.buildProductBody(inventory, imageUrls.map((_, i) => `<uploaded-uri-${i + 1}>`)),
        note: imageUrls.length ? `${imageUrls.length} image(s) would be uploaded to TikTok Shop first.` : "No image given — TikTok Shop requires at least one main image.",
      };
    }

    if (!this.hasRequiredEnv(TikTokShopConnector.ENV)) {
      throw new TikTokShopListingError("not_configured", "TIKTOK_SHOP_APP_KEY / TIKTOK_SHOP_APP_SECRET are not set.", { statusCode: 409 });
    }
    if (!imageUrls.length) {
      throw new TikTokShopListingError("missing_image", "TikTok Shop requires at least one main image.", { statusCode: 400 });
    }

    const { token } = await this._getAccessToken(inventory.tenantId);
    const shopCipher = inventory.shopCipher || (await this.getShopCipher(inventory.tenantId));
    let warehouseId = inventory.warehouseId;
    if (!warehouseId) {
      const warehouses = await this.getWarehouses(inventory.tenantId, { shopCipher });
      const pick = warehouses.find((w) => w.is_default && w.type === "SALES_WAREHOUSE") || warehouses.find((w) => w.type === "SALES_WAREHOUSE") || warehouses[0];
      if (!pick) throw new TikTokShopListingError("no_warehouse", "No warehouse found on this TikTok Shop — add one in Seller Center first.", { statusCode: 409 });
      warehouseId = pick.id;
    }

    const uris = [];
    for (const url of imageUrls) uris.push(await this._uploadImage(url, token));

    const productBody = TikTokShopConnector.buildProductBody({ ...inventory, warehouseId }, uris);
    const data = await TikTokShopConnector._call("POST", `/product/${API_VERSION}/products`, {
      accessToken: token, query: { shop_cipher: shopCipher }, json: productBody, timeoutMs: 30_000, errorCode: "product_creation_failed",
    });
    return {
      listingId: String(data.product_id),
      skuIds: (data.skus || []).map((s) => s.id),
      warnings: data.warnings || [],
      url: data.product_id ? `https://shop.tiktok.com/view/product/${data.product_id}` : null,
    };
  }
}

module.exports = { TikTokShopConnector, TikTokShopListingError, expiryToEpochMs };
