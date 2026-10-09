"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Brain,
  Check,
  Loader2,
  Radar,
  Search,
  Sparkles,
  TrendingUp
} from "lucide-react";
import { getSupabaseBrowserClient } from "../saas/supabaseClient";
import { generateKeywordMetrics } from "../../lib/youtube-keywords/scoring";
import {
  researchKeywordAction,
  saveKeywordAction
} from "./actions";
import type { KeywordMetric, SortKey } from "../../lib/youtube-keywords/types";

type SortDirection = "asc" | "desc";

const numberFormatter = new Intl.NumberFormat("en-US");

const columns: Array<{ key: SortKey; label: string; align?: "left" | "right" }> = [
  { key: "relatedKeyword", label: "Keyword", align: "left" },
  { key: "searchVolume", label: "Search Volume" },
  { key: "competitionIndex", label: "Competition" },
  { key: "magicScore", label: "Magic Score" }
];

async function getAccessToken() {
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

export default function KeywordResearchDashboard() {
  const [seedKeyword, setSeedKeyword] = useState("");
  const [results, setResults] = useState<KeywordMetric[]>([]);
  const [error, setError] = useState("");
  const [savedKeywords, setSavedKeywords] = useState<Record<string, boolean>>({});
  const [savingKeyword, setSavingKeyword] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("magicScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isPending, startTransition] = useTransition();

  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      const direction = sortDirection === "asc" ? 1 : -1;

      if (typeof left === "string" && typeof right === "string") {
        return left.localeCompare(right) * direction;
      }

      return (Number(left) - Number(right)) * direction;
    });
  }, [results, sortDirection, sortKey]);

  function handleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "relatedKeyword" ? "asc" : "desc");
  }

  function handleResearch() {
    setError("");
    startTransition(async () => {
      if (process.env.NEXT_PUBLIC_PLAYWRIGHT_MOCK_SUPABASE === "1") {
        setResults(generateKeywordMetrics(seedKeyword));
        return;
      }

      const response = await researchKeywordAction(seedKeyword);
      if (!response.ok) {
        setResults([]);
        setError(response.error);
        return;
      }

      setResults(response.data);
    });
  }

  async function handleSave(keyword: KeywordMetric) {
    setError("");
    setSavingKeyword(keyword.relatedKeyword);

    try {
      const accessToken = await getAccessToken();
      const response = await saveKeywordAction(accessToken, keyword);
      if (!response.ok) {
        setError(response.error);
        return;
      }

      setSavedKeywords((current) => ({
        ...current,
        [keyword.relatedKeyword]: true
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save keyword.");
    } finally {
      setSavingKeyword("");
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-300">
              <Sparkles className="h-4 w-4" />
              YouTube Keyword Research
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">
              Find low-competition video ideas.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              Research related YouTube keywords, compare mock demand signals, and save
              your best targets directly to Supabase.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/keyword-research/niches"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-4 text-sm font-bold text-zinc-100 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              <Radar className="h-4 w-4" />
              Top Niches
            </Link>
            <Link
              href="/keyword-research/council"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-4 text-sm font-bold text-zinc-100 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              <Brain className="h-4 w-4" />
              Council
            </Link>
            <Link
              href="/keyword-research/saved"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-4 text-sm font-bold text-zinc-100 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              <Bookmark className="h-4 w-4" />
              Saved List
            </Link>
          </div>
        </header>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 shadow-2xl shadow-black/20">
          <div className="flex flex-col gap-3 md:flex-row">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
              <input
                value={seedKeyword}
                onChange={(event) => setSeedKeyword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleResearch();
                }}
                placeholder="Enter a seed keyword, e.g. pickleball drills"
                className="min-h-14 w-full rounded-md border border-zinc-700 bg-neutral-950 py-3 pl-12 pr-4 text-base font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400"
              />
            </label>
            <button
              type="button"
              onClick={handleResearch}
              disabled={isPending}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-md bg-emerald-400 px-6 text-sm font-black text-neutral-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <TrendingUp className="h-5 w-5" />}
              Research
            </button>
          </div>
          {error ? (
            <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200">
              {error}
            </p>
          ) : null}
        </section>

        <section className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
          {isPending ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="h-14 animate-pulse rounded-md bg-zinc-900"
                />
              ))}
            </div>
          ) : sortedResults.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
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
                  {sortedResults.map((keyword) => {
                    const isSaving = savingKeyword === keyword.relatedKeyword;
                    const isSaved = savedKeywords[keyword.relatedKeyword];

                    return (
                      <tr
                        key={keyword.relatedKeyword}
                        className="border-t border-zinc-800 transition hover:bg-zinc-900/70"
                      >
                        <td className="px-4 py-4 font-bold text-white">
                          {keyword.relatedKeyword}
                          <span className="mt-1 block text-xs font-medium text-zinc-500">
                            Seed: {keyword.seedKeyword}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-zinc-200">
                          {numberFormatter.format(keyword.searchVolume)}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-zinc-200">
                          {keyword.competitionIndex.toFixed(2)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="inline-flex min-w-14 justify-center rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 font-black text-emerald-200">
                            {keyword.magicScore}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleSave(keyword)}
                            disabled={isSaving || isSaved}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-xs font-black text-zinc-100 transition hover:border-emerald-400 hover:text-emerald-200 disabled:cursor-default disabled:border-emerald-400/30 disabled:text-emerald-300"
                          >
                            {isSaving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isSaved ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Bookmark className="h-4 w-4" />
                            )}
                            {isSaved ? "Saved" : "Save"}
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
              <Search className="mb-4 h-10 w-10 text-zinc-700" />
              <p className="text-lg font-black text-white">No keyword research yet</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                Enter a seed keyword above to generate 10-15 related keyword
                opportunities with mock volume, competition, and Magic Score.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
