"use client";

import type { ScanRecord } from "../../app/saas/schemas";
import { listingTitle, profitOf, recommendationOf, velocityOf } from "../dashboard/workflow";

export function OpportunityAlerts({ scans }: { scans: ScanRecord[] }) {
  const alerts = scans
    .flatMap((scan) => {
      const profit = profitOf(scan.listing) || 0;
      const velocity = String(velocityOf(scan.listing));
      const rec = recommendationOf(scan.listing);
      return [
        profit >= 20 ? { label: "HIGH MARGIN", scan } : null,
        /FAST|HIGH/.test(velocity) ? { label: "FAST MOVER", scan } : null,
        /LONG/.test(rec) ? { label: "LONG TAIL", scan } : null,
        /RISK|SKIP|PASS|MANUAL/.test(rec) || Number(scan.listing.confidenceScore || 0) < 35 ? { label: "HIGH RISK", scan } : null,
        Number(scan.listing.trustedCompSummary?.saturationRatio || 0) <= 1 && Number(scan.listing.trustedCompSummary?.soldCount || 0) > 0 ? { label: "LOW COMPETITION", scan } : null
      ].filter(Boolean);
    })
    .slice(0, 10) as { label: string; scan: ScanRecord }[];

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-amber-300">Opportunity Alerts</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {alerts.map((alert) => (
          <span key={`${alert.label}-${alert.scan.id}`} className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-100">
            {alert.label}: {listingTitle(alert.scan.listing).slice(0, 28)}
          </span>
        ))}
        {!alerts.length ? <p className="text-sm text-zinc-500">No live opportunity alerts.</p> : null}
      </div>
    </section>
  );
}
