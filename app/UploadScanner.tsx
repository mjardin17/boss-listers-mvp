"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  normalizeAnalyzeDashboardResponse,
  type AnalyzeDashboardResponse
} from "../lib/clientAnalyzePayload";
import { normalizeBarcodeValue } from "../lib/barcodeService";
import { buildBossBrainAIContext } from "../lib/bossBrain";
import { emitUiSignal } from "../lib/realtime/uiSignalBus";
import type { NormalizedListing } from "./types";

const MAX_SCAN_IMAGES = 5;
const MAX_SCAN_PAYLOAD_BYTES = 24 * 1024 * 1024;
const ZXING_BROWSER_ESM_URL = "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm";
const ZXING_LIBRARY_ESM_URL = "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm";
const BARCODE_STABLE_MS = 1000;

export interface UploadScannerProps {
  sourceStoreContext?: SourceStoreContext;
  listingInputContext?: ListingInputContext;
  onScanStart: () => void;
  onScanProgress?: (progress: ScanProgress) => void;
  onScanError?: (message: string) => void;
  onListingReady: (listing: NormalizedListing) => void;
}

export type ScanProgress = {
  stage: string;
  percent: number;
};

type ZxingResult = {
  getText?: () => string;
  text?: string;
};

type ZxingControls = {
  stop?: () => void;
};

type ZxingReader = {
  decodeFromVideoDevice: (
    deviceId: string | undefined,
    videoElement: HTMLVideoElement,
    callback: (result?: ZxingResult | null, error?: unknown) => void
  ) => Promise<ZxingControls> | ZxingControls;
  decodeFromConstraints?: (
    constraints: MediaStreamConstraints,
    videoElement: HTMLVideoElement,
    callback: (result?: ZxingResult | null, error?: unknown) => void
  ) => Promise<ZxingControls> | ZxingControls;
  decodeFromStream?: (
    stream: MediaStream,
    videoElement: HTMLVideoElement,
    callback: (result?: ZxingResult | null, error?: unknown) => void
  ) => Promise<ZxingControls> | ZxingControls;
  decodeFromImageUrl: (url: string) => Promise<ZxingResult>;
  reset?: () => void;
};

type ZxingGlobal = {
  BrowserMultiFormatReader: new (hints?: Map<unknown, unknown>, timeBetweenScansMillis?: number) => ZxingReader;
  BarcodeFormat: Record<string, unknown>;
  DecodeHintType: Record<string, unknown>;
};

type StableBarcodeCandidate = {
  value: string;
  firstSeenAt: number;
  seenCount: number;
};

type SourceStoreContext = {
  sourceStoreType: "WALMART" | "DOLLAR_TREE" | "MANUAL";
  presetCost?: number;
  manualOverrideValue?: number | null;
};

type ListingInputContext = {
  itemName?: string;
  marketplace?: string;
  purchaseCost?: number | null;
  shippingEstimate?: number | null;
  packagingCost?: number | null;
  manualSoldCompPrice?: number | null;
};

declare global {
  interface Window {
    __bossListersZxingLoad?: Promise<ZxingGlobal>;
    webkitAudioContext?: typeof AudioContext;
  }
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const dimensions = {
        width: image.naturalWidth,
        height: image.naturalHeight
      };
      URL.revokeObjectURL(url);
      resolve(dimensions);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0 });
    };
    image.src = url;
  });
}

function normalizeBarcode(value = "") {
  return normalizeBarcodeValue(value);
}

function getBarcodeText(result?: ZxingResult | null) {
  return normalizeBarcode(result?.getText?.() || result?.text || "");
}

function loadZxing(): Promise<ZxingGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Barcode scanner is only available in the browser."));
  }
  if (window.__bossListersZxingLoad) return window.__bossListersZxingLoad;

  window.__bossListersZxingLoad = (async () => {
    const importFromBrowser = new Function("url", "return import(url)") as <T>(
      url: string
    ) => Promise<T>;
    const [browserModule, libraryModule] = await Promise.all([
      importFromBrowser<Pick<ZxingGlobal, "BrowserMultiFormatReader">>(ZXING_BROWSER_ESM_URL),
      importFromBrowser<Pick<ZxingGlobal, "BarcodeFormat" | "DecodeHintType">>(
        ZXING_LIBRARY_ESM_URL
      )
    ]);

    return {
      BrowserMultiFormatReader: browserModule.BrowserMultiFormatReader,
      BarcodeFormat: libraryModule.BarcodeFormat,
      DecodeHintType: libraryModule.DecodeHintType
    };
  })();

  return window.__bossListersZxingLoad;
}

