import type { ManualCompOverrideResult } from "./manualCompOverride";
import type { VerifiedSoldCompPrice } from "./liveSoldCompLookup";

export type PricingSourceDecision =
  | {
      source: "verified_sold_comps";
      resalePrice: number;
      soldCount: number;
      pricingStatus: "available";
    }
  | {
      source: "manual_sold_comp";
      resalePrice: number;
      manualOverride: ManualCompOverrideResult;
      pricingStatus: "manual";
    }
  | {
      source: "USER_VERIFIED";
      resalePrice: number;
      manualOverride: ManualCompOverrideResult;
      pricingStatus: "user_verified";
    }
  | {
      source: "USER_VERIFIED_SALE";
      resalePrice: number;
      manualOverride: ManualCompOverrideResult;
      pricingStatus: "user_verified_sale";
    }
  | {
      source: "cached_verified_result";
      resalePrice: number;
      pricingStatus: "cached";
    }
  | {
      source: "none";
      resalePrice: null;
      pricingStatus: "unavailable";
    };

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
}

export function routePricingSource({
  verifiedSoldComps,
  userVerifiedSale,
  userVerifiedCorrection,
  manualOverride,
  cachedPreviousVerified
}: {
  verifiedSoldComps?: VerifiedSoldCompPrice | null;
  userVerifiedSale?: ManualCompOverrideResult | null;
  manualOverride?: ManualCompOverrideResult | null;
  userVerifiedCorrection?: ManualCompOverrideResult | null;
  cachedPreviousVerified?: { resalePrice?: number | null } | null;
}): PricingSourceDecision {
  if (verifiedSoldComps?.resalePrice) {
    return {
      source: "verified_sold_comps",
      resalePrice: verifiedSoldComps.resalePrice,
      soldCount: verifiedSoldComps.soldCount,
      pricingStatus: "available"
    };
  }

  if (userVerifiedSale?.resalePrice) {
    return {
      source: "USER_VERIFIED_SALE",
      resalePrice: userVerifiedSale.resalePrice,
      manualOverride: userVerifiedSale,
      pricingStatus: "user_verified_sale"
    };
  }

  if (userVerifiedCorrection?.resalePrice) {
    return {
      source: "USER_VERIFIED",
      resalePrice: userVerifiedCorrection.resalePrice,
      manualOverride: userVerifiedCorrection,
      pricingStatus: "user_verified"
    };
  }

  if (manualOverride?.resalePrice) {
    return {
      source: "manual_sold_comp",
      resalePrice: manualOverride.resalePrice,
      manualOverride,
      pricingStatus: "manual"
    };
  }

  const cachedPrice = positiveNumber(cachedPreviousVerified?.resalePrice);
  if (cachedPrice != null) {
    return {
      source: "cached_verified_result",
      resalePrice: cachedPrice,
      pricingStatus: "cached"
    };
  }

  return {
    source: "none",
    resalePrice: null,
    pricingStatus: "unavailable"
  };
}
