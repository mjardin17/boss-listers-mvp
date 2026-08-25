import type { InventoryRecord } from "../app/saas/schemas";

export type EasyPlatform = "mercari" | "poshmark" | "facebook" | "ebay";

export type EasyPlatformRoute = {
  platform: EasyPlatform;
  label: string;
  score: number;
  reason: string;
  blockers: string[];
};

function text(item: InventoryRecord) {
  return `${item.title} ${item.listing.itemTitle} ${item.listing.category || ""} ${item.listing.brand || ""}`.toLowerCase();
}

function hasPrice(item: InventoryRecord) {
  return Number(item.listing.averageSalePrice || item.listing.estimatedResalePrice || item.soldPrice) > 0;
}

function hasTitle(item: InventoryRecord) {
  return Boolean((item.title || item.listing.itemTitle || "").trim());
}

export function routeEasiestPlatform(item: InventoryRecord): EasyPlatformRoute {
  const haystack = text(item);
  const blockers = [
    !hasTitle(item) ? "Missing title" : "",
    !hasPrice(item) ? "Missing price" : "",
    !item.condition ? "Missing condition" : ""
  ].filter(Boolean);

  if (/shoe|sneaker|boot|shirt|jean|dress|jacket|hoodie|apparel|clothing|fashion/.test(haystack)) {
    return {
      platform: "poshmark",
      label: "Poshmark",
      score: blockers.length ? 58 : 86,
      reason: "Apparel and footwear usually need the least transformation on Poshmark.",
      blockers
    };
  }

  if (/large|furniture|pickup|local|fragile|glass|heavy/.test(haystack)) {
    return {
      platform: "facebook",
      label: "Facebook Marketplace",
      score: blockers.length ? 52 : 78,
      reason: "Bulky or fragile inventory is easiest to test as a local listing first.",
      blockers
    };
  }

  return {
    platform: "mercari",
    label: "Mercari",
    score: blockers.length ? 60 : 90,
    reason: "Mercari has the lowest draft friction for general eBay inventory in this MVP.",
    blockers
  };
}

export function rankEasyPlatforms(items: InventoryRecord[]) {
  return items
    .map((item) => ({ item, route: routeEasiestPlatform(item) }))
    .sort((a, b) => b.route.score - a.route.score);
}
