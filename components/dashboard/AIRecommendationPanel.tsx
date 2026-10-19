"use client";

import type { ScanRecord } from "../../app/saas/schemas";
import { listingTitle } from "./workflow";

export function AIRecommendationPanel({ scans }: { scans: ScanRecord[] }) {
  const latest = scans[0]?.listing;
  const agents = ((latest as any)?.aiAgentDecisions || []) as any[];
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-violet-300">AI Recommendation Panel</h2>
      {latest ? <p className="mt-2 text-sm font-semibold text-white">{listingTitle(latest)}</p> : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {agents.map((agent) => (
          <div key={agent.agent} className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-xs font-bold uppercase text-zinc-400">{agent.agent}</p>
            <p className="mt-1 text-sm text-zinc-200">{agent.recommendation || agent.strategy || agent.level || agent.velocity || "Telemetry evaluated"}</p>
          </div>
        ))}
        {!agents.length ? <p className="text-sm text-zinc-500">Agent recommendations appear after scans with telemetry.</p> : null}
      </div>
    </section>
  );
}
