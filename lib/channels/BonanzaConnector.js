// lib/channels/BonanzaConnector.js
// Bonanza "Bonapitit" API — envelope-style, not a per-resource REST API.
// Docs: https://api.bonanza.com/docs
//
// Endpoints:
//   POST https://api.bonanza.com/api_requests/standard_request  (no user token)
//   POST https://api.bonanza.com/api_requests/secure_request    (dev + cert)
// Headers:
//   X-BONANZLE-API-DEV-NAME  = BONANZA_DEV_ID
//   X-BONANZLE-API-CERT-NAME = BONANZA_CERT_ID  (secure calls; also sent on
//     standard calls, matching official examples)
// Body: JSON { "<method>Request": { ...input } }
// Success is top-level ack === "Success".
//
// Credentials:
//   BONANZA_DEV_ID / BONANZA_CERT_ID — developer keys, from the approved
//     Bonapitit application.
//   BONANZA_ACCESS_TOKEN — the seller's bonanzleAuthToken from fetchToken(),
//     usable only after the seller approves at authenticationURL. Goes in
//     the body as requesterCredentials.bonanzleAuthToken, never as a header.
// Never log tokens, cert/dev IDs, or these headers.
const { BaseConnector, CONNECTION_STATUS } = require("./connector");

const STANDARD_URL = "https://api.bonanza.com/api_requests/standard_request";
const SECURE_URL = "https://api.bonanza.com/api_requests/secure_request";

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

function requestNameOf(methodName) {
  return methodName.endsWith("Request") ? methodName : `${methodName}Request`;
}

function responseNameOf(methodName) {
  const base = methodName.endsWith("Request")
    ? methodName.slice(0, -"Request".length)
    : methodName;
  return `${base}Response`;
}

/** Pull a human-readable error string from a Bonapitit body. Never returns secrets. */
function formatBonanzaError(json, fallback) {
  if (!json || typeof json !== "object") return fallback;
  const raw = json.errorMessage;
  const errors = raw?.error || raw;
  const list = Array.isArray(errors) ? errors : errors ? [errors] : [];
  const messages = list
    .map((e) => {
      if (typeof e === "string") return e.trim();
      if (e && typeof e === "object") return String(e.message || e.type || "").trim();
      return "";
    })
    .filter(Boolean);
  if (messages.length) return messages.join("; ");
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof json.ack === "string" && json.ack !== "Success") {
    return `ack=${json.ack}`;
  }
  return fallback;
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

function buildItemPayload(listing) {
  const imageUrls = collectImageUrls(listing).slice(0, 4);
  const price = Number(listing.price ?? 0);
  const quantity = listing.quantity == null ? 1 : Number(listing.quantity);
  const categoryId = listing.category_id ?? listing.categoryId ?? listing.primaryCategory?.categoryId;
  const freeShipping = !!listing.free_shipping || listing.shippingType === "Free";
  const shippingCost = listing.shipping_cost == null ? 0 : Number(listing.shipping_cost);
  const condition = listing.condition || "new";

  const item = {
    title: listing.title,
    description: listing.description || "",
    price,
    quantity,
    allowForSale: true,
  };

  if (listing.sku) item.sku = listing.sku;
  if (listing.externalProductId || listing.sku) {
    item.externalProductId = listing.externalProductId || listing.sku;
  }
  if (categoryId != null && categoryId !== "") {
    item.primaryCategory = { categoryId: Number(categoryId) || categoryId };
  }
  if (condition) {
    item.itemSpecifics = { specifics: [["condition", String(condition)]] };
  }
  if (imageUrls.length) {
    item.pictureDetails = { pictureURL: imageUrls };
  }
  item.shippingDetails = {
    shippingServiceOptions: {
      shippingType: freeShipping ? "Free" : "Fixed",
      shippingServiceCost: freeShipping ? 0 : shippingCost,
    },
  };
  if (listing.ships_within_days != null) {
    item.shippingDetails.shipsWithinDays = Number(listing.ships_within_days);
  }
  if (listing.returns_accepted != null) {
    item.returnPolicy = {
      returnsAcceptedOption: listing.returns_accepted ? "ReturnsAccepted" : "ReturnsNotAccepted",
    };
  }
  return item;
}

class BonanzaConnector extends BaseConnector {
  constructor() {
    super("bonanza");
  }

  /** App (developer) credentials — enough to probe the API. */
  static ENV = ["BONANZA_DEV_ID", "BONANZA_CERT_ID"];

  /** Required to actually list on a seller's booth. */
  static LISTING_ENV = ["BONANZA_DEV_ID", "BONANZA_CERT_ID", "BONANZA_ACCESS_TOKEN"];

