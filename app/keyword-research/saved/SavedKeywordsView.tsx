"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bookmark, Loader2 } from "lucide-react";
import { getSupabaseBrowserClient } from "../../saas/supabaseClient";
import { getSavedKeywordsAction } from "../actions";
import type { SavedKeyword } from "../../../lib/youtube-keywords/types";

const numberFormatter = new Intl.NumberFormat("en-US");

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

export default function SavedKeywordsView() {
  const [keywords, setKeywords] = useState<SavedKeyword[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadSavedKeywords() {
      try {
        const accessToken = await getAccessToken();
        const response = await getSavedKeywordsAction(accessToken);

        if (!mounted) return;
        if (!response.ok) {
          setError(response.error);
          return;
        }

        setKeywords(response.data);
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load keywords.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void loadSavedKeywords();

    return () => {
      mounted = false;
    };
  }, []);

  const averageScore = useMemo(() => {
    if (!keywords.length) return 0;
    return Math.round(
      keywords.reduce((total, keyword) => total + keyword.magicScore, 0) / keywords.length
    );
  }, [keywords]);

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
              Back to research
            </Link>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">
              Saved keyword list
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              Keywords saved through RLS-protected Supabase writes.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-64">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Saved</p>
              <p className="mt-1 text-2xl font-black text-white">{keywords.length}</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                Avg. Score
              </p>
              <p className="mt-1 text-2xl font-black text-emerald-300">{averageScore}</p>
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
            <div className="flex min-h-64 items-center justify-center gap-3 text-sm font-bold text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading saved keywords
            </div>
          ) : keywords.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-black">Keyword</th>
                    <th className="px-4 py-3 text-left font-black">Seed</th>
                    <th className="px-4 py-3 text-right font-black">Volume</th>
                    <th className="px-4 py-3 text-right font-black">Competition</th>
                    <th className="px-4 py-3 text-right font-black">Magic Score</th>
                  </tr>
                </thead>
                <tbody>
                  {keywords.map((keyword) => (
                    <tr
                      key={keyword.id}
                      className="border-t border-zinc-800 transition hover:bg-zinc-900/70"
                    >
                      <td className="px-4 py-4 font-bold text-white">
                        {keyword.relatedKeyword}
                      </td>
                      <td className="px-4 py-4 font-semibold text-zinc-300">
                        {keyword.seedKeyword}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center px-4 text-center">
              <Bookmark className="mb-4 h-10 w-10 text-zinc-700" />
              <p className="text-lg font-black text-white">No saved keywords yet</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                Run a search and save promising rows to build your keyword list.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
