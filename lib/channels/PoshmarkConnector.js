// lib/channels/PoshmarkConnector.js
// Poshmark — Social commerce for fashion
const { BaseConnector, CONNECTION_STATUS } = require("./connector");

class PoshmarkListingError extends Error {
  constructor(code, message, { statusCode } = {}) {
    super(message);
    this.name = "PoshmarkListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
  }
}

class PoshmarkConnector extends BaseConnector {
  constructor() {
    super("poshmark");
  }

  static ENV = ["POSHMARK_API_KEY"];

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(PoshmarkConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.AWAITING_APPROVAL,
        detail: "Add POSHMARK_API_KEY to enable listings",
      };
    }

    try {
      const res = await fetch("https://api.poshmark.com/api/v1/user/profile", {
        headers: { Authorization: `Bearer ${process.env.POSHMARK_API_KEY}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "Poshmark API key invalid" };
      }

      const data = await res.json();
      return { status: CONNECTION_STATUS.CONNECTED, detail: `Connected: ${data.username}` };
    } catch (err) {
      return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: err.message };
    }
  }

  async createListing(product, { dryRun = false } = {}) {
    if (dryRun) {
      return {
        ok: true,
        would_post_to: "https://poshmark.com/my-closet",
        payload: {
          title: product.title.slice(0, 140),
          description: product.description?.slice(0, 800),
          price: product.price,
          category: product.category || "other",
          size: product.size || "one-size",
        },
      };
    }

    try {
      const res = await fetch("https://api.poshmark.com/api/v1/listings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.POSHMARK_API_KEY}`,
        },
        body: JSON.stringify({
          title: product.title.slice(0, 140),
          description: product.description?.slice(0, 800),
          price: product.price,
          category: this._mapCategory(product.category),
          size: product.size || "one-size",
          brand: product.brand || "Other",
          condition: this._mapCondition(product.condition),
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new PoshmarkListingError("api_error", err.message || res.statusText, { statusCode: res.status });
      }

      return res.json();
    } catch (err) {
      throw new PoshmarkListingError("listing_failed", err.message, { statusCode: 502 });
    }
  }

  _mapCondition(condition) {
    const map = { new: "new", "like-new": "excellent", used: "good", damaged: "fair" };
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

module.exports = { PoshmarkConnector, PoshmarkListingError };
