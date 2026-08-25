import type { CategoryBehaviorProfile, NormalizedMarketFacts, ResellerRuleAction } from "./types";

function action(
  ruleId: string,
  passed: boolean,
  severity: ResellerRuleAction["severity"],
  scoreDelta: number,
  confidenceDelta: number,
  reason: string
): ResellerRuleAction {
  return { ruleId, passed, severity, scoreDelta, confidenceDelta, reason };
}

export function noSoldCompManualReview(facts: NormalizedMarketFacts): ResellerRuleAction {
  if (facts.trustedSoldCount > 0) {
    return action("no_sold_comp_manual_review", true, "INFO", 0, 0, "Trusted sold comps are present.");
  }
  return action(
    "no_sold_comp_manual_review",
    false,
    "BLOCKER",
    -60,
    -40,
    "No trusted sold comps; resale value, profit, and BUY confidence are unavailable."
  );
}

export function dollarTreeLowTicketSuppression(facts: NormalizedMarketFacts): ResellerRuleAction {
  const dollarTree = facts.sourceStoreType === "DOLLAR_TREE" || (facts.costBasis != null && facts.costBasis <= 1.5);
  const lowTicket = facts.averageSoldPrice != null && facts.averageSoldPrice < 18;
  if (!dollarTree || !lowTicket) {
    return action("dollar_tree_low_ticket_suppression", true, "INFO", 0, 0, "Low-ticket Dollar Tree suppression not active.");
  }
  return action(
    "dollar_tree_low_ticket_suppression",
    false,
    "WARN",
    -25,
    -12,
    "Low-ticket Dollar Tree items need unusually strong sell-through after fees and shipping."
  );
}

export function consumableBundleOnlyWarning(facts: NormalizedMarketFacts, profile: CategoryBehaviorProfile): ResellerRuleAction {
  if (!facts.isConsumable && !profile.requiresBundleValidation) {
    return action("consumable_bundle_only_warning", true, "INFO", 0, 0, "Bundle validation not required.");
  }
  if (facts.isBundleDependent && !facts.isMultipack) {
    return action(
      "consumable_bundle_only_warning",
      false,
      "WARN",
      -22,
      -14,
      "Consumable economics appear bundle-dependent, but the scanned item is not verified as a multipack."
    );
  }
  return action("consumable_bundle_only_warning", true, "INFO", 2, 0, "Bundle requirements are not blocking this scan.");
}

export function shippingFrictionPenalty(facts: NormalizedMarketFacts, profile: CategoryBehaviorProfile): ResellerRuleAction {
  if (facts.averageSoldPrice == null || facts.averageSoldPrice <= 0) {
    return action("shipping_friction_penalty", false, "WARN", -8, -5, "Shipping friction cannot be evaluated without sold value.");
  }
  const ratio = (facts.shippingOverhead + facts.oversizedPenalty) / facts.averageSoldPrice;
  const limit = profile.shippingTolerance === "LOW" ? 0.22 : profile.shippingTolerance === "MEDIUM" ? 0.32 : 0.45;
  const complexShipping = facts.shippingComplexity === "HIGH" || facts.estimatedWeightClass === "HEAVY" || facts.estimatedWeightClass === "OVERSIZE";
  if (ratio <= limit && !complexShipping && !facts.fragileRisk) {
    return action("shipping_friction_penalty", true, "INFO", 3, 0, "Shipping friction is acceptable for this category.");
  }
  if (facts.fragileRisk) {
    return action("fragile_shipping_confidence_penalty", false, "WARN", -12, -8, "Fragile item lowers confidence because damage and returns can erase margin.");
  }
  if (facts.estimatedWeightClass === "HEAVY" || facts.estimatedWeightClass === "OVERSIZE") {
    return action("heavy_oversize_shipping_penalty", false, "WARN", -24, -14, "Cheap heavy or oversized items are poor resale candidates after shipping friction.");
  }
  return action(
    "shipping_friction_penalty",
    false,
    "WARN",
    -18,
    -10,
    "Shipping burden is too high relative to the sold price for this category."
  );
}

