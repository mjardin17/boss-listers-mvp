"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Camera,
  CheckCircle2,
  Dumbbell,
  Flame,
  Loader2,
  MessageCircle,
  ShieldAlert,
  Upload
} from "lucide-react";
import imageCompression from "browser-image-compression";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_AURAFIT_API_URL || "http://127.0.0.1:8000";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const TARGET_IMAGE_MB = 1.2;

type CoachMode = "PERSISTENCE" | "NURTURE" | "STABLE" | "";

type CoachResult = {
  response: string;
  mode: CoachMode;
};

type ScanResult = {
  food_item?: string;
  estimated_volume_cm3?: number;
  estimated_weight_grams?: number;
  confidence_score?: number;
  analysis?: string;
  macros?: {
    p?: number;
    c?: number;
    f?: number;
    calories?: number;
  };
  sequence?: string;
  zeigarnik_loop?: string;
  [key: string]: unknown;
};

function formatNumber(value: unknown, suffix = "") {
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toFixed(number % 1 ? 1 : 0)}${suffix}` : "Pending";
}

function modeStyles(mode: CoachMode) {
  if (mode === "PERSISTENCE") return "border-rose-400/60 bg-rose-500/10 text-rose-100";
  if (mode === "NURTURE") return "border-sky-400/60 bg-sky-500/10 text-sky-100";
  return "border-emerald-400/60 bg-emerald-500/10 text-emerald-100";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function AuraFitPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [coachMessage, setCoachMessage] = useState("I want to skip");
  const [coachResult, setCoachResult] = useState<CoachResult | null>(null);
  const [scanStatus, setScanStatus] = useState("");
  const [coachStatus, setCoachStatus] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isCoaching, setIsCoaching] = useState(false);

  const proteinProgress = 110 / 160;
  const ringStyle = useMemo(
    () => ({
      background: `conic-gradient(#22d3ee ${proteinProgress * 360}deg, #27272a 0deg)`
    }),
    [proteinProgress]
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(file: File | null) {
    setSelectedFile(file);
    setScanResult(null);
    setScanStatus("");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : "");
  }

  async function scanMeal() {
    if (!selectedFile) {
      setScanStatus("Select a meal image first.");
      return;
    }
    if (!selectedFile.type.startsWith("image/")) {
      setScanStatus("Select an image file.");
      return;
    }

    setIsScanning(true);
    setScanStatus("Preparing image...");

    try {
      const uploadFile =
        selectedFile.size > TARGET_IMAGE_MB * 1024 * 1024
          ? await imageCompression(selectedFile, {
              maxSizeMB: TARGET_IMAGE_MB,
              maxWidthOrHeight: 1600,
              useWebWorker: true,
              fileType: "image/jpeg",
              initialQuality: 0.82
            })
          : selectedFile;

      if (uploadFile.size > MAX_UPLOAD_BYTES) {
        throw new Error("Image is too large after compression. Use a smaller image under 8MB.");
      }

      setScanStatus(
        uploadFile.size < selectedFile.size
          ? `Compressed ${formatBytes(selectedFile.size)} to ${formatBytes(uploadFile.size)}. Scanning meal...`
          : "Scanning meal..."
      );

      const formData = new FormData();
      formData.append("file", uploadFile, uploadFile.name || "meal.jpg");

      const response = await fetch(`${API_BASE_URL}/scan-food`, {
        method: "POST",
        body: formData
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "Food scan failed.");

      setScanResult(body);
      setScanStatus("");
    } catch (error) {
      setScanStatus(error instanceof Error ? error.message : "Food scan failed.");
    } finally {
      setIsScanning(false);
    }
  }

  async function askCoach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCoaching(true);
    setCoachStatus("Checking biometrics...");

    try {
      const response = await fetch(`${API_BASE_URL}/ai-coach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "user_1", message: coachMessage })
      });

      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || "Coach request failed.");

      setCoachResult(body);
      setCoachStatus("");
    } catch (error) {
      setCoachStatus(error instanceof Error ? error.message : "Coach request failed.");
    } finally {
      setIsCoaching(false);
    }
  }

  const scanTitle = scanResult?.food_item || scanResult?.analysis || "No meal scanned";

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-zinc-800 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">AuraFit OS</p>
            <h1 className="mt-2 text-3xl font-black tracking-normal text-white sm:text-4xl">
              Nutrition scanner and persistence coach
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
              <p className="text-zinc-500">Aura</p>
              <p className="text-xl font-black">88</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
              <p className="text-zinc-500">HRV</p>
              <p className="text-xl font-black">65</p>
            </div>
            <div className="rounded-lg border border-rose-500/50 bg-rose-950/30 px-3 py-2">
              <p className="text-rose-200/70">Stake</p>
              <p className="text-xl font-black text-rose-100">$50</p>
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Daily closure</h2>
                <p className="mt-1 text-sm text-zinc-400">Protein target, streak, and recovery pressure.</p>
              </div>
              <Activity className="h-5 w-5 text-cyan-300" />
            </div>

            <div className="mt-6 flex items-center justify-center">
              <div className="grid h-56 w-56 place-items-center rounded-full p-4" style={ringStyle}>
                <div className="grid h-full w-full place-items-center rounded-full bg-zinc-950 text-center">
                  <div>
                    <p className="text-sm uppercase tracking-widest text-zinc-500">Protein</p>
                    <p className="mt-1 text-3xl font-black">110g</p>
                    <p className="text-sm font-semibold text-amber-300">50g left</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <Flame className="h-5 w-5 text-amber-300" />
                <p className="mt-3 text-xs text-zinc-500">Streak</p>
                <p className="text-xl font-black">14 days</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <Dumbbell className="h-5 w-5 text-emerald-300" />
                <p className="mt-3 text-xs text-zinc-500">Goal</p>
                <p className="text-xl font-black">Muscle</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Meal scan</h2>
                <p className="mt-1 text-sm text-zinc-400">Volume, weight, macros, and the missing piece.</p>
              </div>
              <Camera className="h-5 w-5 text-cyan-300" />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
              <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-950 p-4 text-center transition hover:border-cyan-300">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Selected meal" className="h-48 w-full rounded-md object-cover" />
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-zinc-400" />
                    <span className="mt-3 text-sm font-semibold text-zinc-200">Select meal image</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => handleFileChange(event.target.files?.[0] || null)}
                />
              </label>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs uppercase tracking-widest text-zinc-500">Result</p>
                <h3 className="mt-2 text-xl font-black">{scanTitle}</h3>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-zinc-900 p-3">
                    <p className="text-zinc-500">Volume</p>
                    <p className="font-bold">{formatNumber(scanResult?.estimated_volume_cm3, " cm3")}</p>
                  </div>
                  <div className="rounded-md bg-zinc-900 p-3">
                    <p className="text-zinc-500">Weight</p>
                    <p className="font-bold">{formatNumber(scanResult?.estimated_weight_grams, " g")}</p>
                  </div>
                  <div className="rounded-md bg-zinc-900 p-3">
                    <p className="text-zinc-500">Protein</p>
                    <p className="font-bold">{formatNumber(scanResult?.macros?.p, " g")}</p>
                  </div>
                  <div className="rounded-md bg-zinc-900 p-3">
                    <p className="text-zinc-500">Confidence</p>
                    <p className="font-bold">
                      {scanResult?.confidence_score !== undefined
                        ? `${Math.round(Number(scanResult.confidence_score) * 100)}%`
                        : "Pending"}
                    </p>
                  </div>
                </div>
                {scanResult?.sequence ? (
                  <p className="mt-4 text-sm leading-6 text-cyan-100">{scanResult.sequence}</p>
                ) : null}
                {scanResult?.zeigarnik_loop ? (
                  <p className="mt-3 rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-sm font-semibold text-amber-100">
                    {scanResult.zeigarnik_loop}
                  </p>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void scanMeal()}
              disabled={isScanning}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-sm font-black text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Scan meal
            </button>
            {scanStatus ? <p className="mt-3 text-sm font-semibold text-rose-200">{scanStatus}</p> : null}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">Persistence coach</h2>
              <p className="mt-1 text-sm text-zinc-400">Biometric-aware response for skip, tired, and recovery signals.</p>
            </div>
            <MessageCircle className="h-5 w-5 text-emerald-300" />
          </div>

          <form onSubmit={(event) => void askCoach(event)} className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={coachMessage}
              onChange={(event) => setCoachMessage(event.target.value)}
              className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-white outline-none transition focus:border-emerald-300"
            />
            <button
              type="submit"
              disabled={isCoaching}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-300 px-5 text-sm font-black text-zinc-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCoaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
              Ask coach
            </button>
          </form>

          {coachResult ? (
            <div className={`mt-4 rounded-lg border p-4 ${modeStyles(coachResult.mode)}`}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                <p className="text-sm font-black">{coachResult.mode}</p>
              </div>
              <p className="mt-3 text-sm leading-6">{coachResult.response}</p>
            </div>
          ) : null}

          {coachStatus ? <p className="mt-3 text-sm font-semibold text-rose-200">{coachStatus}</p> : null}
        </section>
      </div>
    </main>
  );
}
