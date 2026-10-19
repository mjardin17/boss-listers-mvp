"use client";

import { useEffect, useState } from "react";
import DashboardShell from "./DashboardShell";
import { CompsTableSkeleton, ProfitSummarySkeleton } from "./skeletons";
import { authedFetch, requireSession } from "../../lib/clientAuth";
import { validateOrRepairNormalizedListing } from "../../lib/normalizedListingSchema";
import type { NormalizedListing } from "./types";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; listing: NormalizedListing };

// /api/analyze now requires the logged-in user's bearer token, which only
// exists in the browser (localStorage), so the fetch has to run client-side.
export default function DashboardLoader({ listingId }: { listingId?: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!requireSession()) return;
      if (!listingId) {
        setState({ status: "error" });
        return;
      }
      try {
        const response = await authedFetch(
          `/api/analyze?listingId=${encodeURIComponent(listingId)}`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { ok?: boolean; listing?: NormalizedListing };
        if (cancelled) return;
        setState(
          data.ok && data.listing
            ? {
                status: "ready",
                listing: validateOrRepairNormalizedListing(data.listing, "dashboard.fetch")
              }
            : { status: "error" }
        );
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  if (state.status === "error") {
    return (
      <section className="rounded-lg border border-rose-400/30 bg-rose-950/30 p-5 text-rose-100">
        Unable to load listing analytics right now.
      </section>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <ProfitSummarySkeleton />
          <CompsTableSkeleton />
        </div>
        <div className="h-40 animate-pulse rounded-lg bg-zinc-900" />
      </div>
    );
  }

  return <DashboardShell initialListingData={state.listing} />;
}
