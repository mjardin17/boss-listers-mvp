// lib/channels/apiConnectors.js — Whatnot connector
// Whatnot Seller API (GraphQL, Developer Preview/waitlist)
const { BaseConnector, CONNECTION_STATUS } = require("./connector");

class WhatnotListingError extends Error {
  constructor(code, message, { statusCode } = {}) {
    super(message);
    this.name = "WhatnotListingError";
    this.code = code;
    this.statusCode = statusCode || 502;
  }
}

class WhatnotConnector extends BaseConnector {
  constructor() {
    super("whatnot");
    this.gql = process.env.WHATNOT_GRAPHQL_URL || 'https://api.stage.whatnot.com/seller-api/graphql';
  }

  static ENV = ["WHATNOT_API_KEY"];

  async getConnectionStatus() {
    if (!this.hasRequiredEnv(WhatnotConnector.ENV)) {
      return {
        status: CONNECTION_STATUS.AWAITING_APPROVAL,
        detail: "Whatnot Seller API is in Developer Preview — not accepting new applicants yet. https://developers.whatnot.com",
      };
    }
    return { status: CONNECTION_STATUS.CONNECTED, detail: "Whatnot API key configured (preview access required)" };
  }

  async createListing(product, { dryRun = false } = {}) {
    if (dryRun) {
      return {
        ok: true,
        would_post_to: "https://whatnot.com/seller/listings",
        payload: {
          title: product.title,
          description: product.description,
          price: product.price,
          condition: product.condition,
          sku: product.sku,
        },
      };
    }

    const query = `mutation createListing($input: CreateListingInput!) {
      createListing(input: $input) { id productId status }
    }`;

    try {
      const res = await fetch(this.gql, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.WHATNOT_API_KEY}`,
        },
        body: JSON.stringify({
          query,
          variables: {
            input: {
              title: product.title,
              description: product.description,
              price: product.price,
              condition: product.condition,
              sku: product.sku,
            },
          },
        }),
      });

      if (!res.ok) {
        throw new WhatnotListingError("graphql_error", `Whatnot API error ${res.status}`, { statusCode: res.status });
      }

      return res.json();
    } catch (err) {
      throw new WhatnotListingError("listing_failed", err.message, { statusCode: 502 });
    }
  }
}

module.exports = { WhatnotConnector, WhatnotListingError };
