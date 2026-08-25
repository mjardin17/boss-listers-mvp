"use client";

import type { ScanRecord } from "../../app/saas/schemas";

export function MarketPulse({ scans }: { scans: ScanRecord[] }) {
  const trusted = scans.reduce((sum, scan) => sum + Number(scan.listing.trustedCompSummary?.acceptedComps || 0), 0);
  const rejected = scans.reduce((sum, scan) => sum + Number(scan.listing.trustedCompSummary?.rejectedComps || 0), 0);
  const risk = scans.filter((scan) => Number(scan.listing.confidenceScore || 0) < 40).length;
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-300">Market Pulse</h2>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <span className="rounded-md bg-zinc-950 px-3 py-2">Trusted {trusted}</span>
        <span className="rounded-md bg-zinc-950 px-3 py-2">Rejected {rejected}</span>
        <span className="rounded-md bg-zinc-950 px-3 py-2">Risk {risk}</span>
      </div>
    </section>
  );
}
