import type { CrossListPlatform } from "../crossListEngine/types";

export interface PlatformFeeProfile {
  platform: CrossListPlatform;
  marketplaceFeeRate: number;
  fixedFee: number;
  paymentFeeRate: number;
  notes: string;
}

export const PLATFORM_FEE_PROFILES: Record<CrossListPlatform, PlatformFeeProfile> = {
  ebay: {
    platform: "ebay",
    marketplaceFeeRate: 0.1325,
    fixedFee: 0.3,
    paymentFeeRate: 0,
    notes: "Modeled after common eBay final value fee behavior; verify category fees before publishing."
  },
  amazon: {
    platform: "amazon",
    marketplaceFeeRate: 0.15,
    fixedFee: 0,
    paymentFeeRate: 0,
    notes: "Referral-fee approximation only; FBA, storage, and gated categories are not included."
  },
  walmart: {
    platform: "walmart",
    marketplaceFeeRate: 0.15,
    fixedFee: 0,
    paymentFeeRate: 0,
    notes: "Referral-fee approximation only; catalog approval may be required."
  },
  mercari: {
    platform: "mercari",
    marketplaceFeeRate: 0.1,
    fixedFee: 0.5,
    paymentFeeRate: 0.029,
    notes: "Simplified selling and processing fee model."
  },
  poshmark: {
    platform: "poshmark",
    marketplaceFeeRate: 0.2,
    fixedFee: 0,
    paymentFeeRate: 0,
    notes: "Simplified Poshmark fee model; exact thresholds should be verified before live publishing."
  },
  facebook: {
    platform: "facebook",
    marketplaceFeeRate: 0.05,
    fixedFee: 0.4,
    paymentFeeRate: 0,
    notes: "Lower fee model; local pickup may reduce shipping but increase coordination cost."
  },
  tiktok: {
    platform: "tiktok",
    marketplaceFeeRate: 0.08,
    fixedFee: 0.3,
    paymentFeeRate: 0,
    notes: "Simplified social commerce fee model; promotions and affiliate costs are not included."
  },
  pinterest: {
    platform: "pinterest",
    marketplaceFeeRate: 0,
    fixedFee: 0,
    paymentFeeRate: 0,
    notes: "Modeled as discovery channel; checkout fees depend on destination storefront."
  },
  shopify: {
    platform: "shopify",
    marketplaceFeeRate: 0,
    fixedFee: 0.3,
    paymentFeeRate: 0.029,
    notes: "Payment-processing approximation only; app and fulfillment costs excluded."
  }
};

export function estimatePlatformNetProfit({
  platform,
  salePrice,
  costBasis,
  shippingCost
}: {
  platform: CrossListPlatform;
  salePrice: number | null;
  costBasis: number | null;
  shippingCost: number;
}) {
  const fee = PLATFORM_FEE_PROFILES[platform];
  if (salePrice == null || costBasis == null || salePrice <= 0 || costBasis < 0) {
    return {
      platform,
      estimatedFees: null,
      estimatedNetProfit: null,
      estimatedRoi: null,
      notes: fee.notes
    };
  }
  const estimatedFees = salePrice * (fee.marketplaceFeeRate + fee.paymentFeeRate) + fee.fixedFee;
  const estimatedNetProfit = salePrice - estimatedFees - shippingCost - costBasis;
  return {
    platform,
    estimatedFees: Number(estimatedFees.toFixed(2)),
    estimatedNetProfit: Number(estimatedNetProfit.toFixed(2)),
    estimatedRoi: costBasis > 0 ? Number(((estimatedNetProfit / costBasis) * 100).toFixed(1)) : null,
    notes: fee.notes
  };
}
