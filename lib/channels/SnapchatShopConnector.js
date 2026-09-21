// lib/channels/SnapchatShopConnector.js
// Snapchat Shop — Live & trending commerce
const { BaseConnector, CONNECTION_STATUS } = require("./connector");

class SnapchatShopListingError extends Error {
  constructor(code, message, { statusCode } = {}) {
    super(message);
    this.name = "SnapchatShopListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
  }
}

class SnapchatShopConnector extends BaseConnector {
  constructor() {
    super("snapchat_shop");
  }

  static ENV = ["SNAPCHAT_ACCESS_TOKEN", "SNAPCHAT_BUSINESS_ID"];

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(SnapchatShopConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.AWAITING_APPROVAL,
        detail: "Connect Snapchat Business account for Shop access",
      };
    }

    try {
      const res = await fetch(`https://api.snapchat.com/v1/me/businesses/${process.env.SNAPCHAT_BUSINESS_ID}`, {
        headers: { Authorization: `Bearer ${process.env.SNAPCHAT_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "Snapchat token invalid or expired" };
      }

      return { status: CONNECTION_STATUS.CONNECTED, detail: "Connected to Snapchat Shop" };
    } catch (err) {
      return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: err.message };
    }
  }

  async createListing(product, { dryRun = false } = {}) {
    if (dryRun) {
      return {
        ok: true,
        would_post_to: "https://shop.snapchat.com/seller",
        payload: {
          title: product.title.slice(0, 150),
          description: product.description?.slice(0, 1500),
          price: product.price,
          category: product.category || "other",
        },
      };
    }

    try {
      const res = await fetch("https://api.snapchat.com/v1/catalogs/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SNAPCHAT_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          name: product.title.slice(0, 150),
          description: product.description?.slice(0, 1500),
          price: Math.round(product.price * 100),
          currency: "USD",
          category: this._mapCategory(product.category),
          url: product.image_url,
          condition: this._mapCondition(product.condition),
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new SnapchatShopListingError("api_error", err.error?.message || res.statusText, { statusCode: res.status });
      }

      return res.json();
    } catch (err) {
      throw new SnapchatShopListingError("listing_failed", err.message, { statusCode: 502 });
    }
  }

  _mapCategory(category) {
    const map = {
      clothing: "apparel",
      shoes: "footwear",
      accessories: "accessories",
      electronics: "electronics",
      home: "home",
    };
    return map[category?.toLowerCase()] || "other";
  }

  _mapCondition(condition) {
    const map = { new: "new", "like-new": "refurbished", used: "used", damaged: "used" };
    return map[condition] || "used";
  }
}

module.exports = { SnapchatShopConnector, SnapchatShopListingError };