export function slowSellThroughPenalty(facts: NormalizedMarketFacts, profile: CategoryBehaviorProfile): ResellerRuleAction {
  if (profile.minSellThroughRate == null || profile.longTailAllowed) {
    return action("slow_sell_through_penalty", true, "INFO", 0, 0, "Long-tail or category-specific velocity tolerance applies.");
  }
  if (facts.sellThroughRate != null && facts.sellThroughRate >= profile.minSellThroughRate) {
    return action("slow_sell_through_penalty", true, "INFO", 8, 4, "Sell-through meets category threshold.");
  }
  return action("slow_sell_through_penalty", false, "WARN", -20, -12, "Sell-through is too slow for this category.");
}

export function sparseEvidenceConfidencePenalty(facts: NormalizedMarketFacts, profile: CategoryBehaviorProfile): ResellerRuleAction {
  const collectibleException =
    profile.longTailAllowed &&
    facts.isCollectible &&
    facts.raritySignal &&
    facts.trustedSoldCount >= profile.minTrustedSolds &&
    facts.visualMatchScore >= 0.55 &&
    facts.titleMatchScore >= 0.5;
  if (facts.trustedSoldCount >= profile.minTrustedSolds || collectibleException) {
    return action("sparse_evidence_confidence_penalty", true, "INFO", 0, 0, "Sold evidence meets category minimum.");
  }
  return action(
    "sparse_evidence_confidence_penalty",
    false,
    "WARN",
    -18,
    -18,
    "Sparse trusted sold comps reduce confidence until more verified market evidence exists."
  );
}

export function weakIdentityPenalty(facts: NormalizedMarketFacts): ResellerRuleAction {
  const weakTitle = facts.titleMatchScore > 0 && facts.titleMatchScore < 0.5;
  const weakVisual = facts.visualMatchScore > 0 && facts.visualMatchScore < 0.45;
  if (!weakTitle && !weakVisual) {
    return action("weak_identity_penalty", true, "INFO", 0, 0, "Identity match is strong enough for rule evaluation.");
  }
  return action(
    "weak_identity_penalty",
    false,
    "WARN",
    -16,
    -16,
    "Weak title or visual alignment makes this scan less trustworthy."
  );
}

export function longTailCollectibleAllowance(facts: NormalizedMarketFacts, profile: CategoryBehaviorProfile): ResellerRuleAction {
  if (!profile.longTailAllowed || !facts.isCollectible) {
    return action("long_tail_collectible_allowance", true, "INFO", 0, 0, "Long-tail collectible exception not active.");
  }
  const lowSupply = facts.activeCount <= 8 || (facts.saturationRatio != null && facts.saturationRatio <= profile.maxSaturationRatio);
  const enoughEvidence =
    facts.raritySignal &&
    facts.trustedSoldCount >= profile.minTrustedSolds &&
    facts.visualMatchScore >= 0.55 &&
    facts.titleMatchScore >= 0.5;
  if (lowSupply && enoughEvidence) {
    return action(
      "long_tail_collectible_allowance",
      true,
      "INFO",
      18,
      8,
      "Long-tail collectible allowed with low supply and enough variant evidence."
    );
  }
  return action("long_tail_collectible_allowance", false, "WARN", -8, -5, "Collectible evidence is not strong enough for a confident BUY.");
}

export function highSaturationPenalty(facts: NormalizedMarketFacts, profile: CategoryBehaviorProfile): ResellerRuleAction {
  const massiveSaturation =
    facts.saturationRatio != null && facts.saturationRatio >= profile.maxSaturationRatio * 2;
  if (facts.saturationRatio == null || facts.saturationRatio <= profile.maxSaturationRatio) {
    return action("high_saturation_penalty", true, "INFO", 0, 0, "Saturation is within profile tolerance.");
  }
  return action(
    "high_saturation_penalty",
    false,
    massiveSaturation ? "BLOCKER" : "WARN",
    massiveSaturation ? -42 : -24,
    massiveSaturation ? -24 : -14,
    "Active market supply is too high relative to trusted sold comps."
  );
}

export function unrealisticRoiWarning(facts: NormalizedMarketFacts): ResellerRuleAction {
  if (facts.roi == null || facts.roi <= 400 || facts.trustedSoldCount >= 6) {
    return action("unrealistic_roi_warning", true, "INFO", 0, 0, "ROI is within evidence tolerance.");
  }
  return action(
    "unrealistic_roi_warning",
    false,
    "WARN",
    -15,
    -10,
    "Very high ROI with thin comp evidence is treated as fragile until manually verified."
  );
}

