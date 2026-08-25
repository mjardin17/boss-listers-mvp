import type { CrossListDraft } from "../crossListEngine/types";

export interface EbayDraftPayload {
  title: string;
  description: string;
  price: number;
  upc: string;
  condition: string;
}

export function adaptEbayListing(draft: CrossListDraft): CrossListDraft {
  return {
    ...draft,
    title: draft.title.slice(0, 80),
    description: `${draft.description}\n\nCondition: See photos for exact item condition. Returns: buyer may request return according to seller policy.`,
    metadata: { ...draft.metadata, tone: "SEO-heavy resale marketplace" }
  };
}

export function mapToEbayDraft({
  draft,
  price,
  upc,
  condition
}: {
  draft: CrossListDraft;
  price: number;
  upc?: string;
  condition?: string;
}): EbayDraftPayload {
  const adapted = adaptEbayListing(draft);
  return {
    title: adapted.title,
    description: adapted.description,
    price,
    upc: upc || "",
    condition: condition || "New"
  };
}

export function validateEbayDraftPayload(ebayPayload: EbayDraftPayload) {
  const errors = [
    ebayPayload.title ? "" : "Missing eBay title.",
    ebayPayload.title.length > 80 ? "eBay title exceeds 80 characters." : "",
    Number.isFinite(ebayPayload.price) && ebayPayload.price > 0 ? "" : "eBay price is required.",
    ebayPayload.condition ? "" : "eBay condition is required."
  ].filter(Boolean);

  return {
    valid: errors.length === 0,
    errors
  };
}
