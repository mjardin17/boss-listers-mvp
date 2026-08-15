"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Brain,
  Building2,
  CircleDollarSign,
  Clock3,
  Loader2,
  Network,
  Send,
  Sparkles
} from "lucide-react";
import { getSupabaseBrowserClient } from "../../saas/supabaseClient";
import { getCouncilConsultations, submitToCouncil } from "./actions";
import type {
  CouncilConsultation,
  CouncilExpertResponse,
  CouncilPersonaName
} from "../../../lib/youtube-keywords/types";

const samplePrompt =
  "I want to build a YouTube channel around AI automations for small businesses, publish weekly tutorials, sell templates, and use Shorts to drive traffic into longer case-study videos.";

function personaIcon(personaName: CouncilPersonaName) {
  if (personaName === "The Financial Analyst") return CircleDollarSign;
  if (personaName === "The Architect") return Network;
  return Brain;
}

function personaAccent(personaName: CouncilPersonaName) {
  if (personaName === "The Financial Analyst") {
    return {
      border: "border-amber-400/25",
      bg: "bg-amber-400/10",
      text: "text-amber-200",
      ring: "stroke-amber-300"
    };
  }

  if (personaName === "The Architect") {
    return {
      border: "border-sky-400/25",
      bg: "bg-sky-400/10",
      text: "text-sky-200",
      ring: "stroke-sky-300"
    };
  }

  return {
    border: "border-emerald-400/25",
    bg: "bg-emerald-400/10",
    text: "text-emerald-200",
    ring: "stroke-emerald-300"
  };
}

function renderMarkdownText(markdown: string) {
  return markdown.split("\n").filter(Boolean).map((line, index) => {
    const boldMatch = line.match(/^\*\*(.+?):\*\*\s?(.*)$/);

    if (boldMatch) {
      return (
        <p key={`${line}-${index}`} className="text-sm leading-6 text-zinc-300">
          <span className="font-black text-white">{boldMatch[1]}:</span>{" "}
          {boldMatch[2]}
        </p>
      );
    }

    return (
      <p key={`${line}-${index}`} className="text-sm leading-6 text-zinc-300">
        {line}
      </p>
    );
  });
}

function ScoreRing({ score, accentClass }: { score: number; accentClass: string }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 56 56" className="h-16 w-16 -rotate-90">
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          strokeWidth="5"
          className="stroke-zinc-800"
        />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={accentClass}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-white">
        {score}
      </span>
    </div>
  );
}

