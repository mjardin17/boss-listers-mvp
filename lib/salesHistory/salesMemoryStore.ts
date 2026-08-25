import type { UserVerifiedSale } from "./salesHistoryTypes";

export const SALES_HISTORY_STORAGE_KEY = "boss-listers.salesHistory.v1";

export function loadSalesMemory(): UserVerifiedSale[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SALES_HISTORY_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item?.status === "USER_VERIFIED_SALE") : [];
  } catch {
    return [];
  }
}

export function saveSalesMemory(sales: UserVerifiedSale[]) {
  if (typeof window === "undefined") return [];
  const existing = loadSalesMemory();
  const byId = new Map<string, UserVerifiedSale>();
  [...sales, ...existing].forEach((sale) => byId.set(sale.id, sale));
  const next = Array.from(byId.values()).slice(0, 2000);
  window.localStorage.setItem(SALES_HISTORY_STORAGE_KEY, JSON.stringify(next));
  console.info("[BossListers] USER_VERIFIED_SALE storage updated", {
    storageKey: SALES_HISTORY_STORAGE_KEY,
    savedCount: sales.length,
    latestScanFingerprint: sales[0]?.scanFingerprint || "",
    latestMatchingKeys: sales[0]?.matchingKeys || []
  });
  return next;
}
