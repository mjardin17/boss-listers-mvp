import { Suspense } from "react";
import { headers } from "next/headers";
import DashboardShell from "./DashboardShell";
import { CompsTableSkeleton, ProfitSummarySkeleton } from "./skeletons";
import { validateOrRepairNormalizedListing } from "../../lib/normalizedListingSchema";
import type { NormalizedListing } from "./types";

type DashboardPageProps = {
  searchParams?: {
    listingId?: string;
  };
};

async function getListing(listingId?: string): Promise<NormalizedListing | null> {
  if (!listingId) return null;

  const headerStore = headers();
  const host = headerStore.get("host");
  if (!host) return null;
  const protocol = headerStore.get("x-forwarded-proto") || "http";

  try {
    const response = await fetch(
      `${protocol}://${host}/api/analyze?listingId=${encodeURIComponent(listingId)}`,
      { cache: "no-store" }
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { ok?: boolean; listing?: NormalizedListing };
    return data.ok && data.listing
      ? validateOrRepairNormalizedListing(data.listing, "dashboard.fetch")
      : null;
  } catch {
    return null;
  }
}

async function DashboardContent({
  listingPromise
}: {
  listingPromise: Promise<NormalizedListing | null>;
}) {
  const listing = await listingPromise;
  return listing ? <DashboardShell initialListingData={listing} /> : null;
}

async function ErrorState({
  listingPromise
}: {
  listingPromise: Promise<NormalizedListing | null>;
}) {
  const listing = await listingPromise;
  if (listing) return null;

  return (
    <section className="rounded-lg border border-rose-400/30 bg-rose-950/30 p-5 text-rose-100">
      Unable to load listing analytics right now.
    </section>
  );
}

export default function DashboardPage({ searchParams }: DashboardPageProps) {
  const listingPromise = getListing(searchParams?.listingId);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header>
          <p className="text-sm font-medium text-emerald-300">Boss Listers</p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal">Analytics dashboard</h1>
        </header>

        <ErrorState listingPromise={listingPromise} />

        <Suspense
          fallback={
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="flex flex-col gap-6">
                <ProfitSummarySkeleton />
                <CompsTableSkeleton />
              </div>
              <div className="h-40 animate-pulse rounded-lg bg-zinc-900" />
            </div>
          }
        >
          <DashboardContent listingPromise={listingPromise} />
        </Suspense>
      </div>
    </main>
  );
}