  static STANDARD_URL = STANDARD_URL;
  static SECURE_URL = SECURE_URL;

  hasListingEnv() {
    return this.hasRequiredEnv(BonanzaConnector.LISTING_ENV);
  }

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(BonanzaConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.NOT_CONNECTED,
        detail: "Optional — not configured. Set BONANZA_DEV_ID and BONANZA_CERT_ID from the approved Bonapitit app, then fetchToken and have the seller approve at authenticationURL to set BONANZA_ACCESS_TOKEN. Docs: https://api.bonanza.com/docs",
      };
    }
    if (!this.hasListingEnv()) {
      return {
        status: CONNECTION_STATUS.AWAITING_APPROVAL,
        detail: "Dev/cert ID present, but BONANZA_ACCESS_TOKEN is missing — call fetchToken and approve access at the returned authenticationURL.",
      };
    }
    return {
      status: CONNECTION_STATUS.CONFIG_REQUIRED,
      detail: "Credentials present — run Test Connection to verify (never assumed connected without a live test).",
    };
  }

  /**
   * Live credentials check: getCategories (standard_request, no user token).
   * Proves the developer keys work. A saved but unapproved user token is
   * reported as awaiting_approval — we do not claim "connected" until the
   * seller has a token on file and (for listing) has approved it.
   */
  async testConnection() {
    if (!this.hasRequiredEnv(BonanzaConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.NOT_CONNECTED,
        detail: "BONANZA_DEV_ID and BONANZA_CERT_ID are both required.",
      };
    }
    try {
      const { res, json } = await this.request("getCategories", {
        secure: false,
        body: { categoryParent: 0 },
        timeout: 10_000,
        step: "getCategories",
      });
      const response = json?.getCategoriesResponse;
      const categories = response?.categoryArray;
      const count = Array.isArray(categories) ? categories.length : 0;
      const ack = json?.ack;
      const error = formatBonanzaError(json, null);

      if (res.ok && ack === "Success" && count >= 0 && !error) {
        if (!this.hasListingEnv()) {
          return {
            status: CONNECTION_STATUS.AWAITING_APPROVAL,
            detail: `Bonanza dev/cert accepted (getCategories ack=${ack}, ${count} top-level categories). Next: fetch a user token and approve it at the authentication URL so listings can be posted.`,
            ack,
            categoryCount: count,
          };
        }
        return {
          status: CONNECTION_STATUS.AWAITING_APPROVAL,
          detail: `Bonanza dev/cert accepted (getCategories ack=${ack}, ${count} top-level categories). User token is saved — open the Bonanza authorization URL if you have not already approved listing access.`,
          ack,
          categoryCount: count,
        };
      }
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: `Bonanza getCategories failed: ${error || `HTTP ${res.status}`}${ack ? ` (ack=${ack})` : ""}`,
        ack: ack || null,
      };
    } catch (err) {
      return {
        status: CONNECTION_STATUS.CONFIG_REQUIRED,
        detail: err.name === "TimeoutError"
          ? "Bonanza did not respond within 10s"
          : `Bonanza request failed: ${err.message}`,
      };
    }
  }

  async authenticate() {
    const result = await this.testConnection();
    return { connected: result.status === CONNECTION_STATUS.CONNECTED, detail: result.detail };
  }

  /**
   * Request a seller user token. The returned authToken is not usable until
   * the seller visits authenticationURL and approves access. The caller
   * should save authToken privately as BONANZA_ACCESS_TOKEN and show only
   * the URL (the URL is not a secret; the token is).
   *
   * @param {{ validationCompleteURL?: string }} [opts]
   * @returns {Promise<{ ok: true, authToken: string, authenticationURL: string, hardExpirationTime: string|null, ack: string }>}
   */
  async fetchToken(opts = {}) {
    if (!this.hasRequiredEnv(BonanzaConnector.ENV)) {
      throw new BonanzaListingError(
        "bonanza_not_configured",
        "BONANZA_DEV_ID and BONANZA_CERT_ID must be set before fetchToken.",
        { statusCode: 409, step: "fetchToken" },
      );
    }
    const body = {};
    if (opts.validationCompleteURL) body.validationCompleteURL = opts.validationCompleteURL;

    const { res, json } = await this.request("fetchToken", {
      secure: true,
      body,
      timeout: 15_000,
      step: "fetchToken",
    });
    const response = json?.fetchTokenResponse;
    const ack = json?.ack;
    const error = formatBonanzaError(json, null);
    if (!res.ok || ack !== "Success" || !response?.authToken || !response?.authenticationURL) {
      throw new BonanzaListingError(
        "fetch_token_failed",
        `Bonanza fetchToken failed: ${error || `HTTP ${res.status}`}${ack ? ` (ack=${ack})` : ""}`,
        { statusCode: res.ok ? 502 : res.status, step: "fetchToken" },
      );
    }
    return {
      ok: true,
      authToken: response.authToken,
      authenticationURL: response.authenticationURL,
      hardExpirationTime: response.hardExpirationTime || null,
      ack,
    };
  }

  /**
   * Create a booth listing via addFixedPriceItem.
   * Live publish requires confirm: "PUBLISH_LIVE" and a verified user token.
   *
   * @param {object} listing title (required), description, price, quantity,
   *   sku, category_id, condition, image_urls, ships_within_days,
   *   shipping_cost, free_shipping, returns_accepted.
   * @param {object} [options]
   * @param {boolean} [options.dryRun=true]
   * @param {string} [options.confirm] Must be exactly "PUBLISH_LIVE" for a
   *   live publish; ignored for dry runs.
   */
  async createListing(listing, options = {}) {
    const { dryRun = true, confirm } = options;

    if (!listing?.title) {
      throw new BonanzaListingError("missing_fields", "listing.title is required", { statusCode: 400 });
    }

    const item = buildItemPayload(listing);

    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        published: false,
        payload: { addFixedPriceItemRequest: { item } },
        would_call: [`POST ${SECURE_URL} (addFixedPriceItemRequest, only with confirm: "PUBLISH_LIVE")`],
      };
    }

    if (!this.hasListingEnv()) {
      throw new BonanzaListingError(
        "bonanza_not_configured",
        "BONANZA_DEV_ID, BONANZA_CERT_ID, and BONANZA_ACCESS_TOKEN must all be set, and the seller must have approved the token.",
        { statusCode: 409 },
      );
    }
    if (confirm !== "PUBLISH_LIVE") {
      return {
        ok: true,
        dry_run: false,
        published: false,
        note: 'Live call skipped — pass confirm: "PUBLISH_LIVE" to actually create the listing.',
      };
    }

    let res;
    let json;
    try {
      ({ res, json } = await this.request("addFixedPriceItem", {
        secure: true,
        body: {
          requesterCredentials: { bonanzleAuthToken: process.env.BONANZA_ACCESS_TOKEN },
          item,
        },
        timeout: 30_000,
        step: "add_item",
      }));
    } catch (err) {
      throw new BonanzaListingError(
        "request_failed",
        err.name === "TimeoutError"
          ? "Bonanza did not respond within 30s"
          : `Bonanza listing request failed: ${err.message}`,
        { statusCode: 502, step: "add_item" },
      );
    }

    const response = json?.addFixedPriceItemResponse;
    const ack = json?.ack;
    const error = formatBonanzaError(json, null);
    const queued = json?.success === true && /queued/i.test(String(json?.resultMessage || ""));
    if (queued) {
      return {
        ok: true,
        dry_run: false,
        published: true,
        queued: true,
        listingId: null,
        url: null,
        message: json.resultMessage,
        ack: ack || null,
      };
    }
    if (!res.ok || ack !== "Success" || error || !response?.itemId) {
      throw new BonanzaListingError(
        "listing_failed",
        `Bonanza listing failed: ${error || `HTTP ${res.status}`}${ack ? ` (ack=${ack})` : ""}`,
        { statusCode: res.ok ? 502 : res.status, step: "add_item" },
      );
    }

    return {
      ok: true,
      dry_run: false,
      published: true,
      listingId: response.itemId,
      sellingState: response.sellingState || null,
      categoryId: response.categoryId || null,
      url: response.viewItemURL || null,
      message: response.message || null,
      ack,
    };
  }

  /**
   * Authenticated/unauthenticated Bonapitit request.
   * Never logs credentials, tokens, or API headers.
   *
   * @param {string} methodName e.g. "getCategories" or "fetchTokenRequest"
   * @param {{ body?: object, secure?: boolean, timeout?: number, step?: string }} [opts]
   */
  async request(methodName, { body = {}, secure = false, timeout = 15_000, step } = {}) {
    const name = requestNameOf(methodName);
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "X-BONANZLE-API-DEV-NAME": process.env.BONANZA_DEV_ID,
    };
    if (secure) {
      headers["X-BONANZLE-API-CERT-NAME"] = process.env.BONANZA_CERT_ID;
    }
    let res;
    try {
      res = await fetch(secure ? SECURE_URL : STANDARD_URL, {
        method: "POST",
        headers,
        body: JSON.stringify({ [name]: body || {} }),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (err) {
      throw err;
    }
    const json = await res.json().catch(() => null);
    return { res, json, response: json?.[responseNameOf(methodName)] ?? null };
  }
}

module.exports = { BonanzaConnector, BonanzaListingError };
