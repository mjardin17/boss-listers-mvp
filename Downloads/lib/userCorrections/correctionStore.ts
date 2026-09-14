import type { UserVerifiedCorrection } from "./correctionTypes";

export const USER_CORRECTIONS_STORAGE_KEY = "boss-listers.productCorrections.v1";

export function loadUserCorrections(): UserVerifiedCorrection[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(USER_CORRECTIONS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item?.status === "USER_VERIFIED") : [];
  } catch {
    return [];
  }
}

export function saveUserCorrection(correction: UserVerifiedCorrection): UserVerifiedCorrection[] {
  if (typeof window === "undefined") return [];
  const existing = loadUserCorrections();
  const key = correction.scanFingerprint || `${correction.upc || ""}|${correction.productTitle}`.toLowerCase();
  const next = [
    correction,
    ...existing.filter((item) => (item.scanFingerprint || `${item.upc || ""}|${item.productTitle}`.toLowerCase()) !== key)
  ].slice(0, 250);
  window.localStorage.setItem(USER_CORRECTIONS_STORAGE_KEY, JSON.stringify(next));
  console.info("[BossListers] correction saved successfully", {
    storageKey: USER_CORRECTIONS_STORAGE_KEY,
    scanFingerprint: correction.scanFingerprint || "",
    matchingKeys: correction.matchingKeys || [],
    pricingSource: correction.pricingSource
  });
  return next;
}
