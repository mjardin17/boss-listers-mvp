import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { requireSession, authedFetch, clearSession } from "../lib/clientAuth";
import { safeRandomUUID } from "../lib/safeUuid";

const DRAFT_KEY = "boss_capture_draft_v1";
const MAX_PHOTOS = 8;
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.78;
const GENERATE_TIMEOUT_MS = 45000;

function getSessionId() {
  if (typeof window === "undefined") return "anon";
  let id = localStorage.getItem("boss_session");
  if (!id) {
    id = safeRandomUUID();
    localStorage.setItem("boss_session", id);
  }
  return id;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read this photo."));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToFile(dataUrl, name) {
  const [header, b64] = String(dataUrl).split(",");
  const mime = (header.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
  const binary = atob(b64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name || "photo.jpg", { type: mime, lastModified: Date.now() });
}

async function loadBitmap(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to HTMLImageElement, which iOS can use for HEIC.
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read this photo. Try taking it again."));
    };
    img.src = url;
  });
}

async function compressPhoto(file) {
  const source = await loadBitmap(file);
  const srcW = source.width || 0;
  const srcH = source.height || 0;
  if (!srcW || !srcH) {
    if (source.close) source.close();
    throw new Error("Could not read this photo. Try taking it again.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    if (source.close) source.close();
    throw new Error("Couldn't process this photo on this device.");
  }
  ctx.drawImage(source, 0, 0, width, height);
  if (source.close) source.close();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Could not compress this photo."))),
      "image/jpeg",
      JPEG_QUALITY
    );
  });
  const name = String(file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
  const compressed = new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  const dataUrl = await blobToDataUrl(blob);
  return { file: compressed, previewUrl: dataUrl, dataUrl };
}

function readDraft() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== "object") return null;
    return draft;
  } catch {
    return null;
  }
}

