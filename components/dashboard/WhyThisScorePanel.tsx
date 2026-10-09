"use client";

import type { ScanRecord } from "../../app/saas/schemas";
import { buildBuyDecision } from "../../lib/decisionEngine/decisionScore";

const riskClass: Record<string, string> = {
  LOW: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  MEDIUM: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  HIGH: "border-red-500/30 bg-red-500/10 text-red-200"
};

export function WhyThisScorePanel({ scans }: { scans: ScanRecord[] }) {
  const latest = scans[0]?.listing;
  if (!latest) return null;
  const decision = buildBuyDecision({ listing: latest });
  const missing = latest.missingDataPoints || [];
  const degradation = ((latest.resellerEngineTelemetry as any)?.confidenceDegradationReasons || []) as string[];

  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-900 p-4" open>
      <summary className="cursor-pointer text-sm font-bold uppercase tracking-wide text-zinc-100">
        Why This Score
      </summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <span className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200">
          {decision.decisionState}
        </span>
        <span className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200">
          Confidence {decision.confidenceScore}%
        </span>
        <span className={`rounded-md border px-3 py-2 text-xs ${riskClass[decision.inventoryRisk] || riskClass.HIGH}`}>
          Risk {decision.inventoryRisk}
        </span>
        <span className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200">
          Competition {decision.competitionLevel}
        </span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <div>
          <p className="text-xs font-bold uppercase text-zinc-500">Decision reasons</p>
          <ul className="mt-2 space-y-1">
            {decision.recommendationReasoning.map((reason) => (
              <li key={reason} className="text-xs text-zinc-300">{reason}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-zinc-500">Confidence reductions</p>
          <ul className="mt-2 space-y-1">
            {(degradation.length ? degradation : ["No explicit degradation reasons recorded."]).slice(0, 5).map((reason) => (
              <li key={reason} className="text-xs text-amber-200">{reason}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase text-zinc-500">Missing evidence</p>
          <ul className="mt-2 space-y-1">
            {(missing.length ? missing : ["No missing evidence listed."]).slice(0, 5).map((item) => (
              <li key={item} className="text-xs text-red-200">{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