function createBarcodeReader(zxing: ZxingGlobal) {
  const hints = new Map<unknown, unknown>();
  const formats = [
    zxing.BarcodeFormat.UPC_A,
    zxing.BarcodeFormat.UPC_E,
    zxing.BarcodeFormat.EAN_8,
    zxing.BarcodeFormat.EAN_13
  ].filter(Boolean);
  hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, formats);
  hints.set(zxing.DecodeHintType.TRY_HARDER, true);
  if (zxing.DecodeHintType.ALSO_INVERTED) {
    hints.set(zxing.DecodeHintType.ALSO_INVERTED, true);
  }
  return new zxing.BrowserMultiFormatReader(hints, 350);
}

async function detectBarcodeFromFiles(files: File[]) {
  try {
    const zxing = await loadZxing();
    const reader = createBarcodeReader(zxing);
    for (const file of files) {
      const url = URL.createObjectURL(file);
      try {
        const barcode = getBarcodeText(await reader.decodeFromImageUrl(url));
        if (barcode) return barcode;
      } catch {
        // Keep normal image analysis flowing when no barcode is visible.
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } catch {
    // Barcode detection is opportunistic; product analysis still runs without it.
  }
  return "";
}

function waitForVideoElement(videoRef: RefObject<HTMLVideoElement | null>) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      if (videoRef.current) {
        resolve(videoRef.current);
        return;
      }
      attempts += 1;
      if (attempts > 30) {
        reject(new Error("Camera preview is unavailable."));
        return;
      }
      window.requestAnimationFrame(check);
    };
    check();
  });
}

function playBarcodeSuccessCue() {
  window.navigator.vibrate?.(80);
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.14);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.15);
    window.setTimeout(() => void context.close(), 220);
  } catch {
    // Audio feedback is best-effort and should never block scanning.
  }
}

function speakScannerMessage(message: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Voice feedback is optional and should never interrupt scan flow.
  }
}

function buildDecisionAnnouncement(listing: NormalizedListing) {
  const decision = String(
    listing.recommendation || listing.decisionCard?.action || "Scan complete"
  ).toUpperCase();
  const profit = Number(listing.estimatedProfit ?? listing.profitPotential);
  const roi = Number(listing.roiPercentage);
  const profitPhrase = Number.isFinite(profit)
    ? `Profit ${profit >= 0 ? "" : "negative "}${Math.abs(profit).toFixed(0)} dollars.`
    : "Profit unavailable.";
  const roiPhrase = Number.isFinite(roi)
    ? `ROI ${Math.round(roi)} percent.`
    : "ROI unavailable.";

  return `${decision}. ${profitPhrase} ${roiPhrase}`;
}

function captureVideoFrame(video: HTMLVideoElement): Promise<File> {
  return new Promise((resolve, reject) => {
    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;

    if (!sourceWidth || !sourceHeight) {
      reject(new Error("Camera frame dimensions are unavailable."));
      return;
    }

    const MAX_CAPTURE_DIMENSION = 1280;
    const scale = Math.min(
      1,
      MAX_CAPTURE_DIMENSION / Math.max(sourceWidth, sourceHeight)
    );

    const width = Math.round(sourceWidth * scale);
    const height = Math.round(sourceHeight * scale);

    console.info("[BossListers] captureVideoFrame", {
      sourceWidth,
      sourceHeight,
      width,
      height,
      scale
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("Camera frame could not be captured."));
      return;
    }

    // Preserve native camera pixels. Do not apply brightness/contrast/saturation filters.
    context.drawImage(video, 0, 0, width, height);

    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Camera frame could not be captured."));
        return;
      }

      console.info("[BossListers] captureVideoFrame blob", {
        sizeBytes: blob.size,
        sizeMB: Number((blob.size / 1024 / 1024).toFixed(2)),
        type: blob.type
      });

      resolve(
        new File([blob], `barcode-scan-${Date.now()}.png`, {
          type: "image/png"
        })
      );
    }, "image/png");
  });
}

async function improveCameraForBarcode(stream: MediaStream) {
  const [track] = stream.getVideoTracks();
  if (!track?.applyConstraints) return;
  try {
    await track.applyConstraints({
      advanced: [
        {
          focusMode: "continuous",
          exposureMode: "continuous",
          whiteBalanceMode: "continuous",
          torch: true
        } as MediaTrackConstraintSet
      ]
    });
  } catch {
    try {
      await track.applyConstraints({
        advanced: [
          {
            focusMode: "continuous",
            exposureMode: "continuous"
          } as MediaTrackConstraintSet
        ]
      });
    } catch {
      // Many laptop webcams do not expose these controls; keep scanning normally.
    }
  }
}

