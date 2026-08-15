"use client";

import type { ExecutionQueueItem, ExecutionStatus } from "./workflow";

export function ListingQueue({ queue, onStatus }: { queue: ExecutionQueueItem[]; onStatus: (id: string, status: ExecutionStatus) => void }) {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-300">Execution Queue</h2>
      <div className="mt-3 space-y-2">
        {queue.map((item) => (
          <article key={item.id} className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-semibold text-white">{item.title}</p>
                <p className="mt-1 text-xs text-zinc-400">{item.action} / {item.platform} / {item.riskLevel}</p>
              </div>
              <span className="rounded-md bg-zinc-800 px-2 py-1 text-xs font-bold text-zinc-200">{item.status}</span>
            </div>
            {item.warnings.length ? <p className="mt-2 text-xs text-amber-200">{item.warnings[0]}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onStatus(item.id, "PROCESSING")}
                disabled={item.status === "PROCESSING" || item.status === "SYNCED"}
                className="rounded-md bg-emerald-300 px-3 py-2 text-xs font-black text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                Publish
              </button>
              <button
                type="button"
                onClick={() => onStatus(item.id, "PROCESSING")}
                disabled={item.status === "PROCESSING" || item.status === "SYNCED"}
                className="rounded-md bg-amber-300 px-3 py-2 text-xs font-black text-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                Delist
              </button>
              {item.status === "FAILED" ? (
                <button
                  type="button"
                  onClick={() => onStatus(item.id, "RETRYING")}
                  className="rounded-md bg-white px-3 py-2 text-xs font-black text-zinc-950"
                >
                  Retry Failed Job
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {!queue.length ? <p className="text-sm text-zinc-500">No queued human approvals.</p> : null}
      </div>
    </section>
  );
}