function ExpertCard({ response }: { response: CouncilExpertResponse }) {
  const Icon = personaIcon(response.personaName);
  const accent = personaAccent(response.personaName);

  return (
    <article className={`rounded-lg border ${accent.border} bg-zinc-950 p-5 shadow-2xl shadow-black/20`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-md border ${accent.border} ${accent.bg}`}>
            <Icon className={`h-5 w-5 ${accent.text}`} />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-black text-white">{response.personaName}</h2>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {response.title}
            </p>
          </div>
        </div>
        <ScoreRing score={response.actionabilityScore} accentClass={accent.ring} />
      </div>
      <div className="mt-5 space-y-3">{renderMarkdownText(response.feedback)}</div>
    </article>
  );
}

async function getAccessToken() {
  if (process.env.NEXT_PUBLIC_PLAYWRIGHT_MOCK_SUPABASE === "1") {
    return "playwright-mock-token";
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return "";

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

export default function CouncilDashboard() {
  const [prompt, setPrompt] = useState("");
  const [activeConsultation, setActiveConsultation] = useState<CouncilConsultation | null>(null);
  const [history, setHistory] = useState<CouncilConsultation[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          if (mounted) setIsHistoryLoading(false);
          return;
        }

        const response = await getCouncilConsultations(accessToken);
        if (!mounted) return;

        if (response.ok) {
          setHistory(response.data);
        } else {
          setError(response.error);
        }
      } catch (historyError) {
        if (!mounted) return;
        setError(
          historyError instanceof Error
            ? historyError.message
            : "Unable to load council history."
        );
      } finally {
        if (mounted) setIsHistoryLoading(false);
      }
    }

    void loadHistory();

    return () => {
      mounted = false;
    };
  }, []);

  const averageActionability = useMemo(() => {
    const responses = activeConsultation?.expertResponses || [];
    if (!responses.length) return 0;
    return Math.round(
      responses.reduce((total, response) => total + response.actionabilityScore, 0) /
        responses.length
    );
  }, [activeConsultation]);

  async function handleSubmit() {
    setError("");
    setIsSubmitting(true);

    try {
      const accessToken = await getAccessToken();
      const response = await submitToCouncil(prompt, accessToken);

      if (!response.ok) {
        setError(response.error);
        return;
      }

      setActiveConsultation(response.data);
      setHistory((current) => [response.data, ...current.filter((item) => item.id !== response.data.id)]);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to convene the council."
      );
    } finally {
      setIsSubmitting(false);
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
              <Sparkles className="h-4 w-4" />
              AI Council Advisory Dashboard
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">
              Convene your strategy council.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
              Submit a business, creator, or content strategy and receive structured
              feedback from specialized advisory personas.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-72">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                Sessions
              </p>
              <p className="mt-1 text-2xl font-black text-white">{history.length}</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                Avg. Score
              </p>
              <p className="mt-1 text-2xl font-black text-emerald-300">
                {averageActionability || "--"}
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4 shadow-2xl shadow-black/20">
            <label className="text-sm font-black text-white" htmlFor="council-prompt">
              Strategy Brief
            </label>
            <textarea
              id="council-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={samplePrompt}
              className="mt-3 min-h-52 w-full resize-y rounded-md border border-zinc-700 bg-neutral-950 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400"
            />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold text-zinc-500">
                {prompt.trim().length}/4000 characters
              </p>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || prompt.trim().length < 20}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-emerald-400 px-5 text-sm font-black text-neutral-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                Convene the Council
              </button>
            </div>
            {error ? (
              <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-200">
                {error}
              </p>
            ) : null}
            {!getSupabaseBrowserClient() ? (
              <p className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-100">
                Supabase is not configured. Council feedback will run in preview mode and will not be saved.
              </p>
            ) : null}
          </div>

          <aside className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-4 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-emerald-300" />
              <h2 className="text-sm font-black text-white">Recent Sessions</h2>
            </div>
            {isHistoryLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-14 animate-pulse rounded-md bg-zinc-900" />
                ))}
              </div>
            ) : history.length ? (
              <div className="space-y-2">
                {history.slice(0, 6).map((consultation) => (
                  <button
                    key={consultation.id}
                    type="button"
                    onClick={() => setActiveConsultation(consultation)}
                    className="block w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-3 text-left transition hover:border-emerald-400/50"
                  >
                    <span className="line-clamp-2 text-xs font-semibold leading-5 text-zinc-200">
                      {consultation.userPrompt}
                    </span>
                    <span className="mt-2 block text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      {new Date(consultation.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-zinc-500">
                No saved council sessions yet. Submit a strategy brief to create the first one.
              </p>
            )}
          </aside>
        </section>

        {isSubmitting ? (
          <section className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-6">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="relative flex h-20 w-20 items-center justify-center">
                <span className="absolute h-full w-full animate-ping rounded-full border border-emerald-300/40" />
                <span className="absolute h-14 w-14 animate-pulse rounded-full bg-emerald-400/20" />
                <Building2 className="relative h-8 w-8 text-emerald-200" />
              </div>
              <div>
                <p className="text-lg font-black text-white">The council is in session</p>
                <p className="mt-2 text-sm text-emerald-100">
                  Strategy, finance, and systems perspectives are being synthesized.
                </p>
              </div>
            </div>
          </section>
        ) : activeConsultation ? (
          <section className="grid gap-5 lg:grid-cols-3">
            {activeConsultation.expertResponses.map((response) => (
              <ExpertCard key={response.personaName} response={response} />
            ))}
          </section>
        ) : (
          <section className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 px-4 text-center">
            <Brain className="mb-4 h-10 w-10 text-zinc-700" />
            <p className="text-lg font-black text-white">Awaiting a strategy brief</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
              The council will return three expert cards with positioning, monetization,
              and automation guidance.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
