"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  Check,
  Loader2,
  Radar,
  Star
} from "lucide-react";
import { getSupabaseBrowserClient } from "../../saas/supabaseClient";
import { generateTopPerformingNiches } from "../../../lib/youtube-keywords/niches";
import { getTopPerformingNiches, trackNicheAction } from "./actions";
import type {
  CompetitionLevel,
  NicheMetric,
  NicheSortKey
} from "../../../lib/youtube-keywords/types";

type SortDirection = "asc" | "desc";

const columns: Array<{ key: NicheSortKey; label: string; align?: "left" | "right" }> = [
  { key: "nicheName", label: "Niche Name", align: "left" },
  { key: "category", label: "Category", align: "left" },
  { key: "avgCpm", label: "Est. CPM ($)" },
  { key: "marketDemandScore", label: "Market Demand" },
  { key: "competitionLevel", label: "Competition" },
  { key: "opportunityScore", label: "Opportunity Score" }
];

function competitionClasses(level: CompetitionLevel) {
  if (level === "Low") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
  }
  if (level === "Medium") {
    return "border-yellow-400/30 bg-yellow-400/10 text-yellow-100";
  }
  return "border-red-400/30 bg-red-400/10 text-red-200";
}

function competitionRank(level: CompetitionLevel) {
  if (level === "Low") return 1;
  if (level === "Medium") return 2;
  return 3;
}

async function getAccessToken() {
  if (process.env.NEXT_PUBLIC_PLAYWRIGHT_MOCK_SUPABASE === "1") {
    return "playwright-mock-token";
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  let session = (await supabase.auth.getSession()).data.session;
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }

  if (!session?.access_token) {
    throw new Error("Unable to start a Supabase session.");
  }

  return session.access_token;
}

export default function NicheExplorer() {
  const [niches, setNiches] = useState<NicheMetric[]>([]);
  const [trackedNiches, setTrackedNiches] = useState<Record<string, boolean>>({});
  const [trackingNiche, setTrackingNiche] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<NicheSortKey>("opportunityScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    let mounted = true;

    async function loadNiches() {
      if (process.env.NEXT_PUBLIC_PLAYWRIGHT_MOCK_SUPABASE === "1") {
        setNiches(generateTopPerformingNiches());
        setIsLoading(false);
        return;
      }

      const response = await getTopPerformingNiches();
      if (!mounted) return;

      if (!response.ok) {
        setError(response.error);
      } else {
        setNiches(response.data);
      }

      setIsLoading(false);
    }

    void loadNiches();

    return () => {
      mounted = false;
    };
  }, []);

  const sortedNiches = useMemo(() => {
    return [...niches].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;

      if (sortKey === "competitionLevel") {
        return (competitionRank(a.competitionLevel) - competitionRank(b.competitionLevel)) * direction;
      }

      const left = a[sortKey];
      const right = b[sortKey];

      if (typeof left === "string" && typeof right === "string") {
        return left.localeCompare(right) * direction;
      }

      return (Number(left) - Number(right)) * direction;
    });
  }, [niches, sortDirection, sortKey]);

  function handleSort(nextKey: NicheSortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(
      nextKey === "nicheName" || nextKey === "category" || nextKey === "competitionLevel"
        ? "asc"
        : "desc"
    );
  }

  async function handleTrack(niche: NicheMetric) {
    setError("");
    setTrackingNiche(niche.nicheName);

    try {
      if (
        process.env.NEXT_PUBLIC_PLAYWRIGHT_MOCK_SUPABASE === "1" ||
        !getSupabaseBrowserClient()
      ) {
        setTrackedNiches((current) => ({
          ...current,
          [niche.nicheName]: true
        }));
        return;
      }

      const accessToken = await getAccessToken();
      const response = await trackNicheAction(accessToken, niche);

      if (!response.ok) {
        setError(response.error);
        return;
      }

      setTrackedNiches((current) => ({
        ...current,
        [niche.nicheName]: true
      }));
    } catch (trackError) {
      setError(trackError instanceof Error ? trackError.message : "Unable to track niche.");
    } finally {
      setTrackingNiche("");
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <Link
              href="/keyword-research"
              className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-emerald-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to keywords
            </Link>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <Radar className="h-4 w-4" />
              Top Performing Niches
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">
              Discover monetizable YouTube niches.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              Compare estimated CPM, audience demand, competition, and opportunity
              signals for high-performing 2026 channel ideas.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-72">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                Niches
              </p>
              <p className="mt-1 text-2xl font-black text-white">{niches.length}</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                Tracked
              </p>
              <p className="mt-1 text-2xl font-black text-emerald-300">
                {Object.keys(trackedNiches).length}
              </p>
            </div>
          </div>
        </header>

        {error ? (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200">
            {error}
          </p>
        ) : null}

        <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 9 }).map((_, index) => (
                <div
                  key={index}
                  className="h-14 animate-pulse rounded-md bg-zinc-900"
                />
              ))}
            </div>
          ) : sortedNiches.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-sm">
                <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    {columns.map((column) => (
                      <th
                        key={column.key}
                        className={`px-4 py-3 font-black ${column.align === "left" ? "text-left" : "text-right"}`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSort(column.key)}
                          className={`inline-flex items-center gap-1 rounded-md px-1 py-1 transition hover:text-emerald-300 ${column.align === "left" ? "" : "float-right"}`}
                        >
                          {column.label}
                          {sortKey === column.key ? (
                            sortDirection === "asc" ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowDown className="h-3.5 w-3.5" />
                            )
                          ) : null}
                        </button>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right font-black">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedNiches.map((niche) => {
                    const isTracking = trackingNiche === niche.nicheName;
                    const isTracked = trackedNiches[niche.nicheName];

                    return (
                      <tr
                        key={`${niche.category}-${niche.nicheName}`}
                        className="border-t border-zinc-800 transition hover:bg-zinc-900/70"
                      >
                        <td className="px-4 py-4 font-bold text-white">
                          {niche.nicheName}
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-black text-zinc-200">
                            {niche.category}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-zinc-200">
                          ${niche.avgCpm.toFixed(2)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="font-black text-white">
                            {niche.marketDemandScore}
                          </span>
                          <span className="ml-1 text-zinc-500">/100</span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-black ${competitionClasses(niche.competitionLevel)}`}>
                            {niche.competitionLevel}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="inline-flex min-w-14 justify-center rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 font-black text-emerald-200">
                            {niche.opportunityScore}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleTrack(niche)}
                            disabled={isTracking || isTracked}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs font-black text-zinc-100 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-default disabled:border-emerald-400/30 disabled:text-emerald-300"
                          >
                            {isTracking ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isTracked ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Star className="h-4 w-4" />
                            )}
                            {isTracked ? "Tracked" : "Track Niche"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center px-4 text-center">
              <BarChart3 className="mb-4 h-10 w-10 text-zinc-700" />
              <p className="text-lg font-black text-white">No niches available</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                The niche discovery engine could not return data. Try refreshing the page.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
