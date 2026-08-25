import type { CrossListDraft } from "../crossListEngine/types";

export interface PoshmarkDraftPayload {
  title: string;
  description: string;
  price: number;
  sku: string;
  upc: string;
  condition: string;
}

export function adaptPoshmarkListing(draft: CrossListDraft): CrossListDraft {
  return {
    ...draft,
    title: draft.title.slice(0, 50),
    description: `${draft.description} Cross-listed inventory item. Review photos and condition before purchase.`,
    metadata: { ...draft.metadata, titleLimit: 50, tone: "closet-style marketplace" }
  };
}

export function mapToPoshmarkDraft({
  draft,
  price,
  sku,
  upc,
  condition
}: {
  draft: CrossListDraft;
  price: number;
  sku?: string;
  upc?: string;
  condition?: string;
}): PoshmarkDraftPayload {
  const adapted = adaptPoshmarkListing(draft);
  return {
    title: adapted.title,
    description: adapted.description,
    price,
    sku: sku || "",
    upc: upc || "",
    condition: condition || "New"
  };
}

export function validatePoshmarkDraftPayload(payload: PoshmarkDraftPayload) {
  const errors = [
    payload.title ? "" : "Missing Poshmark title.",
    payload.title.length > 50 ? "Poshmark title exceeds 50 characters." : "",
    Number.isFinite(payload.price) && payload.price > 0 ? "" : "Poshmark price is required.",
    payload.condition ? "" : "Poshmark condition is required."
  ].filter(Boolean);

  return {
    valid: errors.length === 0,
    errors
  };
}