function writeDraft(partial) {
  if (typeof window === "undefined") return;
  try {
    const current = readDraft() || {};
    const next = { ...current, ...partial, savedAt: Date.now() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  } catch {
    // Quota or private mode — keep going with in-memory state only.
  }
}

function clearDraft() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

function listingTitle(result) {
  return (
    result?.analysis?.productName ||
    result?.analysis?.itemTitle ||
    result?.listing?.title ||
    result?.primaryDraft?.title ||
    result?.outputs?.[0]?.title ||
    "Item identified"
  );
}

function listingSummary(result) {
  return (
    result?.analysis?.summary ||
    result?.analysis?.recommendationExplanation ||
    result?.scanStatus?.warning ||
    ""
  );
}

const money = (n) => `$${Number(n).toFixed(2).replace(/\.00$/, "")}`;

/** Asking prices and sold prices, each labelled for what it is. Never called "value". */
function PriceLines({ comps, signals }) {
  const active = comps?.active;
  const sold = comps?.sold;
  const hasActive = active?.range?.low && active?.range?.high;
  const hasSold = sold?.range?.low && sold?.range?.high && sold?.count >= 3;
  return (
    <div className="muted" style={{ margin: "0.25rem 0 0.75rem", lineHeight: 1.5 }}>
      <p style={{ margin: 0 }}>
        <strong>Sold recently: </strong>
        {hasSold
          ? `${money(sold.range.low)} – ${money(sold.range.high)}, middle ${money(sold.range.midpoint || sold.range.low)} (${sold.count} exact sales)`
          : "none found on the sold-price sites we can check (eBay does not share its sold prices with apps like this)"}
      </p>
      <p style={{ margin: 0 }}>
        <strong>Listed now on eBay (asking): </strong>
        {hasActive
          ? `${money(active.range.low)} – ${money(active.range.high)}, middle ${money(active.range.midpoint || active.range.low)} (${active.count} listings)`
          : "no listings found"}
      </p>
      <p style={{ margin: 0 }}>
        <strong>You sold this before: </strong>
        {!signals ? "checking your eBay sales…"
          : signals.ownSales?.matches?.length
            ? signals.ownSales.matches.slice(0, 3).map((s) => `${money(s.price)} on ${String(s.soldAt).slice(0, 10)}`).join(", ")
            : signals.ownSales?.note || "not in your last 60 days of eBay sales"}
      </p>
      {signals?.web?.summary && (
        <details style={{ margin: "0.25rem 0" }}>
          <summary><strong>What the web says</strong> (Google results, not exact sales)</summary>
          <p style={{ margin: "0.25rem 0" }}>{signals.web.summary}</p>
          {(signals.web.sources || []).slice(0, 4).map((src) => (
            <a key={src.url || src} href={src.url || src} target="_blank" rel="noreferrer" style={{ display: "block" }}>{src.title || src.url || src}</a>
          ))}
        </details>
      )}
      <p style={{ margin: "0.25rem 0 0" }}>Asking prices are what other sellers want, not what items sold for. You set your price.</p>
    </div>
  );
}

export default function Capture() {
  const [ready, setReady] = useState(false);
  const [photos, setPhotos] = useState([]); // { file, previewUrl, dataUrl }
  const [busy, setBusy] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState(null);
  const [priceSignals, setPriceSignals] = useState(null);
  useEffect(() => {
    const title = result ? listingTitle(result) : "";
    setPriceSignals(null);
    if (!title || title === "Item identified") return undefined;
    let live = true;
    authedFetch("/api/price-signals?title=" + encodeURIComponent(title))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live) setPriceSignals(j || { failed: true }); })
      .catch(() => { if (live) setPriceSignals({ failed: true }); });
    return () => { live = false; };
  }, [result]);
  const [sellerPrice, setSellerPrice] = useState("");
  const cameraInputRef = useRef(null);
  const photosRef = useRef(photos);
  const restoredRef = useRef(false);
  const generateAbortRef = useRef(null);
  const generateTimeoutRef = useRef(null);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    if (!requireSession()) return;
    if (!restoredRef.current) {
      restoredRef.current = true;
      const draft = readDraft();
      if (draft?.photos?.length) {
        const restored = draft.photos
          .filter((item) => item?.dataUrl)
          .slice(0, MAX_PHOTOS)
          .map((item) => {
            const file = dataUrlToFile(item.dataUrl, item.name || "photo.jpg");
            return { file, previewUrl: item.dataUrl, dataUrl: item.dataUrl };
          });
        if (restored.length) setPhotos(restored);
      }
      if (draft?.result) setResult(draft.result);
      if (draft?.sellerPrice) setSellerPrice(String(draft.sellerPrice));
      // Never restore a stuck "Generating listing..." state. If a previous
      // attempt was interrupted (iOS reload, dropped LAN request), just
      // keep the photos and let the seller tap Generate again.
      if (draft?.pendingGenerate && !draft?.result) {
        setError("The last generate didn't finish. Your photos are still here — tap Generate listing to try again.");
        writeDraft({ ...draft, pendingGenerate: false });
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    function clearGenerateTimers() {
      if (generateTimeoutRef.current) {
        clearTimeout(generateTimeoutRef.current);
        generateTimeoutRef.current = null;
      }
    }
    function onPageShow(event) {
      // iOS can freeze or restore this PWA mid-request. Don't leave the
      // button stuck on "Generating listing..." after a resume.
      if (event.persisted || generateAbortRef.current) {
        generateAbortRef.current?.abort();
        generateAbortRef.current = null;
        clearGenerateTimers();
        setBusy(false);
        setCompressing(false);
      }
    }
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      generateAbortRef.current?.abort();
      clearGenerateTimers();
    };
  }, []);

  function persistPhotos(nextPhotos, extras = {}) {
    writeDraft({
      photos: nextPhotos.map((p) => ({ name: p.file?.name || "photo.jpg", dataUrl: p.dataUrl || p.previewUrl })),
      ...extras
    });
  }

  async function addPhotos(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    const remaining = MAX_PHOTOS - photosRef.current.length;
    if (remaining <= 0) {
      setError("You can add up to 8 photos.");
      return;
    }
    setCompressing(true);
    setError("");
    try {
      const added = [];
      for (const file of incoming.slice(0, remaining)) {
        added.push(await compressPhoto(file));
      }
      const next = [...photosRef.current, ...added].slice(0, MAX_PHOTOS);
      setPhotos(next);
      persistPhotos(next, { result: null, pendingGenerate: false });
    } catch (err) {
      setError(err.message || "Couldn't process that photo. Try taking it again.");
    } finally {
      setCompressing(false);
    }
  }

  function removePhoto(index) {
    setPhotos((prev) => {
      const next = prev.filter((_, i) => i !== index);
      persistPhotos(next, { result });
      return next;
    });
  }

  function clearGenerateTimers() {
    if (generateTimeoutRef.current) {
      clearTimeout(generateTimeoutRef.current);
      generateTimeoutRef.current = null;
    }
  }

  function stopGenerateRequest() {
    generateAbortRef.current?.abort();
    generateAbortRef.current = null;
    clearGenerateTimers();
  }

  function cancelGenerate() {
    stopGenerateRequest();
    setBusy(false);
    persistPhotos(photosRef.current, { result: null, pendingGenerate: false });
    setError("Cancelled. Your photos are still here — tap Generate listing to try again.");
  }

  async function handleGenerate() {
    if (!photosRef.current.length) {
      setError("Take at least one photo first.");
      return;
    }
    stopGenerateRequest();
    setBusy(true);
    setError("");
    setResult(null);
    writeDraft({
      photos: photosRef.current.map((p) => ({ name: p.file?.name || "photo.jpg", dataUrl: p.dataUrl || p.previewUrl })),
      result: null,
      pendingGenerate: true
    });

    const controller = new AbortController();
    generateAbortRef.current = controller;

    try {
      const formData = new FormData();
      photosRef.current.forEach((p) => formData.append("photos", p.file, p.file.name || "photo.jpg"));
      formData.append("sessionId", getSessionId());
      formData.append("generate", "true");

      const timeoutError = Object.assign(
        new Error("Listing generation took too long. Your photos are still here — try again."),
        { name: "TimeoutError" }
      );
      const timeoutPromise = new Promise((_, reject) => {
        generateTimeoutRef.current = setTimeout(() => {
          controller.abort();
          reject(timeoutError);
        }, GENERATE_TIMEOUT_MS);
      });

      const res = await Promise.race([
        authedFetch("/api/analyze", { method: "POST", body: formData, signal: controller.signal }),
        timeoutPromise
      ]);
      let data = null;
      try {
        data = await res.json();
      } catch {
        setError("The server didn't return listing data. Your photos are still here — try again.");
        return;
      }

      if (!res.ok || !data.ok) {
        setError(
          data.error ||
            data.scanStatus?.warning ||
            "Couldn't generate a listing from these photos. Your photos are still here — try again."
        );
        persistPhotos(photosRef.current, { result: null, pendingGenerate: false });
        return;
      }

      setResult(data);
      // The price box stays empty: the seller sets the price, the app only shows comps.
      const price = "";
      setSellerPrice(price);
      persistPhotos(photosRef.current, { result: data, sellerPrice: price, pendingGenerate: false });
    } catch (err) {
      if (err?.name === "AbortError" && generateAbortRef.current !== controller) {
        // A newer generate or an explicit cancel already set the message.
        return;
      }
      const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
      setError(
        timedOut
          ? "Listing generation took too long. Your photos are still here — try again."
          : (err.message || "Upload failed — check your connection. Your photos are still here — try again.")
      );
      persistPhotos(photosRef.current, { result: null, pendingGenerate: false });
    } finally {
      clearGenerateTimers();
      if (generateAbortRef.current === controller) generateAbortRef.current = null;
      setBusy(false);
    }
  }

  // eBay only accepts these exact condition values (lib/ebay_listing.py
  // VALID_CONDITIONS). analyzeService's `condition` is free-text guessed
  // from the photos, so it has to be mapped, not sent as-is — the old code
  // sent the literal string "UsedGood", which isn't one of these and would
  // have been rejected by eBay on every single real publish attempt.
  function mapConditionToEbay(conditionText) {
    const t = (conditionText || "").toLowerCase();
    if (/new.*defect/.test(t)) return "NEW_WITH_DEFECTS";
    if (/new.*other|open box/.test(t)) return "NEW_OTHER";
    if (/^new\b|brand new/.test(t)) return "NEW";
    if (/like new|mint/.test(t)) return "LIKE_NEW";
    if (/excellent/.test(t)) return "USED_EXCELLENT";
    if (/very good/.test(t)) return "USED_VERY_GOOD";
    if (/acceptable|fair|worn/.test(t)) return "USED_ACCEPTABLE";
    if (/parts|not working|broken|damaged/.test(t)) return "FOR_PARTS_OR_NOT_WORKING";
    return "USED_GOOD";
  }

  async function handlePublish() {
    if (!result?.outputs?.length) {
      setError("No listing data to publish.");
      return;
    }

    setPublishing(true);
    setError("");

    try {
      const ebayListing = result.outputs.find((o) => o.platform === "eBay") || result.primaryDraft;
      if (!ebayListing) {
        setError("No eBay listing generated. Try regenerating.");
        setPublishing(false);
        return;
      }
      if (!result.inventorySku) {
        setError("No SKU was generated for this item — try regenerating the listing.");
        setPublishing(false);
        return;
      }
      const imageUrls = (result.imageUrls || []).filter((u) => /^https?:\/\//.test(u));
      if (!imageUrls.length) {
        setError("No publicly-hosted photo available yet — try regenerating the listing.");
        setPublishing(false);
        return;
      }

      // Real eBay category — required, no default exists.
      const categoryRes = await authedFetch(
        "/api/channels/ebay/category-suggest?q=" + encodeURIComponent(ebayListing.title)
      );
      const categoryData = await categoryRes.json();
      if (!categoryRes.ok || !categoryData.ok || !categoryData.best?.categoryId) {
        setError("Couldn't determine an eBay category for this item: " + (categoryData.error || "unknown error"));
        setPublishing(false);
        return;
      }

      // Real business policy IDs — required, specific to your eBay
      // account. There is no safe default; guessing produces a listing
      // with the wrong shipping/returns/payment terms.
      const policiesRes = await authedFetch("/api/channels/ebay/policies");
      const policiesData = await policiesRes.json();
      if (
        !policiesRes.ok ||
        !policiesData.ok ||
        !policiesData.fulfillmentPolicies?.length ||
        !policiesData.paymentPolicies?.length ||
        !policiesData.returnPolicies?.length ||
        !policiesData.merchantLocations?.length
      ) {
        setError(
          "Your eBay business policies aren't readable yet — finish connecting eBay on the Channels page (needs the full-permission reconnect), then try again."
        );
        setPublishing(false);
        return;
      }

      // Never invent a price: the seller sets it.
      const listingPrice = Number(sellerPrice);
      if (!Number.isFinite(listingPrice) || listingPrice <= 0) {
        setError("Enter the price you want for this item, then tap Publish.");
        setPublishing(false);
        return;
      }

      const payload = {
        product: {
          sku: result.inventorySku,
          title: ebayListing.title,
          description: ebayListing.description,
          price: listingPrice,
          quantity: 1,
          condition: mapConditionToEbay(result.analysis?.condition),
          category_id: categoryData.best.categoryId,
          image_urls: imageUrls,
        },
        policies: {
          fulfillment_policy_id: policiesData.fulfillmentPolicies[0].id,
          payment_policy_id: policiesData.paymentPolicies[0].id,
          return_policy_id: policiesData.returnPolicies[0].id,
          merchant_location_key: policiesData.merchantLocations[0].key,
        },
        dryRun: false,
        confirm: "PUBLISH_LIVE", // the seller pressing Publish is the explicit confirmation
      };

      const res = await authedFetch("/api/channels/ebay/create-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || "Failed to publish listing");
        setPublishing(false);
        return;
      }

      // Only claim success when eBay actually returned a live listing.
      if (data.published !== true) {
        setError(`eBay created the offer but did not publish it${data.note ? ": " + data.note : "."}`);
        setPublishing(false);
        return;
      }
      alert(`✓ Published to eBay! Listing ID: ${data.listingId}`);
      startOver();
    } catch (err) {
      setError(err.message || "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  function startOver() {
    stopGenerateRequest();
    setBusy(false);
    setCompressing(false);
    setPhotos([]);
    setResult(null);
    setSellerPrice("");
    setError("");
    clearDraft();
  }

  if (!ready) return null;

  const displayTitle = listingTitle(result);
  const displaySummary = listingSummary(result);
  const listingCards = result?.outputs?.length
    ? result.outputs
    : result?.primaryDraft
      ? [result.primaryDraft]
      : [];

  return (
    <div className="app-shell" style={{ maxWidth: 480, paddingBottom: "4rem" }}>
      <div className="topbar">
        <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Add item</h1>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            clearSession();
            window.location.href = "/login";
          }}
        >
          Sign out
        </button>
      </div>

      {!result && (
        <>
          <p className="muted">Snap a few photos of the item — we'll write the listing for you.</p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "0.5rem",
              margin: "1rem 0",
            }}
          >
            {photos.map((p, i) => (
              <div key={p.dataUrl || i} style={{ position: "relative", aspectRatio: "1" }}>
                <img
                  src={p.previewUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "var(--radius)", imageOrientation: "from-image" }}
                />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    background: "rgba(0,0,0,0.6)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "50%",
                    width: 24,
                    height: 24,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={compressing || busy}
                style={{
                  aspectRatio: "1",
                  border: "2px dashed var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--surface)",
                  color: "var(--muted)",
                  fontSize: "2rem",
                }}
              >
                {compressing ? "…" : "+"}
              </button>
            )}
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              addPhotos(e.target.files);
              e.target.value = "";
            }}
          />

          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          {compressing && <p className="muted">Saving a smaller copy of your photo so the phone doesn't restart…</p>}

          <button
            type="button"
            className="btn-primary"
            style={{ width: "100%", padding: "1rem", fontSize: "1.05rem" }}
            disabled={busy || compressing || !photos.length}
            onClick={handleGenerate}
          >
            {busy ? "Generating listing..." : "Generate listing"}
          </button>
          {busy && (
            <button
              type="button"
              className="btn-secondary"
              style={{ width: "100%", padding: "0.85rem", marginTop: "0.5rem" }}
              onClick={cancelGenerate}
            >
              Cancel
            </button>
          )}
          {!!photos.length && (
            <button
              type="button"
              className="btn-ghost"
              style={{ width: "100%", padding: "0.75rem", marginTop: "0.35rem" }}
              onClick={startOver}
            >
              Reset / Clear photos
            </button>
          )}

          <p style={{ marginTop: "1.5rem" }}>
            <Link href="/">Full dashboard →</Link>
            {" · "}
            <Link href="/card-scan">Trading card scanner →</Link>
          </p>
        </>
      )}

      {result && (
        <div>
          <h2 style={{ fontSize: "1.1rem" }}>{displayTitle}</h2>
          {displaySummary && <p className="muted">{displaySummary}</p>}
          {result.scanStatus?.warning && result.scanStatus.warning !== displaySummary && (
            <p style={{ color: "var(--danger)" }}>{result.scanStatus.warning}</p>
          )}
          {!listingCards.length && (
            <p style={{ color: "var(--danger)" }}>
              The scan finished but didn't produce listing text. Your photos are still saved — try generating again.
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              overflowX: "auto",
              margin: "1rem 0",
            }}
          >
            {photos.map((p, i) => (
              <img
                key={p.dataUrl || i}
                src={p.previewUrl}
                alt=""
                style={{ width: 90, height: 90, objectFit: "cover", borderRadius: "var(--radius)", flexShrink: 0, imageOrientation: "from-image" }}
              />
            ))}
          </div>

          <label style={{ display: "block", margin: "0.75rem 0" }}>
            <strong>Your price ($)</strong>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="Enter your price"
              value={sellerPrice}
              onChange={(e) => {
                setSellerPrice(e.target.value);
                persistPhotos(photosRef.current, { result, sellerPrice: e.target.value });
              }}
              style={{ display: "block", width: "100%", marginTop: "0.35rem", padding: "0.8rem", fontSize: "1.1rem" }}
            />
          </label>
          <PriceLines comps={result.comps} signals={priceSignals} />

          {listingCards.map((item) => (
            <article key={item.platform || item.title} className="platform-card" data-platform={item.platform}>
              <header>
                <span className="platform-name">{item.platform || "Listing"}</span>
              </header>
              <p className="title-line">{item.title}</p>
              <p className="desc">{item.description}</p>
            </article>
          ))}

          {error && <p style={{ color: "var(--danger)", marginTop: "1rem" }}>{error}</p>}

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
            <button
              type="button"
              className="btn-primary"
              style={{ flex: 1, padding: "1rem" }}
              disabled={publishing || !listingCards.length}
              onClick={handlePublish}
            >
              {publishing ? "Publishing..." : "Publish to eBay →"}
            </button>
            <button type="button" className="btn-secondary" onClick={startOver}>
              Add another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
