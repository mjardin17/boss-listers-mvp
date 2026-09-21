// lib/channels/TwitterCommerceConnector.js
// Twitter Commerce — Social selling via tweets
const { BaseConnector, CONNECTION_STATUS } = require("./connector");

class TwitterCommerceListingError extends Error {
  constructor(code, message, { statusCode } = {}) {
    super(message);
    this.name = "TwitterCommerceListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
  }
}

class TwitterCommerceConnector extends BaseConnector {
  constructor() {
    super("twitter_commerce");
  }

  static ENV = ["TWITTER_API_KEY", "TWITTER_API_SECRET", "TWITTER_ACCESS_TOKEN"];

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(TwitterCommerceConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.AWAITING_APPROVAL,
        detail: "Connect Twitter Developer account for commerce tweets",
      };
    }

    try {
      const res = await fetch("https://api.twitter.com/2/users/me", {
        headers: { Authorization: `Bearer ${process.env.TWITTER_ACCESS_TOKEN}` },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: "Twitter token invalid or expired" };
      }

      const data = await res.json();
      return { status: CONNECTION_STATUS.CONNECTED, detail: `Connected: @${data.data.username}` };
    } catch (err) {
      return { status: CONNECTION_STATUS.CONFIG_REQUIRED, detail: err.message };
    }
  }

  async createListing(product, { dryRun = false } = {}) {
    if (dryRun) {
      const caption = this._buildCaption(product);
      return {
        ok: true,
        would_post_to: "https://twitter.com/home",
        payload: {
          text: caption.slice(0, 280),
          price: product.price,
          url: product.image_url,
        },
      };
    }

    try {
      const caption = this._buildCaption(product);
      const res = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.TWITTER_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          text: caption.slice(0, 280),
          reply_settings: "public",
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new TwitterCommerceListingError("api_error", err.detail || res.statusText, { statusCode: res.status });
      }

      return res.json();
    } catch (err) {
      throw new TwitterCommerceListingError("listing_failed", err.message, { statusCode: 502 });
    }
  }

  _buildCaption(product) {
    return `🛍️ ${product.title.slice(0, 100)} - $${product.price}\n\n${product.description?.slice(0, 100) || "Check it out!"}\n\n#ShopNow #Commerce`;
  }
}

module.exports = { TwitterCommerceConnector, TwitterCommerceListingError };
