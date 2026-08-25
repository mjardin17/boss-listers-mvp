import type { CrossListDraft } from "../crossListEngine/types";

export interface MercariDraftPayload {
  name: string;
  description: string;
  price: number;
  upc: string;
  condition: string;
}

function truncateAtWord(value: string, limit: number) {
  if (value.length <= limit) return value;
  const sliced = value.slice(0, limit + 1);
  return (sliced.slice(0, sliced.lastIndexOf(" ")) || value.slice(0, limit)).trim();
}

export function adaptMercariListing(draft: CrossListDraft): CrossListDraft {
  const name = truncateAtWord(draft.title, 40);
  return {
    ...draft,
    title: name,
    description: `${draft.description} Ships carefully packed. Message with questions before buying.`,
    metadata: { ...draft.metadata, titleLimit: 40, tone: "casual fast-shipping" }
  };
}

export function mapToMercariDraft({
  draft,
  price,
  upc,
  condition
}: {
  draft: CrossListDraft;
  price: number;
  upc?: string;
  condition?: string;
}): MercariDraftPayload {
  const adapted = adaptMercariListing(draft);
  return {
    name: adapted.title,
    description: adapted.description,
    price,
    upc: upc || "",
    condition: condition || "New"
  };
}

export function validateMercariDraftPayload(mercariPayload: MercariDraftPayload) {
  const errors = [
    mercariPayload.name ? "" : "Missing Mercari title.",
    mercariPayload.name.length > 40 ? "Mercari title exceeds 40 characters." : "",
    Number.isFinite(mercariPayload.price) && mercariPayload.price > 0 ? "" : "Mercari price is required.",
    mercariPayload.condition ? "" : "Mercari condition is required."
  ].filter(Boolean);

  return {
    valid: errors.length === 0,
    errors
  };
}
