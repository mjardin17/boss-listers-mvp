export type ProductCategory =
  | "Apparel"
  | "Footwear"
  | "Electronics"
  | "Toys & Games"
  | "Home & Kitchen"
  | "Books"
  | "Pokémon"
  | "Magic: The Gathering"
  | "Yu-Gi-Oh!"
  | "One Piece"
  | "Disney Lorcana"
  | "Flesh and Blood"
  | "Digimon"
  | "Dragon Ball"
  | "Sports Cards"
  | "Autographs"
  | "Memorabilia"
  | "Comic Books"
  | "Coins"
  | "Trading Card Games"
  | "Non-Sports Cards"
  | "Graded Collectibles"
  | "Trading Cards & Collectibles"
  | "Other";

export type ProductCondition =
  | "New With Tags (NWT)"
  | "New Without Tags (NWOT)"
  | "Excellent Used Condition (EUC)"
  | "Good Used Condition (GUC)"
  | "Fair Condition"
  | "Near Mint (NM)"
  | "Lightly Played (LP)"
  | "Moderately Played (MP)"
  | "Heavily Played (HP)"
  | "Damaged (DMG)"
  | "Gem Mint (PSA 10 / BGS 9.5 / SGC 10)"
  | "Mint";

export type PlatformName = 
  | "ebay" 
  | "poshmark" 
  | "mercari" 
  | "depop" 
  | "grailed" 
  | "etsy" 
  | "shopify" 
  | "tiktok"
  | "facebook"
  | "vinted"
  | "walmart"
  | "pinterest"
  | "woocommerce"
  | "tcgplayer"
  | "cardmarket"
  | "comc"
  | "myslabs"
  | "whatnot"
  | "fanatics_collect"
  | "fanatics_live"
  | "goldin"
  | "beckett"
  | "sportslots"
  | "collx"
  | "veriswap"
  | "district";

export interface CardCollectiblesAttributes {
  cardGame?: string;
  sport?: string;
  league?: string;
  player?: string;
  team?: string;
  set?: string;
  series?: string;
  cardNumber?: string;
  year?: number | string;
  manufacturer?: string;
  parallel?: string;
  variant?: string;
  insert?: boolean | string;
  rookieCard?: boolean;
  autograph?: boolean;
  memorabilia?: boolean;
  patch?: boolean;
  printing?: string;
  language?: string;
  rarity?: string;
  foil?: boolean;
  firstEdition?: boolean;
  unlimited?: boolean;
  gradingCompany?: 'PSA' | 'BGS' | 'SGC' | 'CGC' | 'TAG' | 'Ungraded' | string;
  grade?: string | number;
  certificationNumber?: string;
  population?: number;
  conditionNotes?: string;
}

export interface SyncRecord {
  listed: boolean;
  listedPrice: number;
  listedUrl?: string;
  externalListingId?: string;
  syncStatus: "idle" | "pending" | "success" | "failed";
  syncLog?: string;
  syncedAt?: string;
  quantity?: number;
}

export interface ResellerProduct {
  id: string;
  title: string;
  brand: string;
  model?: string;
  skuCode?: string;
  category: ProductCategory;
  condition: ProductCondition;
  notes?: string;
  buyCost: number;
  suggestedPrice: number;
  confidenceScore: number; // 0-100 indicating pricing estimations match quality
  imageUrl?: string; // base64 or stock illustration url
  status: "Draft" | "Listed" | "Sold";
  quantity?: number;
  revisionVersion?: number;
  draftStatus?: "Draft" | "DraftRecovery" | "Listed" | "Sold" | "Archived" | "Delisted";
  cardAttributes?: CardCollectiblesAttributes;
  marketplaceListingIds?: Partial<Record<PlatformName, string>>;
  marketplaceListingUrls?: Partial<Record<PlatformName, string>>;
  platforms: Partial<Record<PlatformName, SyncRecord>>;
  soldPrice?: number;
  soldDate?: string;
  shippingCharged?: number;
  shippingCost?: number;
  platformFeesPaid?: number;
  createdAt: string;
}

export interface PricingBreakdown {
  platform: PlatformName;
  sellingPrice: number;
  buyCost: number;
  platformFee: number;
  shippingCost: number;
  netProfit: number;
  marginPercent: number;
}

export interface SyncLogEntry {
  id: string;
  productId: string;
  productTitle: string;
  platform: PlatformName;
  status: 'info' | 'success' | 'error';
  message: string;
  timestamp: string;
}

export interface ResellerStats {
  totalItems: number;
  totalListedValue: number;
  totalInvestedCost: number;
  projectedProfit: number;
  realizedProfit: number;
  averageMargin: number;
  soldCount: number;
  activeCount: number;
  draftCount: number;
}
