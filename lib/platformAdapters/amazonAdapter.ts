import type { CrossListDraft } from "../crossListEngine/types";

export function adaptAmazonListing(draft: CrossListDraft): CrossListDraft {
  const bulletPoints = draft.bulletPoints.length ? draft.bulletPoints : ["Verify brand, model, and condition before publishing."];
  return {
    ...draft,
    description: bulletPoints.join("\n"),
    bulletPoints,
    metadata: { ...draft.metadata, tone: "structured catalog detail" }
  };
}
