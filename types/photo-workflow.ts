// Photo upload and distribution workflow types

export interface ProductInfo {
  id: string;
  title: string;
  description: string;
  category: string;
  condition: "new" | "like_new" | "good" | "fair" | "poor";
  price: number;
  estimatedValue?: number;
  tags: string[];
  keyFeatures: string[];
}

export interface SocialCaption {
  platform: string;
  caption: string;
  hashtags: string[];
  mediaRecommendations?: string;
}

export const SOCIAL_PLATFORMS = [
  "instagram",
  "tiktok",
  "facebook",
  "twitter",
  "pinterest",
  "linkedin",
  "youtube_shorts",
  "threads",
] as const;

export const MARKETPLACES = [
  "amazon",
  "ebay",
  "mercari",
  "poshmark",
  "depop",
  "vestiaire",
  "grailed",
  "etsy",
  "shopify",
  "facebook_marketplace",
  "craigslist",
  "letgo",
  "offerup",
  "vinted",
  "rebag",
  "tradesy",
  "thredUP",
  "gazelle",
  "kingsumo",
  "whatnot",
  "pinterest_shop",
  "tiktok_shop",
  "instagram_shop",
  "snapchat_shop",
  "twitter_commerce",
  "woocommerce",
  "bigcommerce",
] as const;

export interface SocialMediaConnection {
  platform: (typeof SOCIAL_PLATFORMS)[number];
  connected: boolean;
  username?: string;
  accountId?: string;
}

export interface MarketplaceConnection {
  marketplace: (typeof MARKETPLACES)[number];
  connected: boolean;
  accountId?: string;
  sellerId?: string;
}

export interface PostProgressItem {
  id: string;
  type: "platform" | "marketplace";
  name: string;
  status: "pending" | "in_progress" | "success" | "error" | "skipped";
  error?: string;
  result?: unknown;
}

export interface PhotoUploadWorkflowState {
  photo: File | null;
  photoPreview: string | null;
  productInfo: ProductInfo | null;
  extracting: boolean;
  extractionError: string | null;
  socialCaptions: SocialCaption[] | null;
  socialConnections: SocialMediaConnection[];
  marketplaceConnections: MarketplaceConnection[];
  posting: boolean;
  postProgress: PostProgressItem[];
  postError: string | null;
}

export interface ExtractResponse {
  success: boolean;
  data?: ProductInfo;
  error?: string;
}

export interface PostEverythingResponse {
  success: boolean;
  results: PostProgressItem[];
  timestamp: string;
}
