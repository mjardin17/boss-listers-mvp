"use client";

import type { ScanRecord } from "../../app/saas/schemas";
import { listingTitle, recommendationOf, riskLevelOf } from "./workflow";

export function RiskCenter({ scans, onQueue }: { scans: ScanRecord[]; onQueue: (scan: ScanRecord) => void }) {
  const risky = scans
    .filter((scan) => /high|risk|manual|skip|pass/i.test(`${riskLevelOf(scan.listing)} ${recommendationOf(scan.listing)}`))
    .slice(0, 8);

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-red-300">Risk Center</h2>
      <div className="mt-3 space-y-2">
        {risky.map((scan) => (
          <article key={scan.id} className="rounded-md border border-red-500/20 bg-red-950/20 p-3">
            <p className="line-clamp-2 text-sm font-semibold text-white">{listingTitle(scan.listing)}</p>
            <p className="mt-1 text-xs text-red-200">{riskLevelOf(scan.listing)} / {recommendationOf(scan.listing)}</p>
            <button onClick={() => onQueue(scan)} className="mt-3 rounded-md border border-red-400/40 px-3 py-2 text-xs font-bold text-red-100">
              Send to risk review
            </button>
          </article>
        ))}
        {!risky.length ? <p className="text-sm text-zinc-500">No high-risk scans in current history.</p> : null}
      </div>
    </section>
  );
}
