export type ShippingProfile = "lightweight" | "standard_parcel" | "oversized" | "collectible_protected" | "media_mail" | "fragile_handling";

export function estimateShippingRisk({
  weightLb = null,
  category = "",
  fragile = false,
  dimensions = null
}: {
  weightLb?: number | null;
  category?: string;
  fragile?: boolean;
  dimensions?: { length?: number; width?: number; height?: number } | null;
}) {
  const weight = Number(weightLb);
  const categoryText = String(category || "").toLowerCase();
  const girth =
    dimensions && [dimensions.length, dimensions.width, dimensions.height].every((value) => Number(value) > 0)
      ? Number(dimensions.length) + 2 * Number(dimensions.width) + 2 * Number(dimensions.height)
      : 0;
  const profile: ShippingProfile =
    /book|dvd|cd|media|game/.test(categoryText)
      ? "media_mail"
      : fragile
        ? "fragile_handling"
        : /collectible|toy|figure|card/.test(categoryText)
          ? "collectible_protected"
          : weight > 8 || girth > 84
            ? "oversized"
            : weight > 1
              ? "standard_parcel"
              : "lightweight";
  const estimatedCost =
    profile === "media_mail" ? 4.63 : profile === "lightweight" ? 5.25 : profile === "standard_parcel" ? 8.95 : profile === "collectible_protected" ? 9.75 : profile === "fragile_handling" ? 13.5 : 18.95;
  return {
    profile,
    estimatedCost,
    shippingPainScore:
      profile === "oversized" ? 90 : profile === "fragile_handling" ? 72 : profile === "collectible_protected" ? 48 : profile === "standard_parcel" ? 42 : 20,
    warnings:
      profile === "oversized"
        ? ["Oversized shipping can erase low-ticket profit."]
        : profile === "fragile_handling"
          ? ["Fragile handling increases return and damage risk."]
          : []
  };
}
