export type ImportedSaleStatus = "USER_VERIFIED_SALE";

export type RawSalesHistoryRow = {
  itemTitle?: string;
  soldPrice?: string | number | null;
  soldDate?: string | null;
  platform?: string | null;
  shippingCharged?: string | number | null;
  cost?: string | number | null;
  sku?: string | null;
  upc?: string | null;
  category?: string | null;
  condition?: string | null;
};

export type UserVerifiedSale = {
  id: string;
  status: ImportedSaleStatus;
  itemTitle: string;
  soldPrice: number;
  soldDate: string;
  platform: string;
  shippingCharged: number | null;
  cost: number | null;
  quantitySold?: number | null;
  sku: string;
  upc: string;
  category: string;
  condition: string;
  notes?: string;
  sourceUrl?: string;
  normalizedTitleTokens: string[];
  scanFingerprint?: string;
  matchingKeys?: string[];
  importedAt: string;
};

export type PersonalSaleMatch = {
  sale: UserVerifiedSale;
  confidenceBoost: number;
  matchReason: string;
  matchScore: number;
  matchType?: "EXACT_MATCH" | "STRONG_MATCH" | "POSSIBLE_MATCH" | "WEAK_MATCH";
  autoApply?: boolean;
  matchingSignals?: string[];
  rejectedSignals?: string[];
  scoreBreakdown?: Record<string, number>;
};
