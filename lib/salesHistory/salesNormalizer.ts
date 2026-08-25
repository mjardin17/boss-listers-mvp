import type { RawSalesHistoryRow, UserVerifiedSale } from "./salesHistoryTypes";
import { buildScanMatchingKeys } from "../userCorrections/correctionMerge";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function moneyOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
}

function isoDateOrEmpty(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function normalizeSalesTitleTokens(title: string) {
  return clean(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length > 2 && !["the", "and", "for", "with", "new"].includes(token))
    .slice(0, 16);
}

export function normalizeSalesHistoryRow(row: RawSalesHistoryRow, index = 0): UserVerifiedSale | null {
  const itemTitle = clean(row.itemTitle);
  const soldPrice = moneyOrNull(row.soldPrice);
  const soldDate = isoDateOrEmpty(row.soldDate);
  if (!itemTitle || soldPrice == null || !soldDate) return null;
  const upc = clean(row.upc).replace(/\D/g, "");
  const sku = clean(row.sku);
  const scanKeys = buildScanMatchingKeys({
    upc,
    title: itemTitle,
    brand: "",
    category: row.category
  });
  return {
    id: `sale_${upc || sku || normalizeSalesTitleTokens(itemTitle).join("_")}_${soldDate}_${index}`,
    status: "USER_VERIFIED_SALE",
    itemTitle,
    soldPrice,
    soldDate,
    platform: clean(row.platform) || "Unknown",
    shippingCharged: moneyOrNull(row.shippingCharged),
    cost: moneyOrNull(row.cost),
    quantitySold: null,
    sku,
    upc,
    category: clean(row.category),
    condition: clean(row.condition),
    notes: "",
    sourceUrl: "",
    normalizedTitleTokens: normalizeSalesTitleTokens(itemTitle),
    scanFingerprint: scanKeys.scanFingerprint,
    matchingKeys: scanKeys.matchingKeys,
    importedAt: new Date().toISOString()
  };
}
