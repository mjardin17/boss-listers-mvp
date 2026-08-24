import { normalizeNumber } from "./normalizeNumber";

export function normalizePercentage(value: unknown, fallback: number | null = null): number | null {
  const normalized = normalizeNumber(value, { fallback, min: -1000, max: 1000 });
  return normalized == null ? fallback : Number(normalized.toFixed(1));
}
