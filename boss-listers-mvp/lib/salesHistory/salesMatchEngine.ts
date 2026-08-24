import type { PersonalSaleMatch, UserVerifiedSale } from "./salesHistoryTypes";
import { findBestUserVerifiedSaleMatch } from "./fuzzyMatchEngine";

export function findPersonalSaleMatch(
  sales: unknown,
  product: { title?: string; upc?: string; sku?: string; brand?: string; category?: string; ocrText?: unknown; visualAnchors?: unknown; packagingHints?: unknown; matchingKeys?: string[] } = {}
): PersonalSaleMatch | null {
  const list = Array.isArray(sales) ? (sales as UserVerifiedSale[]) : [];
  const sku = String(product.sku || "").trim().toLowerCase();
  const skuMatch = list
    .filter((sale) => sku && sale.sku && sale.sku.toLowerCase() === sku)
    .map((sale) => ({
      sale,
      matchScore: 98,
      confidenceBoost: 16,
      matchReason: "SKU matched your previous sale.",
      matchType: "EXACT_MATCH" as const,
      autoApply: true,
      matchingSignals: ["SKU exact match"],
      rejectedSignals: [],
      scoreBreakdown: { skuExact: 98 }
    }))
    .sort((a, b) => b.sale.soldDate.localeCompare(a.sale.soldDate))[0];
  if (skuMatch) return skuMatch;

  const best = findBestUserVerifiedSaleMatch(sales, product);
  console.info("[BossListers] USER_VERIFIED_SALE fuzzy match", {
    attempted: list.length,
    matched: Boolean(best?.autoApply),
    bestMatchType: best?.matchType || "",
    bestMatchScore: best?.matchScore || 0,
    autoApply: Boolean(best?.autoApply),
    matchingSignals: best?.matchingSignals || [],
    rejectedSignals: best?.rejectedSignals || [],
    scoreBreakdown: best?.scoreBreakdown || {}
  });
  return best?.autoApply ? best : null;
}
