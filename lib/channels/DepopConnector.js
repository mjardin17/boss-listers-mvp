// lib/channels/DepopConnector.js
// Depop — Mobile-first fashion resale
const { BaseConnector, CONNECTION_STATUS } = require("./connector");

class DepopListingError extends Error {
  constructor(code, message, { statusCode } = {}) {
    super(message);
    this.name = "DepopListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
  }
}

class DepopConnector extends BaseConnector {
  constructor() {
    super("depop");
  }

  static ENV = ["DEPOP_ACCESS_TOKEN", "DEPOP_SELLER_ID"];

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(DepopConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.AWAITING_APPROVAL,
        detail: "Connect your Depop account via OAuth",
      };
    }

    try {
      const res = await fetch("https://api.depop.com/api/v2/user/profile", {
        headers: { Authorization: `Bearer ${process.env.DEPOP_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "Depop token expired or invalid" };
      }

      return { status: CONNECTION_STATUS.CONNECTED, detail: "Connected to Depop seller account" };
    } catch (err) {
      return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: err.message };
    }
  }

  async createListing(product, { dryRun = false } = {}) {
    if (dryRun) {
      return {
        ok: true,
        would_post_to: "https://depop.com/selling",
        payload: {
          title: product.title.slice(0, 120),
          description: product.description?.slice(0, 1000),
          price: product.price,
          size: product.size || "one-size",
          category: product.category || "other",
        },
      };
    }

    try {
      const res = await fetch("https://api.depop.com/api/v2/listings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEPOP_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          title: product.title.slice(0, 120),
          description: product.description?.slice(0, 1000),
          price_cents: Math.round(product.price * 100),
          size: product.size || "one-size",
          category_id: this._mapCategory(product.category),
          condition: this._mapCondition(product.condition),
          brand: product.brand || "unbranded",
          color: product.color || "multicolor",
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new DepopListingError("api_error", err.error || res.statusText, { statusCode: res.status });
      }

      return res.json();
    } catch (err) {
      throw new DepopListingError("listing_failed", err.message, { statusCode: 502 });
    }
  }

  _mapCondition(condition) {
    const map = { new: "new", "like-new": "excellent", used: "good", damaged: "acceptable" };
    return map[condition] || "good";
  }

  _mapCategory(category) {
    const map = {
      clothing: "women_clothing",
      shoes: "women_shoes",
      accessories: "women_accessories",
      bags: "women_bags",
      jewelry: "women_jewelry",
    };
    return map[category?.toLowerCase()] || "women_clothing";
  }
}

module.exports = { DepopConnector, DepopListingError };
