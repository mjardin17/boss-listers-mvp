import { toDeadLetter } from "./deadLetterQueue";
import type { PublishJob } from "./publishJob";

export function processPublishJob(job: PublishJob): PublishJob {
  if (job.validationStatus === "invalid") {
    return {
      ...job,
      publishState: "failed",
      timestamps: { ...job.timestamps, updatedAt: new Date(0).toISOString() }
    };
  }
  return {
    ...job,
    publishState: "not_implemented",
    timestamps: { ...job.timestamps, updatedAt: new Date(0).toISOString() },
    failureReasons: [
      ...job.failureReasons,
      "NOT_IMPLEMENTED: live marketplace API publishing is unavailable."
    ]
  };
}

export function processPublishJobs(jobs: PublishJob[]) {
  const processed = jobs.map(processPublishJob);
  return {
    processed,
    deadLetters: processed.map(toDeadLetter).filter((item): item is NonNullable<typeof item> => Boolean(item))
  };
}
