import type { CrossListPlatform } from "../crossListEngine/types";

export interface PlatformShippingProfile {
  platform: CrossListPlatform;
  assumedBuyerTolerance: "LOW" | "MEDIUM" | "HIGH";
  defaultShippingCost: number;
  notes: string;
}

export const PLATFORM_SHIPPING_PROFILES: Record<CrossListPlatform, PlatformShippingProfile> = {
  ebay: { platform: "ebay", assumedBuyerTolerance: "MEDIUM", defaultShippingCost: 5.75, notes: "Buyer accepts shipping when comps support price." },
  amazon: { platform: "amazon", assumedBuyerTolerance: "LOW", defaultShippingCost: 7.5, notes: "Prime expectations increase fulfillment pressure." },
  walmart: { platform: "walmart", assumedBuyerTolerance: "LOW", defaultShippingCost: 7.25, notes: "Clean catalog goods need competitive fulfillment." },
  mercari: { platform: "mercari", assumedBuyerTolerance: "MEDIUM", defaultShippingCost: 6.25, notes: "Small item shipping works best." },
  poshmark: { platform: "poshmark", assumedBuyerTolerance: "MEDIUM", defaultShippingCost: 7.97, notes: "Poshmark shipping is label-driven; confirm current buyer-paid label rules before live publishing." },
  facebook: { platform: "facebook", assumedBuyerTolerance: "HIGH", defaultShippingCost: 0, notes: "Local pickup can avoid shipping friction." },
  tiktok: { platform: "tiktok", assumedBuyerTolerance: "LOW", defaultShippingCost: 6.5, notes: "Impulse buyers punish high shipping costs." },
  pinterest: { platform: "pinterest", assumedBuyerTolerance: "MEDIUM", defaultShippingCost: 0, notes: "Discovery channel; shipping handled downstream." },
  shopify: { platform: "shopify", assumedBuyerTolerance: "MEDIUM", defaultShippingCost: 6.5, notes: "Storefront shipping policy controls conversion." }
};
