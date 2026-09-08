import type { CrossListDraft, CrossListPlatform } from "../crossListEngine/types";

export type PublishState =
  | "queued"
  | "validating"
  | "adapting"
  | "publishing"
  | "published"
  | "failed"
  | "retrying"
  | "synchronized"
  | "not_implemented";

export interface PublishJob {
  id: string;
  internalSku: string;
  targetPlatform: CrossListPlatform;
  adaptedPayload: CrossListDraft;
  validationStatus: "valid" | "invalid";
  retryCount: number;
  publishState: PublishState;
  timestamps: {
    queuedAt: string;
    updatedAt: string;
  };
  failureReasons: string[];
}

export function createPublishJob({ internalSku, draft }: { internalSku: string; draft: CrossListDraft }): PublishJob {
  const valid = draft.metadata.publishReady && draft.metadata.warnings.length === 0;
  return {
    id: `job-${internalSku}-${draft.platform}`,
    internalSku,
    targetPlatform: draft.platform,
    adaptedPayload: draft,
    validationStatus: valid ? "valid" : "invalid",
    retryCount: 0,
    publishState: "queued",
    timestamps: {
      queuedAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    },
    failureReasons: valid ? [] : draft.metadata.warnings
  };
}
