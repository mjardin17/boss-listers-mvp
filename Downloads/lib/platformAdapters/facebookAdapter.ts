import type { CrossListDraft } from "../crossListEngine/types";

export function adaptFacebookListing(draft: CrossListDraft): CrossListDraft {
  return {
    ...draft,
    description: `${draft.description} Local pickup or shipping can be arranged. Please review photos before purchase.`,
    metadata: { ...draft.metadata, tone: "local conversational" }
  };
}