export function UploadScanner({
  sourceStoreContext,
  listingInputContext,
  onScanStart,
  onScanProgress,
  onScanError,
  onListingReady
}: UploadScannerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const barcodeImageInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const barcodeControlsRef = useRef<ZxingControls | null>(null);
  const barcodeReaderRef = useRef<ZxingReader | null>(null);
  const noBarcodeTimerRef = useRef<number | null>(null);
  const scanningStatusTimerRef = useRef<number | null>(null);
  const stableBarcodeRef = useRef<StableBarcodeCandidate | null>(null);
  const stableBarcodeTimerRef = useRef<number | null>(null);
  const acceptingBarcodeRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestTimeoutRef = useRef<number | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);
  const isProcessingRef = useRef<boolean>(false);
  const selectedFilesRef = useRef<File[]>([]);
  const previewUrlsRef = useRef<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [stage, setStage] = useState("");
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [barcodeStatus, setBarcodeStatus] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);
  const [handsFreeMode, setHandsFreeMode] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      cleanupAnalysisRequest(true);
      stopBarcodeScanner();
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function logAnalysis(scanId: number, event: string, details: Record<string, unknown> = {}) {
    console.info("[BossListers] analysis lifecycle", {
      scanId,
      processing: isProcessingRef.current,
      ...details,
      event
    });
  }

  function clearProgressInterval() {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }

  function clearRequestTimeout() {
    if (requestTimeoutRef.current) {
      window.clearTimeout(requestTimeoutRef.current);
      requestTimeoutRef.current = null;
    }
  }

  function cleanupAnalysisRequest(abortActiveRequest = true) {
    clearProgressInterval();
    clearRequestTimeout();

    if (abortActiveRequest && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = null;

    isProcessingRef.current = false;
  }

  function claimAnalysisTerminalState(scanId: number, terminal: string) {
    if (!isMountedRef.current) return false;
    if (!isProcessingRef.current) {
      logAnalysis(scanId, "duplicate-terminal-suppressed", { terminal });
      return false;
    }
    clearProgressInterval();
    logAnalysis(scanId, "terminal-claimed", { terminal });
    return true;
  }

  function updateProgress(nextStage: string, percent: number) {
    if (!isMountedRef.current || !isProcessingRef.current) return;
    setStage(nextStage);
    onScanProgress?.({ stage: nextStage, percent });
    emitUiSignal({
      type: "scan_stage",
      label: nextStage,
      detail: `${percent}%`,
      severity: percent >= 90 ? "success" : "info",
      payload: { percent }
    });
  }

  function clearBarcodeScannerTimers() {
    if (noBarcodeTimerRef.current) {
      window.clearTimeout(noBarcodeTimerRef.current);
      noBarcodeTimerRef.current = null;
    }
    if (scanningStatusTimerRef.current) {
      window.clearTimeout(scanningStatusTimerRef.current);
      scanningStatusTimerRef.current = null;
    }
    if (stableBarcodeTimerRef.current) {
      window.clearTimeout(stableBarcodeTimerRef.current);
      stableBarcodeTimerRef.current = null;
    }
    stableBarcodeRef.current = null;
  }

  function stopMediaStream(stream: MediaStream | null) {
    stream?.getTracks().forEach((track) => track.stop());
  }

  function stopBarcodeScanner() {
    clearBarcodeScannerTimers();
    acceptingBarcodeRef.current = false;
    barcodeControlsRef.current?.stop?.();
    barcodeControlsRef.current = null;
    barcodeReaderRef.current?.reset?.();
    barcodeReaderRef.current = null;
    const activeStream = streamRef.current;
    const videoStream =
      videoRef.current?.srcObject instanceof MediaStream ? videoRef.current.srcObject : null;
    stopMediaStream(activeStream);
    if (videoStream && videoStream !== activeStream) {
      stopMediaStream(videoStream);
    }
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.load();
    }
    if (isMountedRef.current) {
      setIsBarcodeScannerOpen(false);
    }
  }

  function stopHandsFreeScanner() {
    setHandsFreeMode(false);
    stopBarcodeScanner();
  }

  function isExpectedNoBarcodeError(error: unknown) {
    const name = error && typeof error === "object" ? String((error as { name?: string }).name || "") : "";
    return /notfound|checksum|format/i.test(name);
  }

  function markBarcodeDetected(barcode: string) {
    setScannedBarcode(barcode);
    setManualBarcode(barcode);
    setBarcodeStatus(`Barcode detected: ${barcode}`);
    setStage(`Barcode detected: ${barcode}`);
  }

  function useManualBarcode() {
    const barcode = normalizeBarcode(manualBarcode);
    if (!barcode) {
      setError("Enter a valid UPC/EAN barcode.");
      return;
    }
    setError("");
    markBarcodeDetected(barcode);
    stopBarcodeScanner();
    void scanSelectedFiles(selectedFilesRef.current, barcode);
  }

  async function handleBarcodeImageUpload(files: File[]) {
    const barcodeFile = files.find((file) => file?.type?.startsWith("image/"));
    if (!barcodeFile) {
      setError("Upload a barcode image such as JPEG, PNG, or WEBP.");
      return;
    }
    setError("");
    setBarcodeStatus("Scanning for barcode...");
    const barcode = await detectBarcodeFromFiles([barcodeFile]);
    if (barcode) {
      markBarcodeDetected(barcode);
      await scanSelectedFiles(selectedFiles.length ? selectedFiles : [barcodeFile], barcode);
      return;
    }
    setBarcodeStatus("No barcode detected yet");
  }

  async function analyzeStableLiveBarcode(barcode: string, video: HTMLVideoElement) {
    if (acceptingBarcodeRef.current) return;
    acceptingBarcodeRef.current = true;
    playBarcodeSuccessCue();
    markBarcodeDetected(barcode);
    let frameFile: File;
    try {
      frameFile = await captureVideoFrame(video);
    } catch (captureError) {
      stopBarcodeScanner();
      setError(
        captureError instanceof Error
          ? captureError.message
          : "Camera frame could not be captured."
      );
      return;
    }

    stopBarcodeScanner();
    setSelectedFiles([frameFile]);
    setActivePreviewIndex(0);
    setPreviewUrls((current) => {
      current.forEach((url) => URL.revokeObjectURL(url));
      return [URL.createObjectURL(frameFile)];
    });
    await scanSelectedFiles([frameFile], barcode);
  }

  function handleStableBarcodeCandidate(barcode: string, video: HTMLVideoElement) {
    const now = Date.now();
    const current = stableBarcodeRef.current;
    const next =
      current?.value === barcode
        ? { ...current, seenCount: current.seenCount + 1 }
        : { value: barcode, firstSeenAt: now, seenCount: 1 };
    stableBarcodeRef.current = next;
    setBarcodeStatus(
      next.seenCount > 1 ? `Hold steady: ${barcode}` : "Barcode found. Hold steady..."
    );
    setStage("Barcode found. Hold steady...");

    if (stableBarcodeTimerRef.current) {
      window.clearTimeout(stableBarcodeTimerRef.current);
    }
    stableBarcodeTimerRef.current = window.setTimeout(() => {
      if (stableBarcodeRef.current?.value === barcode) {
        void analyzeStableLiveBarcode(barcode, video);
      }
    }, BARCODE_STABLE_MS);

    if (now - next.firstSeenAt >= BARCODE_STABLE_MS && next.seenCount >= 2) {
      if (stableBarcodeTimerRef.current) {
        window.clearTimeout(stableBarcodeTimerRef.current);
        stableBarcodeTimerRef.current = null;
      }
      void analyzeStableLiveBarcode(barcode, video);
    }
  }

  async function startBarcodeScanner() {
    if (isBusy || isBarcodeScannerOpen || streamRef.current) return;
    setError("");
    setScannedBarcode("");
    acceptingBarcodeRef.current = false;
    setStage("Opening barcode scanner...");
    setBarcodeStatus("");
    setIsBarcodeScannerOpen(true);

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      stopBarcodeScanner();
      setBarcodeStatus("Camera unavailable");
      setError("Camera access is unavailable in this browser. Use manual UPC/EAN or upload a barcode image.");
      return;
    }

    let noBarcodeTimer: number | undefined;
    let scanningStatusTimer: number | undefined;

    try {
      const zxing = await loadZxing();
      const reader = createBarcodeReader(zxing);
      barcodeReaderRef.current = reader;
      const video = await waitForVideoElement(videoRef);
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          aspectRatio: { ideal: 1.777777778 }
        },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      await improveCameraForBarcode(stream);
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      setBarcodeStatus("Camera ready");
      setStage("Camera ready");
      const onDecode = (result?: ZxingResult | null, decodeError?: unknown) => {
        const barcode = getBarcodeText(result);
        if (!barcode) {
          if (decodeError && !isExpectedNoBarcodeError(decodeError)) {
            console.warn("Boss Listers barcode decode warning", decodeError);
          }
          return;
        }
        if (noBarcodeTimerRef.current) {
          window.clearTimeout(noBarcodeTimerRef.current);
          noBarcodeTimerRef.current = null;
        }
        if (scanningStatusTimerRef.current) {
          window.clearTimeout(scanningStatusTimerRef.current);
          scanningStatusTimerRef.current = null;
        }
        handleStableBarcodeCandidate(barcode, video);
      };
      const controls = reader.decodeFromStream
        ? await reader.decodeFromStream(stream, video, onDecode)
        : reader.decodeFromVideoDevice
          ? await reader.decodeFromVideoDevice(undefined, video, onDecode)
          : await reader.decodeFromConstraints?.(constraints, video, onDecode);
      if (!controls) throw new Error("Barcode scanner could not start.");
      barcodeControlsRef.current = controls;
      scanningStatusTimer = window.setTimeout(() => {
        if (!isMountedRef.current) return;
        setBarcodeStatus("Scanning for barcode...");
        setStage("Scanning for barcode...");
      }, 700);
      scanningStatusTimerRef.current = scanningStatusTimer;
      noBarcodeTimer = window.setTimeout(() => {
        if (!isMountedRef.current) return;
        setBarcodeStatus("No barcode detected yet");
        setStage("No barcode detected yet");
      }, 2500);
      noBarcodeTimerRef.current = noBarcodeTimer;
    } catch (barcodeError) {
      if (scanningStatusTimer) window.clearTimeout(scanningStatusTimer);
      if (noBarcodeTimer) window.clearTimeout(noBarcodeTimer);
      noBarcodeTimerRef.current = null;
      scanningStatusTimerRef.current = null;
      setHandsFreeMode(false);
      stopBarcodeScanner();
      setError(
        barcodeError instanceof Error
          ? barcodeError.message
          : "Barcode scanner could not access the camera."
      );
    }
  }

  async function startHandsFreeScanner() {
    setHandsFreeMode(true);
    await startBarcodeScanner();
  }

  function handleSelectedFiles(files: File[]) {
    const nextFiles = files.filter(Boolean).slice(0, MAX_SCAN_IMAGES);
    if (!nextFiles.length) {
      setError("Choose one to five photos to start scanning.");
      return;
    }
    if (files.length > MAX_SCAN_IMAGES) {
      setError(`Use up to ${MAX_SCAN_IMAGES} product photos per scan.`);
      return;
    }
    if (nextFiles.some((file) => !file.type.startsWith("image/"))) {
      setError("Upload photo files such as JPEG, PNG, or WEBP.");
      return;
    }
    const totalBytes = nextFiles.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_SCAN_PAYLOAD_BYTES) {
      setError("Upload is too large. Use fewer or smaller product photos.");
      return;
    }

    setError("");
    setStage("");
    setScannedBarcode("");
    setBarcodeStatus("");
    setManualBarcode("");
    cleanupAnalysisRequest(true);
    selectedFilesRef.current = nextFiles;
    console.info("[BossListers] selected upload files", {
      count: nextFiles.length,
      files: nextFiles.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type || "unknown"
      }))
    });
    setSelectedFiles(nextFiles);
    setActivePreviewIndex(0);
    setPreviewUrls((current) => {
      current.forEach((url) => URL.revokeObjectURL(url));
      return nextFiles.map((file) => URL.createObjectURL(file));
    });
  }

  async function scanSelectedFiles(filesToScan = selectedFilesRef.current, barcodeOverride = scannedBarcode) {
    if (isProcessingRef.current || isBusy) return;
    if (!filesToScan.length && !normalizeBarcode(barcodeOverride)) {
      setError("Choose one to five photos to start scanning.");
      return;
    }

    cleanupAnalysisRequest(false);
    isProcessingRef.current = true;
    const scanId = Date.now();
    setIsBusy(true);
    setError("");
    logAnalysis(scanId, "scan-started", {
      fileCount: filesToScan.length,
      barcodeOverride: normalizeBarcode(barcodeOverride) || ""
    });
    onScanStart();
    updateProgress(
      !filesToScan.length
        ? "Preparing barcode..."
        : filesToScan.length > 1
        ? `Preparing ${filesToScan.length} images...`
        : "Preparing image...",
      8
    );

    try {
      updateProgress(barcodeOverride ? "Using barcode..." : "Scanning barcode...", 22);
      const detectedBarcode = barcodeOverride || (await detectBarcodeFromFiles(filesToScan));
      if (detectedBarcode) {
        markBarcodeDetected(detectedBarcode);
        updateProgress(`Barcode detected: ${detectedBarcode}`, 32);
      } else {
        setBarcodeStatus("No barcode detected yet");
        updateProgress("Reading packaging text...", 28);
      }
      const dimensions = await Promise.all(filesToScan.map((file) => readImageDimensions(file)));
      console.info("Boss Listers upload images", {
        count: filesToScan.length,
        totalSizeMB: Number(
          (filesToScan.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(2)
        ),
        files: filesToScan.map((file, index) => ({
          name: file.name,
          sizeBytes: file.size,
          sizeMB: Number((file.size / 1024 / 1024).toFixed(2)),
          type: file.type || "unknown",
          width: dimensions[index]?.width || 0,
          height: dimensions[index]?.height || 0
        }))
      });
      const formData = new FormData();
      filesToScan.forEach((file) => formData.append("photos", file, file.name));
      if (detectedBarcode) {
        formData.append("barcode", detectedBarcode);
        formData.append("upc", detectedBarcode);
      }
      try {
        const correctionHistory = window.localStorage.getItem("boss-listers.productCorrections.v1");
        if (correctionHistory) formData.append("manualCorrectionHistory", correctionHistory);
        const userSalesHistory = window.localStorage.getItem("boss-listers.salesHistory.v1");
        if (userSalesHistory) formData.append("userSalesHistory", userSalesHistory);
        formData.append(
          "bossBrainContext",
          JSON.stringify(
            buildBossBrainAIContext({
              upc: detectedBarcode || scannedBarcode || "",
              sourceStoreType: sourceStoreContext?.sourceStoreType || "",
              resolvedCostBasis: sourceStoreContext?.manualOverrideValue || sourceStoreContext?.presetCost || 0
            })
          )
        );
      } catch {
        // Calibration memory is optional; scan transport should continue without it.
      }
      if (sourceStoreContext) {
        formData.append("sourceStoreContext", JSON.stringify(sourceStoreContext));
        formData.append("sourceStoreType", sourceStoreContext.sourceStoreType);
        if (sourceStoreContext.manualOverrideValue != null) {
          formData.append("manualOverrideValue", String(sourceStoreContext.manualOverrideValue));
        }
      }
      if (listingInputContext) {
        const itemName = listingInputContext.itemName?.trim();
        if (itemName) {
          formData.append("titleHint", itemName);
          formData.append("model", itemName);
        }
        if (listingInputContext.marketplace) {
          formData.append("marketplace", listingInputContext.marketplace);
        }
        if (listingInputContext.purchaseCost != null) {
          formData.append("costOfGoods", String(listingInputContext.purchaseCost));
          formData.append("manualCostPaid", String(listingInputContext.purchaseCost));
        }
        if (listingInputContext.shippingEstimate != null) {
          formData.append("manualShippingEstimate", String(listingInputContext.shippingEstimate));
        }
        if (listingInputContext.packagingCost != null) {
          formData.append("packagingCost", String(listingInputContext.packagingCost));
        }
        if (listingInputContext.manualSoldCompPrice != null) {
          formData.append("manualSoldCompPrice", String(listingInputContext.manualSoldCompPrice));
        }
      }
      console.info("[BossListers] analyze FormData before fetch", {
        files: filesToScan.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type || "unknown"
        })),
        keys: Array.from(formData.keys())
      });
      updateProgress("Analyzing product...", 48);
      abortControllerRef.current = new AbortController();
      requestTimeoutRef.current = window.setTimeout(() => {
        logAnalysis(scanId, "abort-timeout-fired");
        abortControllerRef.current?.abort();
      }, filesToScan.length > 1 ? 40000 : 25000);
      const progressStartedAt = Date.now();
      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - progressStartedAt;
        if (elapsed >= 5200) {
          updateProgress("Calculating resale metrics...", 90);
        } else if (elapsed >= 2300) {
          updateProgress("Calculating resale metrics...", 78);
        } else if (elapsed >= 900) {
          updateProgress("Reading packaging text...", 62);
        }
      }, 300);
      const response = await fetch("/api/scan", {
        method: "POST",
        body: formData,
        signal: abortControllerRef.current.signal
      });
      clearProgressInterval();
      clearRequestTimeout();
      updateProgress("Calculating resale metrics...", 96);
      let data: AnalyzeDashboardResponse;
      try {
        data = (await response.json()) as AnalyzeDashboardResponse;
      } catch {
        throw new Error("Scan service returned an unreadable response. Try again.");
      }
      logAnalysis(scanId, "api-response", {
        ok: Boolean(data?.ok),
        status: response.status,
        hasListing: Boolean(data?.listing),
        hasAnalysis: Boolean(data?.analysis),
        barcode: detectedBarcode || ""
      });
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Scan failed");
      }
      if (!data.listing && !data.analysis) {
        logAnalysis(scanId, "malformed-payload-error", { reason: "missing-listing-and-analysis" });
        throw new Error("Analyze response did not include a dashboard listing.");
      }
      let normalizedListing: NormalizedListing;
      try {
        normalizedListing = normalizeAnalyzeDashboardResponse(data);
      } catch (normalizationError) {
        logAnalysis(scanId, "normalization-error", {
          message:
            normalizationError instanceof Error
              ? normalizationError.message
              : "Unknown normalization error"
        });
        throw normalizationError;
      }
      if (!claimAnalysisTerminalState(scanId, "success")) return;
      if (
        normalizedListing.itemTitle === "Scanned item" ||
        normalizedListing.sourcingTip.toLowerCase().includes("review current comps")
      ) {
        setStage("Low-confidence scan. Review the result or try a clearer photo.");
      }
      try {
        const analysisTelemetry = (data.analysis || {}) as any;
        const calibrationRecord = {
          createdAt: new Date().toISOString(),
          barcode: detectedBarcode || normalizedListing.upc || "",
          sourceStoreType: sourceStoreContext?.sourceStoreType || normalizedListing.sourceStoreType || "",
          rawOcrText: analysisTelemetry.ocrText || [],
          generatedSearchQueries: normalizedListing.generatedSearchQueries || analysisTelemetry.generatedSearchQueries || [],
          acceptedComps: normalizedListing.trustedCompSummary?.acceptedComps ?? 0,
          rejectedComps: normalizedListing.trustedCompSummary?.rejectedComps ?? 0,
          rejectionReasons: normalizedListing.trustedCompSummary?.rejectionReasons || {},
          identityConfidence: normalizedListing.trustedCompSummary?.identityConfidence || null,
          finalRecommendation: normalizedListing.recommendation || normalizedListing.decisionCard?.action || "MANUAL_REVIEW"
        };
        const existing = JSON.parse(window.localStorage.getItem("boss-listers.calibrationLog.v1") || "[]");
        window.localStorage.setItem(
          "boss-listers.calibrationLog.v1",
          JSON.stringify([calibrationRecord, ...(Array.isArray(existing) ? existing : [])].slice(0, 50))
        );
      } catch {
        // Calibration logging must never block a completed scan.
      }
      setStage("Analysis complete");
      onScanProgress?.({ stage: "Analysis complete", percent: 100 });
      emitUiSignal({
        type: "scan_completed",
        label: "Analysis complete",
        detail: normalizedListing.recommendation || normalizedListing.decisionCard?.action || "MANUAL_REVIEW",
        severity: "success",
        payload: {
          upc: normalizedListing.upc,
          confidenceScore: normalizedListing.confidenceScore
        }
      });
      console.log("[FRONTEND] ABOUT TO CALL onAnalysisComplete");
      if (voiceEnabled) {
        speakScannerMessage(buildDecisionAnnouncement(normalizedListing));
      }
      onListingReady(normalizedListing);
      console.log("[FRONTEND] onAnalysisComplete FINISHED");
    } catch (scanError) {
      if (!claimAnalysisTerminalState(scanId, "error")) return;
      let message = "We could not analyze that photo. Retake it with more light and less glare.";
      onScanProgress?.({ stage: "Scan failed", percent: 0 });
      if (scanError instanceof DOMException && scanError.name === "AbortError") {
        message = "Scan timed out on this connection. Try again with a closer, brighter photo.";
      } else if (scanError instanceof Error) {
        message =
          scanError.message === "Scan failed"
            ? "Upload failed. Check your connection and try again."
            : scanError.message;
      }
      setError(message);
      if (voiceEnabled) {
        speakScannerMessage("Scan failed. Try again with a clearer photo.");
      }
      emitUiSignal({
        type: "scan_failed",
        label: "Scan failed",
        detail: message,
        severity: "danger"
      });
      onScanError?.(message);
    } finally {
      clearProgressInterval();
      clearRequestTimeout();
      abortControllerRef.current = null;
      isProcessingRef.current = false;
      if (isMountedRef.current) {
        setIsBusy(false);
        setStage("");
      }
    }
  }

  const activePreviewUrl = previewUrls[activePreviewIndex] || "";

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          handleSelectedFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        className="hidden"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          handleSelectedFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      <input
        ref={barcodeImageInputRef}
        className="hidden"
        type="file"
        accept="image/*"
        onChange={(event) => {
          void handleBarcodeImageUpload(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={isBusy || isBarcodeScannerOpen}
        onClick={() => void startHandsFreeScanner()}
        className="min-h-14 w-full rounded-2xl bg-emerald-400 px-4 py-4 text-sm font-bold text-zinc-950 shadow-[0_0_24px_rgba(16,185,129,0.18)] disabled:opacity-60"
      >
        {isBarcodeScannerOpen ? "Hands-Free Scan Running" : "Start Hands-Free Scan"}
      </button>
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => cameraInputRef.current?.click()}
          className="min-h-11 rounded-2xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          Camera
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => fileInputRef.current?.click()}
          className="min-h-11 rounded-2xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          Upload
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => setVoiceEnabled((current) => !current)}
          className={`min-h-11 rounded-2xl border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
            voiceEnabled
              ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
              : "border-zinc-700 bg-zinc-900 text-zinc-200"
          }`}
          aria-pressed={voiceEnabled}
        >
          Voice {voiceEnabled ? "On" : "Off"}
        </button>
      </div>
      {isBarcodeScannerOpen ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          <div className="relative aspect-video bg-black">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              style={{ filter: "brightness(1.12) contrast(1.18)" }}
              autoPlay
              muted
              playsInline
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/35" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-4/5 max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]">
              <div className="absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-300/80" />
            </div>
          </div>
          <div className="space-y-3 border-t border-zinc-800 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-200">
                {handsFreeMode ? "Hands-free" : "Barcode"}
              </span>
              {voiceEnabled ? (
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Voice on
                </span>
              ) : null}
            </div>
            <p className="text-sm font-semibold text-zinc-200">
              {barcodeStatus || "Camera ready"}
            </p>
            <p className="text-xs leading-5 text-zinc-400">
              Center the barcode inside the green frame and move it closer until the bars look sharp.
            </p>
            <button
              type="button"
              onClick={stopHandsFreeScanner}
              className="min-h-10 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200"
            >
              Stop
            </button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
        <label className="text-xs font-semibold text-zinc-400">
          Manual UPC/EAN
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
            <input
              type="text"
              inputMode="numeric"
              value={manualBarcode}
              onChange={(event) => setManualBarcode(event.target.value)}
              placeholder="Enter barcode"
              disabled={isBusy}
              className="min-h-10 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400 disabled:opacity-60"
            />
            <button
              type="button"
              disabled={isBusy}
              onClick={useManualBarcode}
              className="min-h-10 rounded-xl bg-emerald-400 px-3 py-2 text-xs font-bold text-zinc-950 disabled:opacity-60"
            >
              Use
            </button>
          </div>
        </label>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => barcodeImageInputRef.current?.click()}
          className="min-h-11 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-200 disabled:opacity-60"
        >
          Upload barcode image
        </button>
        {barcodeStatus && !isBarcodeScannerOpen ? (
          <p className="text-xs font-semibold text-zinc-300">{barcodeStatus}</p>
        ) : null}
      </div>
      {scannedBarcode ? (
        <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200">
          Barcode detected: <span className="break-all">{scannedBarcode}</span>
        </p>
      ) : null}
      {activePreviewUrl ? (
        <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          <div className="aspect-video flex items-center justify-center bg-zinc-950">
            <img
              src={activePreviewUrl}
              alt={`Selected item preview ${activePreviewIndex + 1}`}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
            {activePreviewIndex + 1} / {previewUrls.length}
          </div>
          {previewUrls.length > 1 ? (
            <div className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between">
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  setActivePreviewIndex((current) =>
                    current === 0 ? previewUrls.length - 1 : current - 1
                  )
                }
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-lg font-bold text-white disabled:opacity-50"
                aria-label="Previous image"
              >
                &lsaquo;
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  setActivePreviewIndex((current) =>
                    current === previewUrls.length - 1 ? 0 : current + 1
                  )
                }
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-lg font-bold text-white disabled:opacity-50"
                aria-label="Next image"
              >
                &rsaquo;
              </button>
            </div>
          ) : null}
          {isBusy ? (
            <p className="absolute inset-x-0 bottom-0 p-3 text-sm font-medium text-white">
              {stage || "Working..."}
            </p>
          ) : null}
        </div>
      ) : null}
      {previewUrls.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {previewUrls.map((url, index) => (
            <button
              key={url}
              type="button"
              disabled={isBusy}
              onClick={() => setActivePreviewIndex(index)}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-zinc-950 ${
                index === activePreviewIndex ? "border-emerald-400" : "border-zinc-800"
              }`}
              aria-label={`Show image ${index + 1}`}
            >
              <img src={url} alt="" className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      ) : null}
      {selectedFiles.length ? (
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void scanSelectedFiles()}
            className="min-h-12 rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-bold text-zinc-950 disabled:opacity-60"
          >
            {isBusy
              ? "Scanning..."
              : selectedFiles.length > 1
                ? `Analyze ${selectedFiles.length} photos`
                : "Analyze photo"}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              selectedFilesRef.current = [];
              setSelectedFiles([]);
              setScannedBarcode("");
              setBarcodeStatus("");
              setManualBarcode("");
              setActivePreviewIndex(0);
              setPreviewUrls((current) => {
                current.forEach((url) => URL.revokeObjectURL(url));
                return [];
              });
            }}
            className="min-h-12 rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm font-semibold text-zinc-300 disabled:opacity-60"
          >
            Clear
          </button>
        </div>
      ) : null}
      {isBusy && !activePreviewUrl ? (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
          {stage || "Working..."}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}
