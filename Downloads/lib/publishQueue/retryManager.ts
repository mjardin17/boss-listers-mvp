import type { PublishJob } from "./publishJob";

export const MAX_RETRY_COUNT = 3;

export function nextRetryDelayMs(retryCount: number) {
  return Math.min(60_000, 1_000 * Math.pow(2, Math.max(0, retryCount)));
}

export function markForRetry(job: PublishJob, reason: string): PublishJob {
  const retryCount = job.retryCount + 1;
  return {
    ...job,
    retryCount,
    publishState: retryCount > MAX_RETRY_COUNT ? "failed" : "retrying",
    failureReasons: [...job.failureReasons, reason],
    timestamps: {
      ...job.timestamps,
      updatedAt: new Date(0).toISOString()
    }
  };
}