export function multipackMismatchWarning(facts: NormalizedMarketFacts): ResellerRuleAction {
  if ((!facts.isBundleDependent && !facts.bulkCompDetected) || facts.isMultipack) {
    return action("multipack_mismatch_warning", true, "INFO", 0, 0, "No multipack mismatch detected.");
  }
  return action("multipack_mismatch_warning", false, "WARN", -28, -18, "Comps may represent multipacks, lots, cases, or wholesale bundles while scan appears single-item.");
}

export function lowTicketSaturatedSkipRule(facts: NormalizedMarketFacts): ResellerRuleAction {
  const lowTicket = facts.averageSoldPrice != null && facts.averageSoldPrice < 20;
  const saturated = facts.saturationRatio != null && facts.saturationRatio >= 3;
  if (!lowTicket || !saturated) {
    return action("low_ticket_saturated_skip", true, "INFO", 0, 0, "Low-ticket saturation skip rule not active.");
  }
  return action("low_ticket_saturated_skip", false, "BLOCKER", -45, -25, "Low-ticket saturated retail is not worth sourcing after fees and shipping.");
}

export function dollarTreeProtectionRule(facts: NormalizedMarketFacts): ResellerRuleAction {
  const dollarTree = facts.sourceStoreType === "DOLLAR_TREE" || (facts.costBasis != null && facts.costBasis <= 1.5);
  if (!dollarTree) return action("dollar_tree_protection", true, "INFO", 0, 0, "Dollar Tree protection not active.");
  const impossibleShipping =
    facts.averageSoldPrice != null && (facts.shippingOverhead + facts.oversizedPenalty) / facts.averageSoldPrice > 0.35;
  const genericConsumable = facts.isConsumable && facts.titleMatchScore < 0.55;
  const bundleOnly = facts.isBundleDependent && !facts.isMultipack;
  const roiInflation = facts.roi != null && facts.roi > 250 && facts.trustedSoldCount < 6;
  if (impossibleShipping || genericConsumable || bundleOnly || roiInflation) {
    return action(
      "dollar_tree_protection",
      false,
      "BLOCKER",
      -55,
      -30,
      "Dollar Tree protection blocked unrealistic ROI, bundle-only economics, generic consumable risk, or impossible shipping."
    );
  }
  return action("dollar_tree_protection", true, "INFO", 0, 0, "Dollar Tree sanity checks passed.");
}

export function electronicsReturnRiskPenalty(facts: NormalizedMarketFacts, profile: CategoryBehaviorProfile): ResellerRuleAction {
  if (profile.profile !== "ELECTRONICS") {
    return action("electronics_return_risk_penalty", true, "INFO", 0, 0, "Electronics return-risk rule not active.");
  }
  if (!facts.returnRisk && !facts.incompleteListingRisk) {
    return action("electronics_return_risk_penalty", true, "INFO", 2, 0, "No electronics return or missing-accessory risk detected.");
  }
  return action(
    "electronics_return_risk_penalty",
    false,
    "WARN",
    facts.incompleteListingRisk ? -22 : -14,
    facts.incompleteListingRisk ? -16 : -10,
    "Electronics require stronger comp certainty because return risk, missing accessories, or incomplete condition can erase margin."
  );
}

export function runRules(facts: NormalizedMarketFacts, profile: CategoryBehaviorProfile): ResellerRuleAction[] {
  return [
    noSoldCompManualReview(facts),
    sparseEvidenceConfidencePenalty(facts, profile),
    weakIdentityPenalty(facts),
    dollarTreeLowTicketSuppression(facts),
    consumableBundleOnlyWarning(facts, profile),
    shippingFrictionPenalty(facts, profile),
    slowSellThroughPenalty(facts, profile),
    longTailCollectibleAllowance(facts, profile),
    highSaturationPenalty(facts, profile),
    lowTicketSaturatedSkipRule(facts),
    dollarTreeProtectionRule(facts),
    electronicsReturnRiskPenalty(facts, profile),
    unrealisticRoiWarning(facts),
    multipackMismatchWarning(facts)
  ];
}
