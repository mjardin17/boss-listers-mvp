"use client";

import { useState, type ChangeEvent } from "react";

import { authedFetch } from "../../lib/clientAuth";
import {
  CARD_STAGE_BACKDROP_PRESETS,
  VIDEO_BG_PRESETS,
  resolveShowcaseBackground,
  resolveShowcaseStage
} from "../../lib/video-studio/cardShowcase";
import type {
  CardBgRemoveMode,
  CardFrameStyle,
  CardShowcaseBackground,
  CardShowcaseBgPreset,
  CardShowcaseCutIn,
  CardShowcaseCutInLayout,
  CardShowcaseCutInPosition,
  CardShowcaseCutInTransition,
  CardShowcaseData,
  CardShowcaseStage,
  CardStageBackdropPreset
} from "../../lib/video-studio/types";

function uid(prefix = "cutin") {
  return (
    `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export function CardShowcaseEditorPanel({
  showcase,
  onChange
}: {
  showcase: CardShowcaseData;
  onChange: (next: CardShowcaseData) => void;
}) {
  const [prepBusy, setPrepBusy] = useState<string | null>(null);
  const [cutInUrlInput, setCutInUrlInput] = useState("");
  const [cutInLabelInput, setCutInLabelInput] = useState("");
  const [cutInLayoutInput, setCutInLayoutInput] =
    useState<CardShowcaseCutInLayout>("pip");
  const [cutInRemoveBgOnAdd, setCutInRemoveBgOnAdd] =
    useState<CardBgRemoveMode>("none");

  const bg = resolveShowcaseBackground(showcase.background);
  const stage = resolveShowcaseStage(showcase.cardStage);
  const cutIns = Array.isArray(showcase.cutIns) ? showcase.cutIns : [];

  function updateBackground(patch: Partial<CardShowcaseBackground>) {
    onChange({
      ...showcase,
      background: resolveShowcaseBackground({ ...bg, ...patch })
    });
  }

  function updateStage(patch: Partial<CardShowcaseStage>) {
    onChange({
      ...showcase,
      cardStage: resolveShowcaseStage({ ...stage, ...patch })
    });
  }

  function updateCutIn(id: string, patch: Partial<CardShowcaseCutIn>) {
    onChange({
      ...showcase,
      cutIns: cutIns.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      )
    });
  }

  function removeCutIn(id: string) {
    onChange({
      ...showcase,
      cutIns: cutIns.filter((item) => item.id !== id)
    });
  }

  async function callCardPrep(payload: Record<string, unknown>) {
    const response = await authedFetch("/api/video-studio/card-prep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Image prep failed");
    }
    return data as {
      ok: boolean;
      url: string;
      backgroundRemoved: boolean;
      strategy: string;
    };
  }

  async function handleRemoveMainCardBg(mode: "card" | "cutout") {
    const sourceUrl = stage.originalPhotoUrl || showcase.photoUrl;
    if (!sourceUrl) return;
    setPrepBusy(`main-${mode}`);
    try {
      const res = await callCardPrep({ imagePath: sourceUrl, mode });
      onChange({
        ...showcase,
        photoUrl: res.url,
        cardStage: resolveShowcaseStage({
          ...stage,
          removeBg: mode,
          backgroundRemoved: res.backgroundRemoved,
          originalPhotoUrl: sourceUrl
        })
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Background removal failed");
    } finally {
      setPrepBusy(null);
    }
  }

  function handleRestoreOriginalCard() {
    if (!stage.originalPhotoUrl) return;
    onChange({
      ...showcase,
      photoUrl: stage.originalPhotoUrl,
      cardStage: resolveShowcaseStage({
        ...stage,
        removeBg: "none",
        backgroundRemoved: false
      })
    });
  }

  async function handleUploadCustomVideoBg(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPrepBusy("bg-upload");
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await callCardPrep({ imageBase64: dataUrl, mode: "none" });
      updateBackground({ preset: "custom", imageUrl: res.url });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Background upload failed");
    } finally {
      setPrepBusy(null);
      event.target.value = "";
    }
  }

  async function handleUploadCustomCardBg(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPrepBusy("card-bg-upload");
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await callCardPrep({ imageBase64: dataUrl, mode: "none" });
      updateStage({ backdropPreset: "custom", backdropImageUrl: res.url });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Stage backdrop upload failed");
    } finally {
      setPrepBusy(null);
      event.target.value = "";
    }
  }

  async function handleAddCutInFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPrepBusy("cutin-upload");
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await callCardPrep({
        imageBase64: dataUrl,
        mode: cutInRemoveBgOnAdd
      });
      const startSec = Number(Math.min(7.8, 4.8 + cutIns.length * 1.9).toFixed(1));
      const newCutIn: CardShowcaseCutIn = {
        id: uid("cutin"),
        imageUrl: res.url,
        label: cutInLabelInput.trim(),
        layout: cutInLayoutInput,
        position: "bottom-right",
        transition: cutInLayoutInput === "pip" ? "zoom" : "fade",
        startSec,
        durationSec: 2.3,
        removeBg: cutInRemoveBgOnAdd,
        backgroundRemoved: res.backgroundRemoved,
        fit: res.backgroundRemoved ? "contain" : "cover",
        zoom: 1,
        focusX: 50,
        focusY: 50
      };
      onChange({ ...showcase, cutIns: [...cutIns, newCutIn] });
      setCutInLabelInput("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not add cut-in picture");
    } finally {
      setPrepBusy(null);
      event.target.value = "";
    }
  }

  function handleAddCutInUrl() {
    const url = cutInUrlInput.trim();
    if (!url) return;
    const startSec = Number(Math.min(7.8, 4.8 + cutIns.length * 1.9).toFixed(1));
    const newCutIn: CardShowcaseCutIn = {
      id: uid("cutin"),
      imageUrl: url,
      label: cutInLabelInput.trim(),
      layout: cutInLayoutInput,
      position: "bottom-right",
      transition: cutInLayoutInput === "pip" ? "zoom" : "fade",
      startSec,
      durationSec: 2.3,
      removeBg: "none",
      backgroundRemoved: false,
      fit: "cover",
      zoom: 1,
      focusX: 50,
      focusY: 50
    };
    onChange({ ...showcase, cutIns: [...cutIns, newCutIn] });
    setCutInUrlInput("");
    setCutInLabelInput("");
  }

  async function handleAddAutoCloseup() {
    const sourceUrl = stage.originalPhotoUrl || showcase.photoUrl;
    if (!sourceUrl) return;
    setPrepBusy("auto-closeup");
    try {
      const res = await callCardPrep({
        imagePath: sourceUrl,
        mode: "closeup",
        region: "art"
      });
      const newCutIn: CardShowcaseCutIn = {
        id: uid("closeup"),
        imageUrl: res.url,
        label: "Art Detail",
        layout: cutInLayoutInput,
        position: "bottom-right",
        transition: cutInLayoutInput === "pip" ? "zoom" : "fade",
        startSec: 5.2,
        durationSec: 2.5,
        removeBg: "none",
        backgroundRemoved: false,
        fit: "cover",
        zoom: 1.05,
        focusX: 50,
        focusY: 50
      };
      onChange({ ...showcase, cutIns: [...cutIns, newCutIn] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Auto close-up failed");
    } finally {
      setPrepBusy(null);
    }
  }

  async function handleRemoveCutInBg(item: CardShowcaseCutIn, mode: "card" | "cutout") {
    const sourceUrl = item.originalImageUrl || item.imageUrl;
    setPrepBusy(`cutin-${item.id}`);
    try {
      const res = await callCardPrep({ imagePath: sourceUrl, mode });
      updateCutIn(item.id, {
        imageUrl: res.url,
        originalImageUrl: sourceUrl,
        removeBg: mode,
        backgroundRemoved: res.backgroundRemoved,
        fit: res.backgroundRemoved ? "contain" : item.fit
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Cut-in background removal failed");
    } finally {
      setPrepBusy(null);
    }
  }

  const videoBgList = Object.values(VIDEO_BG_PRESETS);
  const stageBackdropList = Object.values(CARD_STAGE_BACKDROP_PRESETS);

  return (
    <div className="space-y-4">
      {/* 1. Vault Card Facts + One-Click Background Removal */}
      <div className="rounded-3xl border border-amber-400/30 bg-zinc-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-widest text-amber-300">
            Vault Card Facts & Background Removal
          </p>
          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-300">
            {stage.backgroundRemoved ? "BG Removed · Cutout Ready" : "Raw Photo"}
          </span>
        </div>

        <div className="mt-3 grid gap-4 sm:grid-cols-[140px_1fr]">
          <div
            className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl border border-amber-400/60 p-2"
            style={{
              background:
                VIDEO_BG_PRESETS[bg.preset]?.swatch ||
                "linear-gradient(135deg, #102042 0%, #040812 100%)"
            }}
          >
            <img
              src={showcase.photoUrl}
              alt={showcase.cardName}
              className={`h-full w-full ${stage.backgroundRemoved ? "object-contain drop-shadow-2xl" : "object-cover"}`}
            />
          </div>

          <div className="space-y-2 text-sm">
            <p className="text-lg font-bold text-white">{showcase.cardName}</p>
            <p className="text-zinc-300">
              {[showcase.setName, showcase.year].filter(Boolean).join(" · ") || "—"}
            </p>
            <p className="font-semibold text-amber-300">
              {showcase.cardNumber
                ? `#${showcase.cardNumber.replace(/^#+/, "")}`
                : "No card number stored"}
            </p>
            <p className="text-xs text-zinc-400">
              Suggested price:{" "}
              {showcase.suggestedPrice !== null
                ? `$${showcase.suggestedPrice.toFixed(2)} (from vault)`
                : "None stored in vault — omitted from video"}
            </p>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                disabled={Boolean(prepBusy)}
                onClick={() => handleRemoveMainCardBg("card")}
                className="rounded-xl bg-amber-400 px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50"
              >
                {prepBusy === "main-card"
                  ? "Removing BG…"
                  : "Remove BG & Straighten Card"}
              </button>
              <button
                type="button"
                disabled={Boolean(prepBusy)}
                onClick={() => handleRemoveMainCardBg("cutout")}
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-zinc-200 disabled:opacity-50"
              >
                {prepBusy === "main-cutout" ? "Cutting out…" : "Object Cutout"}
              </button>
              {stage.originalPhotoUrl && stage.backgroundRemoved ? (
                <button
                  type="button"
                  onClick={handleRestoreOriginalCard}
                  className="rounded-xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-white"
                >
                  Restore Original
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Replace All Backgrounds (Full Video Backdrop + Behind-Card Stage Backdrop) */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-400">
            Replace Video Background
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {videoBgList.map((preset) => {
              const selected = bg.preset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    updateBackground({
                      preset: preset.id as CardShowcaseBgPreset,
                      imageUrl: preset.publicPath || (preset.id === "custom" ? bg.imageUrl : undefined)
                    })
                  }
                  className={`flex flex-col items-start rounded-xl border p-2 text-left transition ${
                    selected
                      ? "border-amber-400 bg-amber-400/10"
                      : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                  }`}
                >
                  <span
                    className="mb-1.5 block h-7 w-full rounded-lg border border-white/10"
                    style={{ background: preset.swatch }}
                  />
                  <span className="text-[11px] font-semibold text-zinc-100 leading-tight">
                    {preset.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-200 hover:border-amber-400/60">
              {prepBusy === "bg-upload" ? "Uploading…" : "Upload Custom BG Image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleUploadCustomVideoBg}
                className="hidden"
              />
            </label>

            <input
              value={bg.imageUrl || ""}
              onChange={(e) =>
                updateBackground({
                  preset: e.target.value.trim() ? "custom" : bg.preset,
                  imageUrl: e.target.value.trim() || undefined
                })
              }
              placeholder="Or paste custom BG image URL"
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white"
            />

            <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs">
              <span className="text-zinc-400">Color</span>
              <input
                type="color"
                value={bg.color || "#071022"}
                onChange={(e) =>
                  updateBackground({ preset: "custom", color: e.target.value, imageUrl: undefined })
                }
                className="h-6 w-8 cursor-pointer rounded bg-transparent"
              />
              <span className="ml-auto text-zinc-400">Dim</span>
              <input
                type="range"
                min={0}
                max={0.85}
                step={0.05}
                value={bg.dim ?? VIDEO_BG_PRESETS[bg.preset]?.defaultDim ?? 0.25}
                onChange={(e) => updateBackground({ dim: Number(e.target.value) })}
                className="w-16"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-800 pt-4">
          <p className="text-xs uppercase tracking-widest text-zinc-400">
            Behind-Card Backdrop & Frame Style
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {stageBackdropList.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  updateStage({ backdropPreset: preset.id as CardStageBackdropPreset })
                }
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                  stage.backdropPreset === preset.id
                    ? "border-amber-400 bg-amber-400/15 text-amber-200"
                    : "border-zinc-800 bg-zinc-950 text-zinc-300"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(["gold-frame", "floating", "minimal"] as CardFrameStyle[]).map((styleId) => (
              <button
                key={styleId}
                type="button"
                onClick={() => updateStage({ frameStyle: styleId })}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                  stage.frameStyle === styleId
                    ? "border-emerald-400 bg-emerald-400/15 text-emerald-200"
                    : "border-zinc-800 bg-zinc-950 text-zinc-400"
                }`}
              >
                Frame: {styleId}
              </button>
            ))}

            <label className="cursor-pointer rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-200">
              {prepBusy === "card-bg-upload" ? "Uploading…" : "Custom Card BG Image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleUploadCustomCardBg}
                className="hidden"
              />
            </label>

            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span>Zoom {stage.zoom.toFixed(2)}×</span>
              <input
                type="range"
                min={0.75}
                max={1.65}
                step={0.05}
                value={stage.zoom}
                onChange={(e) => updateStage({ zoom: Number(e.target.value) })}
                className="w-20"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Cut Pictures In (Cutaways, PiP Insets, Split View, Close-Ups) */}
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-300">
              Cut Pictures In ({cutIns.length})
            </p>
            <p className="text-xs text-zinc-400">
              Cut in extra photos (back of card, close-ups, slabs, holo angles) as full cutaways, PiP insets, or split-screen.
            </p>
          </div>
          <button
            type="button"
            disabled={Boolean(prepBusy)}
            onClick={handleAddAutoCloseup}
            className="rounded-xl border border-amber-400/50 bg-amber-400/15 px-3 py-1.5 text-xs font-bold text-amber-200 disabled:opacity-50"
          >
            {prepBusy === "auto-closeup" ? "Extracting…" : "+ Auto Art Close-Up"}
          </button>
        </div>

        {/* Add Cut-In Bar */}
        <div className="grid gap-2 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/60 p-3 sm:grid-cols-2">
          <input
            value={cutInLabelInput}
            onChange={(e) => setCutInLabelInput(e.target.value)}
            placeholder="Label (e.g. Back of Card, Art Detail)"
            className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white"
          />

          <div className="flex gap-2">
            <select
              value={cutInLayoutInput}
              onChange={(e) =>
                setCutInLayoutInput(e.target.value as CardShowcaseCutInLayout)
              }
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-xs text-white"
            >
              <option value="pip">PiP Corner Inset</option>
              <option value="full">Full-Stage Cutaway</option>
              <option value="split">Split-Screen Compare</option>
              <option value="closeup">Macro Close-Up</option>
            </select>

            <select
              value={cutInRemoveBgOnAdd}
              onChange={(e) =>
                setCutInRemoveBgOnAdd(e.target.value as CardBgRemoveMode)
              }
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-xs text-white"
            >
              <option value="none">Keep BG</option>
              <option value="card">Remove Card BG</option>
              <option value="cutout">Object Cutout</option>
            </select>
          </div>

          <label className="flex cursor-pointer items-center justify-center rounded-xl bg-emerald-400 px-3 py-2 text-xs font-bold text-black">
            {prepBusy === "cutin-upload"
              ? "Processing Picture…"
              : "Upload Picture to Cut In"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleAddCutInFile}
              className="hidden"
            />
          </label>

          <div className="flex gap-2">
            <input
              value={cutInUrlInput}
              onChange={(e) => setCutInUrlInput(e.target.value)}
              placeholder="Or paste image URL"
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white"
            />
            <button
              type="button"
              onClick={handleAddCutInUrl}
              className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-white"
            >
              Add
            </button>
          </div>
        </div>

        {/* Active Cut-Ins List */}
        {cutIns.length > 0 ? (
          <div className="space-y-3">
            {cutIns.map((item, idx) => (
              <div
                key={item.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3"
              >
                <div className="grid gap-3 sm:grid-cols-[80px_1fr]">
                  <div className="aspect-[3/4] overflow-hidden rounded-lg border border-amber-400/40 bg-zinc-900">
                    <img
                      src={item.imageUrl}
                      alt={item.label || `Cut-in ${idx + 1}`}
                      className={`h-full w-full ${item.backgroundRemoved ? "object-contain p-1" : "object-cover"}`}
                    />
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold uppercase tracking-wider text-zinc-400">
                        Cut-In #{idx + 1}
                        {item.backgroundRemoved ? " · BG Removed" : ""}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={Boolean(prepBusy)}
                          onClick={() => handleRemoveCutInBg(item, "card")}
                          className="text-amber-300 hover:underline disabled:opacity-50"
                        >
                          Remove Card BG
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(prepBusy)}
                          onClick={() => handleRemoveCutInBg(item, "cutout")}
                          className="text-sky-300 hover:underline disabled:opacity-50"
                        >
                          Cutout
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCutIn(item.id)}
                          className="text-red-300 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={item.label}
                        onChange={(e) =>
                          updateCutIn(item.id, { label: e.target.value })
                        }
                        placeholder="Caption badge"
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-white"
                      />

                      <select
                        value={item.layout}
                        onChange={(e) =>
                          updateCutIn(item.id, {
                            layout: e.target.value as CardShowcaseCutInLayout
                          })
                        }
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
                      >
                        <option value="pip">PiP Inset</option>
                        <option value="full">Full Cutaway</option>
                        <option value="split">Split View</option>
                        <option value="closeup">Macro Close-Up</option>
                      </select>

                      <select
                        value={item.transition}
                        onChange={(e) =>
                          updateCutIn(item.id, {
                            transition: e.target
                              .value as CardShowcaseCutInTransition
                          })
                        }
                        className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-white"
                      >
                        <option value="fade">Fade</option>
                        <option value="cut">Hard Cut</option>
                        <option value="slide-left">Slide Left</option>
                        <option value="slide-up">Slide Up</option>
                        <option value="zoom">Zoom Pop</option>
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-zinc-400">
                      <label className="flex items-center gap-1">
                        <span>Start</span>
                        <input
                          type="number"
                          min={2.8}
                          max={9.5}
                          step={0.1}
                          value={item.startSec}
                          onChange={(e) =>
                            updateCutIn(item.id, {
                              startSec: Number(e.target.value)
                            })
                          }
                          className="w-16 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-white"
                        />
                        <span>s</span>
                      </label>

                      <label className="flex items-center gap-1">
                        <span>Hold</span>
                        <input
                          type="number"
                          min={0.5}
                          max={6.5}
                          step={0.1}
                          value={item.durationSec}
                          onChange={(e) =>
                            updateCutIn(item.id, {
                              durationSec: Number(e.target.value)
                            })
                          }
                          className="w-16 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-white"
                        />
                        <span>s</span>
                      </label>

                      {item.layout === "pip" ? (
                        <select
                          value={item.position}
                          onChange={(e) =>
                            updateCutIn(item.id, {
                              position: e.target
                                .value as CardShowcaseCutInPosition
                            })
                          }
                          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-white"
                        >
                          <option value="bottom-right">Bottom Right</option>
                          <option value="top-right">Top Right</option>
                          <option value="bottom-left">Bottom Left</option>
                          <option value="top-left">Top Left</option>
                        </select>
                      ) : null}

                      <label className="flex items-center gap-1">
                        <span>Zoom {item.zoom.toFixed(1)}×</span>
                        <input
                          type="range"
                          min={1}
                          max={2.6}
                          step={0.1}
                          value={item.zoom}
                          onChange={(e) =>
                            updateCutIn(item.id, {
                              zoom: Number(e.target.value)
                            })
                          }
                          className="w-16"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
