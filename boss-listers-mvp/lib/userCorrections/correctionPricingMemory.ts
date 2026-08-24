import type { UserVerifiedCorrection } from "./correctionTypes";

const MARKETPLACE_FEE_RATE = 0.13;
const TRANSACTION_FEE = 0;
const DEFAULT_SHIPPING = 5.75;

export function calculateUserVerifiedPricing(correction: UserVerifiedCorrection | null) {
  if (!correction?.soldCompPrice || correction.soldCompPrice <= 0) return null;
  const shipping = correction.shippingEstimate ?? DEFAULT_SHIPPING;
  const cost = correction.costPaid;
  const fees = correction.soldCompPrice * MARKETPLACE_FEE_RATE + TRANSACTION_FEE;
  const costForCalculation = cost;
  const netProfit =
    costForCalculation == null
      ? null
      : Number((correction.soldCompPrice - fees - shipping - costForCalculation).toFixed(2));
  const roi =
    netProfit != null && costForCalculation != null && costForCalculation > 0
      ? Number(((netProfit / costForCalculation) * 100).toFixed(1))
      : null;
  return {
    resalePrice: correction.soldCompPrice,
    costPaid: cost,
    shippingEstimate: shipping,
    netProfit,
    roi,
    source: "USER_VERIFIED" as const
  };
}
