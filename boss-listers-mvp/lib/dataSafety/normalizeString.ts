export function normalizeString(value: unknown, fallback = ""): string {
  if (value == null) return fallback;
  return String(value).replace(/\s+/g, " ").trim() || fallback;
}
