export function estimateRegionalPricingRisk(profile: any, location = "") {
  const base = profile?.regionalInconsistency === "HIGH" ? 70 : profile?.regionalInconsistency === "MEDIUM" ? 45 : 20;
  return {
    location: location || "unspecified",
    regionalPricingRisk: base,
    note: base >= 60 ? "Store-level price verification recommended." : "Regional pricing risk is manageable."
  };
}
