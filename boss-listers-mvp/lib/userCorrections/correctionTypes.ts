export type UserCorrectionAction =
  | "save_correction"
  | "add_pricing_memory"
  | "wrong_item"
  | "wrong_variant"
  | "bundle_multipack"
  | "correct_match";

export type UserVerifiedCorrection = {
  id: string;
  status: "USER_VERIFIED";
  action: UserCorrectionAction;
  createdAt: string;
  updatedAt: string;
  productTitle: string;
  upc: string;
  brand: string;
  sourceStore: string;
  costPaid: number | null;
  soldCompPrice: number | null;
  shippingEstimate: number | null;
  quantitySold?: number | null;
  sourceUrl?: string;
  scanFingerprint?: string;
  matchingKeys?: string[];
  condition: string;
  platformUsedForComp: string;
  confidenceCorrection: string;
  demandCorrection: string;
  notes: string;
  correctionFlags: string[];
  pricingSource: "USER_VERIFIED";
  rawAiSnapshot?: {
    title?: string;
    upc?: string;
    brand?: string;
    sourceStore?: string;
    costPaid?: number | null;
    resalePrice?: number | null;
    profit?: number | null;
    condition?: string;
  };
};
