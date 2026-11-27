// lib/channels/WhatnotConnector.js
// Whatnot Seller API — official REST v2.
// Docs: https://developers.whatnot.com/getting-started/introduction
// Base: https://api.whatnot.com/seller-api/rest/v2
// Auth: Authorization: Bearer <WHATNOT_API_TOKEN>  (personal access tokens
// start with wn_pat_tk_). Never log the token or Authorization header.
const crypto = require("crypto");
const { BaseConnector, CONNECTION_STATUS } = require("./connector");

const API_BASE = "https://api.whatnot.com/seller-api/rest/v2";

class WhatnotListingError extends Error {
  constructor(code, message, { statusCode, step } = {}) {
    super(message);
    this.name = "WhatnotListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
    this.step = step;
  }
}

function apiErrorMessage(json, fallback) {
  if (!json || typeof json !== "object") return fallback;
  const detail = json.detail || json.title || json.message || json.error;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  return fallback;
}

function toMoney(price, currency) {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return { amount: amount.toFixed(2), currency: currency || "USD" };
}

function collectImageUrls(product) {
  if (Array.isArray(product?.media)) {
    return product.media
      .map((m) => (typeof m === "string" ? m : m?.url))
      .filter(Boolean);
  }
  const raw = product?.image_urls || product?.images || product?.imageUrls || [];
  if (typeof raw === "string") return raw ? [raw] : [];
  return Array.isArray(raw) ? raw.filter(Boolean) : [];
}

function buildDimensionProfile(product) {
  if (product?.dimension_profile && typeof product.dimension_profile === "object") {
    return product.dimension_profile;
  }
  const weight = product?.weight;
  const dimensions = product?.dimensions;
  if (!weight && !dimensions) return null;
  const profile = {};
  if (weight && typeof weight === "object") profile.weight = weight;
  else if (weight != null) {
    profile.weight = { value: Number(weight), unit: product.weight_unit || "ounce" };
  }
  if (dimensions && typeof dimensions === "object") profile.dimensions = dimensions;
  return profile.weight || profile.dimensions ? profile : null;
}

function categoryIdOf(product) {
  if (product?.category_id != null) return String(product.category_id);
  if (product?.category && typeof product.category === "object" && product.category.id != null) {
    return String(product.category.id);
  }
  if (typeof product?.category === "string" && /^\d+$/.test(product.category)) {
    return product.category;
  }
  return null;
}

class WhatnotConnector extends BaseConnector {
  constructor() {
    super("whatnot");
  }

  static ENV = ["WHATNOT_API_TOKEN"];
  static API_BASE = API_BASE;

