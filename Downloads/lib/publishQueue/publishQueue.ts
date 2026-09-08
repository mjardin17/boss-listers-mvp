import type { CrossListDraft } from "../crossListEngine/types";
import { createPublishJob } from "./publishJob";
import { processPublishJobs } from "./queueProcessor";

export function buildPublishQueue({ internalSku, drafts }: { internalSku: string; drafts: CrossListDraft[] }) {
  const jobs = drafts.map((draft) => createPublishJob({ internalSku, draft }));
  const { processed, deadLetters } = processPublishJobs(jobs);
  return {
    jobs,
    processedJobs: processed,
    deadLetters,
    summary: {
      queued: jobs.length,
      synchronized: processed.filter((job) => job.publishState === "synchronized").length,
      failed: processed.filter((job) => job.publishState === "failed" || job.publishState === "not_implemented").length,
      deadLettered: deadLetters.length
    }
  };
}
