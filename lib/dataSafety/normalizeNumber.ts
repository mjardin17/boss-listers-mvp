export interface NormalizeNumberOptions {
  fallback?: number | null;
  min?: number;
  max?: number;
  integer?: boolean;
}

export function normalizeNumber(value: unknown, options: NormalizeNumberOptions = {}): number | null {
  const fallback = options.fallback ?? null;
  if (value == null || value === "") return fallback;

  const parsed =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[$,%\s,]/g, ""));

  if (!Number.isFinite(parsed)) return fallback;

  let normalized = options.integer ? Math.trunc(parsed) : parsed;
  if (Number.isFinite(options.min)) normalized = Math.max(options.min as number, normalized);
  if (Number.isFinite(options.max)) normalized = Math.min(options.max as number, normalized);
  return normalized;
}
