import type { DealAnalysis } from "../types/deal";

const STORAGE_KEY = "boss-listers-ai.scans.v1";
const MAX_RECENT_SCANS = 5;

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadRecentScans(): DealAnalysis[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_SCANS) : [];
  } catch {
    return [];
  }
}

export function saveRecentScan(scan: DealAnalysis): DealAnalysis[] {
  if (!canUseStorage()) {
    return [scan];
  }

  const nextScans = [scan, ...loadRecentScans().filter((item) => item.id !== scan.id)].slice(0, MAX_RECENT_SCANS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextScans));
  return nextScans;
}

export function clearRecentScans(): void {
  if (canUseStorage()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}
