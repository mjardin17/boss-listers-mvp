import type { CrossListPlatform } from "../crossListEngine/types";

export type PlatformListingStyle = "catalog" | "search" | "casual" | "local" | "social" | "seo" | "storefront" | "closet";

export interface PlatformProfile {
  platform: CrossListPlatform;
  displayName: string;
  titleLimit: number;
  imageLimit: number;
  listingStyle: PlatformListingStyle;
  seoBehavior: string;
  categoryBehavior: string;
  competitionBias: "LOW" | "MEDIUM" | "HIGH";
}

export const PLATFORM_PROFILES: Record<CrossListPlatform, PlatformProfile> = {
  ebay: {
    platform: "ebay",
    displayName: "eBay",
    titleLimit: 80,
    imageLimit: 24,
    listingStyle: "search",
    seoBehavior: "Title keywords and item specifics drive discovery.",
    categoryBehavior: "Strongest for sold-comp resale authority and collectibles.",
    competitionBias: "MEDIUM"
  },
  amazon: {
    platform: "amazon",
    displayName: "Amazon",
    titleLimit: 150,
    imageLimit: 9,
    listingStyle: "catalog",
    seoBehavior: "Catalog match, brand, bullets, and buy-box competition dominate.",
    categoryBehavior: "Strict brand/category fit required before publishing.",
    competitionBias: "HIGH"
  },
  walmart: {
    platform: "walmart",
    displayName: "Walmart",
    titleLimit: 75,
    imageLimit: 8,
    listingStyle: "catalog",
    seoBehavior: "Clean catalog titles and product identifiers matter most.",
    categoryBehavior: "Best for clean retail goods with strong identifiers.",
    competitionBias: "HIGH"
  },
  mercari: {
    platform: "mercari",
    displayName: "Mercari",
    titleLimit: 80,
    imageLimit: 12,
    listingStyle: "casual",
    seoBehavior: "Short titles and approachable descriptions perform well.",
    categoryBehavior: "Works for casual buyers, collectibles, and small goods.",
    competitionBias: "MEDIUM"
  },
  poshmark: {
    platform: "poshmark",
    displayName: "Poshmark",
    titleLimit: 50,
    imageLimit: 16,
    listingStyle: "closet",
    seoBehavior: "Brand, style, size, and condition details drive closet discovery.",
    categoryBehavior: "Best for apparel, accessories, beauty, home, and social closet categories.",
    competitionBias: "MEDIUM"
  },
  facebook: {
    platform: "facebook",
    displayName: "Facebook Marketplace",
    titleLimit: 100,
    imageLimit: 10,
    listingStyle: "local",
    seoBehavior: "Local buyer intent and plain-language titles matter.",
    categoryBehavior: "Useful for bulky items when shipping friction is high.",
    competitionBias: "LOW"
  },
  tiktok: {
    platform: "tiktok",
    displayName: "TikTok Shop",
    titleLimit: 60,
    imageLimit: 9,
    listingStyle: "social",
    seoBehavior: "Short hooks, visual appeal, and impulse fit matter.",
    categoryBehavior: "Best for trend-driven lightweight goods.",
    competitionBias: "HIGH"
  },
  pinterest: {
    platform: "pinterest",
    displayName: "Pinterest",
    titleLimit: 100,
    imageLimit: 5,
    listingStyle: "seo",
    seoBehavior: "Searchable descriptions and hashtags support discovery.",
    categoryBehavior: "Better as discovery traffic than primary marketplace.",
    competitionBias: "LOW"
  },
  shopify: {
    platform: "shopify",
    displayName: "Shopify",
    titleLimit: 120,
    imageLimit: 20,
    listingStyle: "storefront",
    seoBehavior: "Store catalog structure and product page quality matter.",
    categoryBehavior: "Best once reseller has owned traffic or repeat buyers.",
    competitionBias: "LOW"
  }
};