  token() {
    return process.env.WHATNOT_API_TOKEN;
  }

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(WhatnotConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.NOT_CONNECTED,
        detail: "Optional — not configured. In Seller Hub → Seller API, generate a personal access token (it starts with wn_pat_tk_) and set WHATNOT_API_TOKEN. Docs: https://developers.whatnot.com/getting-started/authentication",
      };
    }
    return {
      status: CONNECTION_STATUS.CONFIG_REQUIRED,
      detail: "Credentials present — run Test Connection to verify (never assumed connected without a live test).",
    };
  }

  /** Live check: GET /users/me. The only path that may report "connected". */
  async testConnection() {
    if (!this.hasRequiredEnv(WhatnotConnector.ENV)) {
      return { status: CONNECTION_STATUS.NOT_CONNECTED, detail: "WHATNOT_API_TOKEN is not set." };
    }
    try {
      const { res, json } = await this.request("GET", "/users/me", { timeout: 10_000 });
      if (res.ok && json?.username) {
        const name = json.display_name ? ` (${json.display_name})` : "";
        const live = json.can_go_live === true ? ", approved to go live" : "";
        return {
          status: CONNECTION_STATUS.CONNECTED,
          detail: `Connected as @${json.username}${name}${live}.`,
        };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          status: CONNECTION_STATUS.CONFIG_REQUIRED,
          detail: `Whatnot rejected the token (HTTP ${res.status}): ${apiErrorMessage(json, "unauthenticated")}`,
        };
      }
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: `Whatnot /users/me failed (HTTP ${res.status}): ${apiErrorMessage(json, "unexpected response")}`,
      };
    } catch (err) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: err.name === "TimeoutError" ? "Whatnot did not respond within 10s" : `Whatnot request failed: ${err.message}`,
      };
    }
  }

  async authenticate() {
    const result = await this.testConnection();
    return { connected: result.status === CONNECTION_STATUS.CONNECTED, detail: result.detail };
  }

  /**
   * Official REST v2 listing flow:
   *   POST /products
   *   GET  /products/{id}/variants
   *   PATCH /products/{id}/variants   (price, optional sku/media)
   *   POST /inventory/set
   *   POST /merchandising/products/{id}
   *
   * @param {object} product title, description, price, quantity, sku,
   *   category_id (or category.id), dimension_profile (or weight/dimensions),
   *   image_urls, attributes, options, currency, transaction_type
   *   ("buy_it_now" | "auction"), reserve_for_live, show_ids.
   * @param {object} [options]
   * @param {boolean} [options.dryRun=true]
   * @param {string} [options.confirm] Must be exactly "PUBLISH_LIVE" for a
   *   live publish; ignored for dry runs.
   */
  async createListing(product, options = {}) {
    const { dryRun = true, confirm } = options;
    if (!product?.title) {
      throw new WhatnotListingError("missing_fields", "product.title is required", { statusCode: 400 });
    }

    const categoryId = categoryIdOf(product);
    const dimensionProfile = buildDimensionProfile(product);
    const currency = product.currency || "USD";
    const money = toMoney(product.price, currency);
    const quantity = product.quantity == null ? 1 : Number(product.quantity);
    const imageUrls = collectImageUrls(product);
    const transactionType = product.transaction_type === "auction" ? "auction" : "buy_it_now";
    const reserveForLive = product.reserve_for_live === true;
    const createBody = {
      title: product.title,
      description: product.description || undefined,
      category: categoryId ? { id: categoryId } : undefined,
      dimension_profile: dimensionProfile || undefined,
      external_id: product.sku || product.external_id || undefined,
      media: imageUrls.length ? imageUrls.map((url, i) => ({ url, alt: i === 0 ? "main" : `image-${i + 1}` })) : undefined,
      attributes: Array.isArray(product.attributes) ? product.attributes : undefined,
      options: Array.isArray(product.options) ? product.options : undefined,
    };

    const planned = {
      create: { method: "POST", path: "/products", body: createBody },
      price: money,
      quantity,
      transaction_type: transactionType,
      reserve_for_live: reserveForLive,
      show_ids: product.show_ids || undefined,
    };

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        published: false,
        payload: planned,
        would_call: [
          `POST ${API_BASE}/products`,
          `GET ${API_BASE}/products/{id}/variants`,
          `PATCH ${API_BASE}/products/{id}/variants`,
          `POST ${API_BASE}/inventory/set`,
          `POST ${API_BASE}/merchandising/products/{id}`,
          'Live publish only with confirm: "PUBLISH_LIVE"',
        ],
      };
    }

    if (!this.hasRequiredEnv(WhatnotConnector.ENV)) {
      throw new WhatnotListingError("whatnot_not_configured", "WHATNOT_API_TOKEN must be set.", { statusCode: 409 });
    }
    if (confirm !== "PUBLISH_LIVE") {
      return { ok: true, dry_run: false, published: false, note: 'Live call skipped — pass confirm: "PUBLISH_LIVE" to actually create the listing.', payload: planned };
    }
    if (!categoryId) {
      throw new WhatnotListingError("missing_fields", "product.category_id is required to publish a Whatnot listing (see https://developers.whatnot.com/taxonomy).", { statusCode: 400, step: "validate" });
    }
    if (!dimensionProfile) {
      throw new WhatnotListingError("missing_fields", "product.dimension_profile (or weight/dimensions) is required to publish a Whatnot listing.", { statusCode: 400, step: "validate" });
    }
    if (!money) {
      throw new WhatnotListingError("missing_fields", "product.price is required to publish a Whatnot listing.", { statusCode: 400, step: "validate" });
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new WhatnotListingError("missing_fields", "product.quantity must be a non-negative number.", { statusCode: 400, step: "validate" });
    }

    const created = await this.request("POST", "/products", { body: createBody, ok: [201], step: "create_product" });
    const productId = created.json?.id;
    if (!productId) {
      throw new WhatnotListingError("listing_failed", "Whatnot created a product but returned no id.", { statusCode: 502, step: "create_product" });
    }

    const variantsPage = await this.request("GET", `/products/${productId}/variants?limit=50`, { ok: [200], step: "list_variants" });
    const variants = Array.isArray(variantsPage.json?.data) ? variantsPage.json.data : [];
    if (!variants.length) {
      throw new WhatnotListingError("listing_failed", "Whatnot created the product but returned no variants to price.", { statusCode: 502, step: "list_variants" });
    }

    const variantPatches = variants.map((v, i) => {
      const patch = { id: v.id, price: money };
      if (product.sku && i === 0) patch.sku = product.sku;
      if (imageUrls[0] && i === 0) patch.media = [{ url: imageUrls[0], alt: "main" }];
      return patch;
    });
    for (let i = 0; i < variantPatches.length; i += 10) {
      await this.request("PATCH", `/products/${productId}/variants`, {
        body: { variants: variantPatches.slice(i, i + 10) },
        ok: [200, 207],
        step: "price_variants",
      });
    }

    const inventoryItems = variants.map((v) => ({
      variant_id: v.id,
      quantity,
      idempotency_key: crypto.randomUUID(),
    }));
    for (let i = 0; i < inventoryItems.length; i += 10) {
      const inv = await this.request("POST", "/inventory/set", {
        body: { items: inventoryItems.slice(i, i + 10) },
        ok: [200, 207],
        step: "set_inventory",
      });
      const results = inv.json?.results;
      if (Array.isArray(results) && results.some((r) => r && r.error && r.error !== "already_applied")) {
        throw new WhatnotListingError("inventory_failed", "Whatnot rejected one or more inventory updates.", { statusCode: 502, step: "set_inventory" });
      }
    }

    const merchBody = { transaction_type: transactionType };
    if (product.reserve_for_live != null) merchBody.reserve_for_live = reserveForLive;
    if (Array.isArray(product.show_ids) && product.show_ids.length) {
      merchBody.shows = { show_ids: product.show_ids, strategy: "ADD" };
    }
    const merch = await this.request("POST", `/merchandising/products/${productId}`, {
      body: merchBody,
      ok: [200],
      step: "merchandise",
    });

    return {
      ok: true,
      dry_run: false,
      published: true,
      listingId: productId,
      url: created.json?.url || null,
      transaction_type: merch.json?.transaction_type || transactionType,
      reserved_for_live: merch.json?.reserved_for_live,
    };
  }

  /**
   * Set available quantity on variants (absolute). `items` is
   * [{ variant_id, quantity }] — an idempotency key is added per item.
   */
  async syncInventory(items = []) {
    if (!this.hasRequiredEnv(WhatnotConnector.ENV)) {
      throw new WhatnotListingError("whatnot_not_configured", "WHATNOT_API_TOKEN must be set.", { statusCode: 409 });
    }
    if (!Array.isArray(items) || !items.length) {
      throw new WhatnotListingError("missing_fields", "items[] with variant_id and quantity is required", { statusCode: 400 });
    }
    const payload = items.map((item) => ({
      variant_id: item.variant_id,
      quantity: Number(item.quantity),
      idempotency_key: item.idempotency_key || crypto.randomUUID(),
    }));
    const results = [];
    for (let i = 0; i < payload.length; i += 10) {
      const inv = await this.request("POST", "/inventory/set", {
        body: { items: payload.slice(i, i + 10) },
        ok: [200, 207],
        step: "set_inventory",
      });
      if (Array.isArray(inv.json?.results)) results.push(...inv.json.results);
    }
    return { ok: true, results };
  }

  /**
   * Authenticated request. Never logs the token or Authorization header.
   * @param {string} method
   * @param {string} path
   * @param {{ body?: object, timeout?: number, ok?: number[], step?: string }} [opts]
   */
  async request(method, path, { body, timeout = 30_000, ok, step } = {}) {
    const token = this.token();
    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      if (ok) {
        throw new WhatnotListingError(
          "request_failed",
          err.name === "TimeoutError" ? `Whatnot did not respond within ${Math.round(timeout / 1000)}s` : `Whatnot request failed: ${err.message}`,
          { statusCode: 502, step },
        );
      }
      throw err;
    }
    const json = await res.json().catch(() => null);
    if (ok && !ok.includes(res.status)) {
      throw new WhatnotListingError(
        "listing_failed",
        `Whatnot ${step || path} failed (HTTP ${res.status}): ${apiErrorMessage(json, "unexpected response")}`,
        { statusCode: res.status, step },
      );
    }
    return { res, json };
  }
}

module.exports = { WhatnotConnector, WhatnotListingError };
