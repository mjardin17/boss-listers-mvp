import type { CrossListDraft } from "../crossListEngine/types";

const STUFFING = /\b(rare|wow|l@@k|must see|free shipping)\b|!!!/i;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateAdaptedListing(draft: CrossListDraft): ValidationResult {
  const errors = [
    draft.title ? "" : "Missing title.",
    draft.title.length > draft.metadata.titleLimit ? "Title exceeds platform limit." : "",
    draft.metadata.requiresBrand && !draft.bulletPoints.some((bullet) => bullet.toLowerCase().startsWith("brand:"))
      ? "Verified brand required."
      : ""
  ].filter(Boolean);
  const warnings = [
    STUFFING.test(`${draft.title} ${draft.description}`) ? "Potential keyword stuffing or unsafe formatting." : "",
    draft.category.toLowerCase() === "uncategorized" ? "Category should be mapped before publishing." : "",
    draft.metadata.warnings.length ? draft.metadata.warnings[0] : ""
  ].filter(Boolean);
  return { valid: errors.length === 0, errors, warnings };
}
