// lib/channels/MercariConnector.js
// Mercari — Resale marketplace API
const { BaseConnector, CONNECTION_STATUS } = require("./connector");

class MercariListingError extends Error {
  constructor(code, message, { statusCode } = {}) {
    super(message);
    this.name = "MercariListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
  }
}

class MercariConnector extends BaseConnector {
  constructor() {
    super("mercari");
  }

  static ENV = ["MERCARI_ACCESS_TOKEN", "MERCARI_USER_ID"];

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(MercariConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.AWAITING_APPROVAL,
        detail: "Connect your Mercari account to enable listings",
      };
    }

    try {
      const res = await fetch("https://api.mercari.com/v1/user", {
        headers: { Authorization: `Bearer ${process.env.MERCARI_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "Mercari token expired or invalid" };
      }

      return { status: CONNECTION_STATUS.CONNECTED, detail: "Connected to Mercari seller account" };
    } catch (err) {
      return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: err.message };
    }
  }

  async createListing(product, { dryRun = false } = {}) {
    if (dryRun) {
      return {
        ok: true,
        would_post_to: "https://mercari.com/items",
        payload: {
          title: product.title.slice(0, 60),
          description: product.description?.slice(0, 1000),
          price: product.price,
          condition: product.condition,
          category: product.category || "other",
        },
      };
    }

    try {
      const res = await fetch("https://api.mercari.com/v1/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.MERCARI_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          title: product.title.slice(0, 60),
          description: product.description?.slice(0, 1000),
          price: Math.round(product.price * 100),
          condition: this._mapCondition(product.condition),
          category_id: this._mapCategory(product.category),
          shipping_method: "unknown",
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new MercariListingError("api_error", err.error || res.statusText, { statusCode: res.status });
      }

      return res.json();
    } catch (err) {
      throw new MercariListingError("listing_failed", err.message, { statusCode: 502 });
    }
  }

  _mapCondition(condition) {
    const map = { new: 1, "like-new": 2, used: 3, damaged: 4 };
    return map[condition] || 3;
  }

  _mapCategory(category) {
    const map = { clothing: 1, electronics: 2, home: 3, books: 4 };
    return map[category?.toLowerCase()] || 14; // 14 = other
  }
}

module.exports = { MercariConnector, MercariListingError };
