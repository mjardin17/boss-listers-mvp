"use client";

import type { ExecutionQueueItem } from "./workflow";

function countJobs(queue: ExecutionQueueItem[]) {
  return {
    Pending: queue.filter((item) => item.status === "PENDING" || item.status === "APPROVED").length,
    Processing: queue.filter((item) => item.status === "PROCESSING" || item.status === "RETRYING").length,
    Success: queue.filter((item) => item.status === "PUBLISHED" || item.status === "SYNCED").length,
    Failed: queue.filter((item) => item.status === "FAILED").length
  };
}

export function SyncJobsDashboard({ queue }: { queue: ExecutionQueueItem[] }) {
  const counts = countJobs(queue);
  const cards = [
    { label: "Pending", value: counts.Pending, className: "text-zinc-100" },
    { label: "Processing", value: counts.Processing, className: "text-sky-300" },
    { label: "Success", value: counts.Success, className: "text-emerald-300" },
    { label: "Failed", value: counts.Failed, className: "text-red-300" }
  ];

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-100">Sync Jobs Dashboard</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-xs text-zinc-500">{card.label}</p>
            <p className={`mt-1 text-2xl font-black ${card.className}`}>{card.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
