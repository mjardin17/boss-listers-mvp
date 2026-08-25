import type { CrossListPlatform } from "./types";

export const PLATFORM_RULES: Record<
  CrossListPlatform,
  {
    displayName: string;
    titleLimit: number;
    tone: string;
    requiresBrand: boolean;
    conditionLanguage: string;
  }
> = {
  ebay: {
    displayName: "eBay",
    titleLimit: 80,
    tone: "search-focused resale",
    requiresBrand: false,
    conditionLanguage: "Include exact condition and return policy language."
  },
  amazon: {
    displayName: "Amazon",
    titleLimit: 150,
    tone: "structured catalog",
    requiresBrand: true,
    conditionLanguage: "Use structured bullets and accurate brand/category details."
  },
  walmart: {
    displayName: "Walmart",
    titleLimit: 75,
    tone: "clean retail",
    requiresBrand: true,
    conditionLanguage: "Avoid excessive punctuation and unsupported claims."
  },
  mercari: {
    displayName: "Mercari",
    titleLimit: 80,
    tone: "short casual",
    requiresBrand: false,
    conditionLanguage: "Keep condition plain and buyer-friendly."
  },
  poshmark: {
    displayName: "Poshmark",
    titleLimit: 50,
    tone: "closet-style marketplace",
    requiresBrand: false,
    conditionLanguage: "Use concise condition and style details."
  },
  facebook: {
    displayName: "Facebook Marketplace",
    titleLimit: 100,
    tone: "local conversational",
    requiresBrand: false,
    conditionLanguage: "Mention local pickup or shipping details before publishing."
  },
  tiktok: {
    displayName: "TikTok Shop",
    titleLimit: 60,
    tone: "very short social commerce",
    requiresBrand: true,
    conditionLanguage: "Use concise compliant urgency without unsupported claims."
  },
  pinterest: {
    displayName: "Pinterest",
    titleLimit: 100,
    tone: "seo discovery",
    requiresBrand: false,
    conditionLanguage: "Use search-friendly description and hashtags."
  },
  shopify: {
    displayName: "Shopify",
    titleLimit: 120,
    tone: "storefront catalog",
    requiresBrand: false,
    conditionLanguage: "Use storefront-safe copy and clear fulfillment notes."
  }
};
