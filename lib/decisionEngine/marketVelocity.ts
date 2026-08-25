export type SellThroughSpeed = "FAST" | "MODERATE" | "SLOW" | "DEAD";

export function resolveSellThroughSpeed(value: unknown, soldCount = 0): SellThroughSpeed {
  const normalized = String(value || "").toUpperCase();
  if (["FAST", "HIGH", "HEALTHY"].includes(normalized)) return "FAST";
  if (["MODERATE", "MEDIUM"].includes(normalized)) return "MODERATE";
  if (["SLOW", "LOW"].includes(normalized)) return "SLOW";
  return soldCount > 0 ? "SLOW" : "DEAD";
}
