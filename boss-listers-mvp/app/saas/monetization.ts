import type { ScanRecord } from "./schemas";
import { getTodaySessionScans } from "./sessionMetrics";

export type BossListersPlan = "free" | "pro" | "team";
export type FeatureKey =
  | "scan"
  | "barcodeScan"
  | "sessionMetrics"
  | "inventoryTracking"
  | "exportSession";

export const SUBSCRIPTION_READY_CONFIG = {
  freeDailyScanLimit: 25,
  plans: {
    free: {
      label: "Free",
      dailyScanLimit: 25,
      features: ["scan", "barcodeScan", "sessionMetrics", "inventoryTracking"] as FeatureKey[]
    },
    pro: {
      label: "Pro",
      dailyScanLimit: null,
      features: [
        "scan",
        "barcodeScan",
        "sessionMetrics",
        "inventoryTracking",
        "exportSession"
      ] as FeatureKey[]
    },
    team: {
      label: "Team",
      dailyScanLimit: null,
      features: [
        "scan",
        "barcodeScan",
        "sessionMetrics",
        "inventoryTracking",
        "exportSession"
      ] as FeatureKey[]
    }
  }
} as const;

export function canUseFeature(plan: BossListersPlan = "free", feature: FeatureKey) {
  return SUBSCRIPTION_READY_CONFIG.plans[plan].features.includes(feature);
}

export function getFreeTierScanUsage(scans: ScanRecord[]) {
  const usedToday = getTodaySessionScans(scans).length;
  const limit = SUBSCRIPTION_READY_CONFIG.freeDailyScanLimit;
  return {
    usedToday,
    limit,
    remaining: Math.max(0, limit - usedToday),
    isAtLimit: usedToday >= limit
  };
}

// Future Stripe/auth integration should map authenticated users to plan keys here.
// Do not import Stripe or auth clients into UI components.
export function getCurrentPlanPlaceholder(): BossListersPlan {
  return "free";
}
