import { normalizeNumber } from "./normalizeNumber";

export function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function clampConfidence(value: unknown, fallback = 0): number {
  return normalizeNumber(value, { fallback, min: 0, max: 100 }) ?? fallback;
}

export function normalizeInventoryCount(value: unknown, fallback = 0): number {
  return normalizeNumber(value, { fallback, min: 0, integer: true }) ?? fallback;
}

export function normalizeSellThrough(value: unknown): number | null {
  return normalizeNumber(value, { fallback: null, min: 0, max: 100 });
}
