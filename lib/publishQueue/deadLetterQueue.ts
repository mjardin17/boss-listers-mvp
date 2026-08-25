import { MAX_RETRY_COUNT } from "./retryManager";
import type { PublishJob } from "./publishJob";

export interface DeadLetterEntry {
  job: PublishJob;
  reason: string;
  movedAt: string;
}

export function toDeadLetter(job: PublishJob): DeadLetterEntry | null {
  if (job.validationStatus === "invalid") {
    return { job, reason: "Validation failed before adapter execution.", movedAt: new Date(0).toISOString() };
  }
  if (job.retryCount > MAX_RETRY_COUNT) {
    return { job, reason: "Retry cap exceeded.", movedAt: new Date(0).toISOString() };
  }
  return null;
}
