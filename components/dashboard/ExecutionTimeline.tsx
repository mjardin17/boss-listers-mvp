"use client";

import type { ExecutionQueueItem } from "./workflow";

const STEPS = ["SCAN", "ANALYZE", "VIEW OPPORTUNITY", "VIEW RISK", "SAVE TO INVENTORY", "CREATE LISTING DRAFT", "REVIEW", "APPROVE"];

export function ExecutionTimeline({ queue }: { queue: ExecutionQueueItem[] }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-200">Execution Timeline</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {STEPS.map((step, index) => (
          <span key={step} className={`rounded-md border px-3 py-2 text-xs font-bold ${index < 6 || queue.some((item) => item.status !== "PENDING") ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-zinc-800 bg-zinc-950 text-zinc-500"}`}>
            {step}
          </span>
        ))}
      </div>
    </section>
  );
}
