export type CrossListPlatform =
  | "ebay"
  | "amazon"
  | "walmart"
  | "mercari"
  | "poshmark"
  | "facebook"
  | "tiktok"
  | "pinterest"
  | "shopify";

export interface CrossListInput {
  title: string;
  brand?: string;
  category?: string;
  condition?: string;
  upc?: string;
  keyDetails?: string[];
  description?: string;
  recommendation?: string;
}

export interface CrossListDraft {
  platform: CrossListPlatform;
  displayName: string;
  title: string;
  description: string;
  bulletPoints: string[];
  hashtags: string[];
  category: string;
  metadata: {
    titleLimit: number;
    conditionLanguage: string;
    tone: string;
    requiresBrand: boolean;
    publishReady: boolean;
    warnings: string[];
  };
}
