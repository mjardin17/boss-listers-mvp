import { normalizeNumber } from "./normalizeNumber";

export function normalizeCurrency(value: unknown, fallback: number | null = null): number | null {
  const normalized = normalizeNumber(value, { fallback, min: 0 });
  return normalized == null ? fallback : Number(normalized.toFixed(2));
}
