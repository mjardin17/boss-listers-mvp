// lib/channels/PinterestShopConnector.js
// Pinterest Shop — Visual discovery shopping
const { BaseConnector, CONNECTION_STATUS } = require("./connector");

class PinterestShopListingError extends Error {
  constructor(code, message, { statusCode } = {}) {
    super(message);
    this.name = "PinterestShopListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
  }
}

class PinterestShopConnector extends BaseConnector {
  constructor() {
    super("pinterest_shop");
  }

  static ENV = ["PINTEREST_ACCESS_TOKEN", "PINTEREST_BUSINESS_ID"];

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(PinterestShopConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.AWAITING_APPROVAL,
        detail: "Connect Pinterest Business account for shopping pins",
      };
    }

    try {
      const res = await fetch("https://api.pinterest.com/v5/user_account", {
        headers: { Authorization: `Bearer ${process.env.PINTEREST_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "Pinterest token invalid or expired" };
      }

      return { status: CONNECTION_STATUS.CONNECTED, detail: "Connected to Pinterest Shop" };
    } catch (err) {
      return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: err.message };
    }
  }

  async createListing(product, { dryRun = false } = {}) {
    if (dryRun) {
      return {
        ok: true,
        would_post_to: "https://pinterest.com/business",
        payload: {
          title: product.title.slice(0, 120),
          description: product.description?.slice(0, 1000),
          price: product.price,
          image_url: product.image_url,
        },
      };
    }

    try {
      const res = await fetch("https://api.pinterest.com/v5/pins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PINTEREST_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          title: product.title.slice(0, 120),
          description: product.description?.slice(0, 1000),
          link: product.url || "https://shop.example.com",
          image_url: product.image_url,
          board_id: process.env.PINTEREST_BOARD_ID || "default",
          rich_metadata: {
            price: product.price,
            currency: "USD",
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new PinterestShopListingError("api_error", err.message || res.statusText, { statusCode: res.status });
      }

      return res.json();
    } catch (err) {
      throw new PinterestShopListingError("listing_failed", err.message, { statusCode: 502 });
    }
  }
}

module.exports = { PinterestShopConnector, PinterestShopListingError };
