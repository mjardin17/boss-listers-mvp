"use client";

import { useMemo, useState } from "react";
import { useBossListersAuth } from "../../saas/userSession";

type KdpMetadata = {
  title: string;
  subtitle: string;
  authorName: string;
  language: string;
  genre: string;
  audience: string;
  descriptionPlain: string;
  descriptionHtml: string;
  authorBio: string;
  categories: Array<{ path: string; rationale: string }>;
  keywords: string[];
  series?: {
    title: string;
    subtitle: string;
    description: string;
    readingOrder: Array<{ title: string; position: number }>;
  };
  trimSize: string;
  complianceWarnings: string[];
};

type PackageResponse = {
  ok: boolean;
  metadata?: KdpMetadata;
  persisted?: {
    authorId: string;
    seriesId: string | null;
    bookId: string;
    packageId: string;
  } | null;
  error?: string;
};

const EXPORTS = [
  { type: "pdf", label: "PDF" },
  { type: "epub", label: "EPUB" },
  { type: "docx", label: "DOCX" },
  { type: "metadata", label: "Metadata" }
] as const;

export default function PublishingPage() {
  const auth = useBossListersAuth();
  const [penName, setPenName] = useState("");
  const [authorBio, setAuthorBio] = useState("");
  const [brandVoice, setBrandVoice] = useState("");
  const [seriesTitle, setSeriesTitle] = useState("");
  const [seriesDescription, setSeriesDescription] = useState("");
  const [seriesNumber, setSeriesNumber] = useState("1");
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [genre, setGenre] = useState("");
  const [audience, setAudience] = useState("");
  const [trimSize, setTrimSize] = useState<"5x8" | "5.5x8.5" | "6x9">("6x9");
  const [manuscript, setManuscript] = useState("");
  const [metadata, setMetadata] = useState<KdpMetadata | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const payload = useMemo(
    () => ({
      userId: auth.userId,
      author: {
        penName,
        bio: authorBio,
        brandVoice
      },
      series: seriesTitle
        ? {
            title: seriesTitle,
            description: seriesDescription,
            genre,
            targetReader: audience,
            seriesNumber: Number(seriesNumber) || 1
          }
        : undefined,
      book: {
        title,
        subtitle,
        language: "en",
        genre,
        audience,
        trimSize,
        manuscript
      }
    }),
    [
      audience,
      authorBio,
      auth.userId,
      brandVoice,
      genre,
      manuscript,
      penName,
      seriesDescription,
      seriesNumber,
      seriesTitle,
      subtitle,
      title,
      trimSize
    ]
  );

  async function generatePackage() {
    setError("");
    setStatus("Generating package...");
    const response = await fetch("/api/kdp/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = (await response.json()) as PackageResponse;
    if (!response.ok || !data.ok || !data.metadata) {
      setStatus("");
      setError(data.error || "Unable to generate KDP package.");
      return;
    }
    setMetadata(data.metadata);
    setStatus(data.persisted ? "Package generated and saved." : "Package generated.");
  }

  async function downloadExport(type: (typeof EXPORTS)[number]["type"]) {
    setError("");
    setStatus(`Generating ${type.toUpperCase()} export...`);
    const response = await fetch(`/api/kdp/exports/${type}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setStatus("");
      setError(data.error || `Unable to generate ${type.toUpperCase()} export.`);
      return;
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || `storyforge-kdp.${type}`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus(`${type.toUpperCase()} export generated.`);
  }

  const canGenerate = penName.trim() && title.trim() && manuscript.trim();

  return (
    <main className="min-h-screen bg-zinc-950 px-4 pb-24 pt-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.75fr)]">
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">
                StoryForge KDP Publishing Suite
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-normal text-white">
                Publishing package builder
              </h1>
            </div>
            <select
              value={trimSize}
              onChange={(event) => setTrimSize(event.target.value as typeof trimSize)}
              className="min-h-10 rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-white"
            >
              <option value="5x8">5 x 8</option>
              <option value="5.5x8.5">5.5 x 8.5</option>
              <option value="6x9">6 x 9</option>
            </select>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Author Pen Name" value={penName} onChange={setPenName} />
            <Field label="Author Brand Voice" value={brandVoice} onChange={setBrandVoice} />
            <Textarea label="Author Bio" value={authorBio} onChange={setAuthorBio} rows={4} />
            <Textarea label="Series Description" value={seriesDescription} onChange={setSeriesDescription} rows={4} />
            <Field label="Series Title" value={seriesTitle} onChange={setSeriesTitle} />
            <Field label="Series Number" value={seriesNumber} onChange={setSeriesNumber} />
            <Field label="Book Title" value={title} onChange={setTitle} />
            <Field label="Subtitle" value={subtitle} onChange={setSubtitle} />
            <Field label="Genre" value={genre} onChange={setGenre} />
            <Field label="Target Reader" value={audience} onChange={setAudience} />
          </div>

          <div className="mt-4">
            <Textarea label="Manuscript" value={manuscript} onChange={setManuscript} rows={18} />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={!canGenerate}
              onClick={generatePackage}
              className="min-h-11 rounded-md bg-emerald-400 px-4 text-sm font-black text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            >
              Generate KDP Package
            </button>
            {EXPORTS.map((entry) => (
              <button
                key={entry.type}
                type="button"
                disabled={!canGenerate}
                onClick={() => downloadExport(entry.type)}
                className="min-h-11 rounded-md border border-zinc-700 bg-zinc-950 px-4 text-sm font-bold text-zinc-100 transition hover:border-emerald-300 disabled:cursor-not-allowed disabled:text-zinc-600"
              >
                Export {entry.label}
              </button>
            ))}
          </div>
          {status ? <p className="mt-4 text-sm font-semibold text-emerald-200">{status}</p> : null}
          {error ? <p className="mt-4 text-sm font-semibold text-rose-200">{error}</p> : null}
        </section>

        <aside className="flex flex-col gap-4">
          <MetadataPanel metadata={metadata} />
        </aside>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold normal-case tracking-normal text-white outline-none focus:border-emerald-300"
      />
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  rows
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
}) {
  return (
    <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500">
      {label}
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm font-medium normal-case leading-6 tracking-normal text-white outline-none focus:border-emerald-300"
      />
    </label>
  );
}

function MetadataPanel({ metadata }: { metadata: KdpMetadata | null }) {
  if (!metadata) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
        Generate a package to review KDP metadata, description, categories, keywords, author bio, and series positioning.
      </section>
    );
  }

  return (
    <>
      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Metadata Package</p>
        <h2 className="mt-2 text-xl font-black text-white">{metadata.title}</h2>
        {metadata.subtitle ? <p className="mt-1 text-sm text-zinc-300">{metadata.subtitle}</p> : null}
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <Badge label="Author" value={metadata.authorName} />
          <Badge label="Genre" value={metadata.genre} />
          <Badge label="Audience" value={metadata.audience} />
          <Badge label="Trim" value={metadata.trimSize} />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Book Description</p>
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-200">{metadata.descriptionPlain}</p>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Author Bio</p>
        <p className="mt-3 text-sm leading-6 text-zinc-200">{metadata.authorBio}</p>
      </section>

      {metadata.series ? (
        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Series Page</p>
          <h3 className="mt-2 text-lg font-black text-white">{metadata.series.title}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{metadata.series.description}</p>
          <div className="mt-3 space-y-2">
            {metadata.series.readingOrder.map((book) => (
              <p key={`${book.position}-${book.title}`} className="rounded-md bg-zinc-950 px-3 py-2 text-sm text-zinc-200">
                {book.position}. {book.title}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Categories</p>
        <div className="mt-3 space-y-2">
          {metadata.categories.map((category) => (
            <div key={category.path} className="rounded-md bg-zinc-950 px-3 py-2">
              <p className="text-sm font-bold text-white">{category.path}</p>
              <p className="mt-1 text-xs leading-5 text-zinc-400">{category.rationale}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Keywords</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {metadata.keywords.map((keyword) => (
            <span key={keyword} className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-bold text-zinc-200">
              {keyword}
            </span>
          ))}
        </div>
      </section>

      {metadata.complianceWarnings.length ? (
        <section className="rounded-lg border border-amber-400/30 bg-amber-950/20 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-200">Readiness Warnings</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-100">
            {metadata.complianceWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-zinc-950 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-100">{value || "Unset"}</p>
    </div>
  );
}
