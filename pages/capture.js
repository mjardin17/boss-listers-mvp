import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { requireSession, authedFetch, clearSession } from "../lib/clientAuth";
import { safeRandomUUID } from "../lib/safeUuid";

function getSessionId() {
  if (typeof window === "undefined") return "anon";
  let id = localStorage.getItem("boss_session");
  if (!id) {
    id = safeRandomUUID();
    localStorage.setItem("boss_session", id);
  }
  return id;
}

export default function Capture() {
  const [ready, setReady] = useState(false);
  const [photos, setPhotos] = useState([]); // { file, previewUrl }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState(null);
  const cameraInputRef = useRef(null);

  useEffect(() => {
    if (requireSession()) setReady(true);
    return () => photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addPhotos(fileList) {
    const files = Array.from(fileList || []).slice(0, 8 - photos.length);
    const next = files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    setPhotos((prev) => [...prev, ...next].slice(0, 8));
  }

  function removePhoto(index) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleGenerate() {
    if (!photos.length) {
      setError("Take at least one photo first.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      photos.forEach((p) => formData.append("photos", p.file, p.file.name || "photo.jpg"));
      formData.append("sessionId", getSessionId());
      formData.append("generate", "true");

      const res = await authedFetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || "Couldn't generate a listing from these photos.");
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err.message || "Upload failed — check your connection and try again.");
    } finally {
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
      const ebayListing = result.outputs.find((o) => o.platform === "eBay");
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

      const payload = {
        product: {
          sku: result.inventorySku,
          title: ebayListing.title,
          description: ebayListing.description,
          price: result.pricing?.recommendedPrice || result.pricing?.selectedPrice || 29.99,
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
        confirm: true,
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

      // Success
      alert(`✓ Published to eBay! Listing ID: ${data.listingId || "pending"}`);
      startOver();
    } catch (err) {
      setError(err.message || "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  function startOver() {
    photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    setPhotos([]);
    setResult(null);
    setError("");
  }

  if (!ready) return null;

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
              <div key={i} style={{ position: "relative", aspectRatio: "1" }}>
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
            {photos.length < 8 && (
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                style={{
                  aspectRatio: "1",
                  border: "2px dashed var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--surface)",
                  color: "var(--muted)",
                  fontSize: "2rem",
                }}
              >
                +
              </button>
            )}
          </div>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              addPhotos(e.target.files);
              e.target.value = "";
            }}
          />

          {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

          <button
            type="button"
            className="btn-primary"
            style={{ width: "100%", padding: "1rem", fontSize: "1.05rem" }}
            disabled={busy || !photos.length}
            onClick={handleGenerate}
          >
            {busy ? "Generating listing..." : "Generate listing"}
          </button>

          <p style={{ marginTop: "1.5rem" }}>
            <Link href="/">Full dashboard →</Link>
            {" · "}
            <Link href="/card-scan">Trading card scanner →</Link>
          </p>
        </>
      )}

      {result && (
        <div>
          <h2 style={{ fontSize: "1.1rem" }}>{result.analysis?.productName || "Item identified"}</h2>
          <p className="muted">{result.analysis?.summary}</p>

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
                key={i}
                src={p.previewUrl}
                alt=""
                style={{ width: 90, height: 90, objectFit: "cover", borderRadius: "var(--radius)", flexShrink: 0, imageOrientation: "from-image" }}
              />
            ))}
          </div>

          <p>
            Suggested price: <strong>${result.pricing?.recommendedPrice}</strong>
            {"  "}
            <span className="muted">
              (${result.pricing?.floorPrice}–${Math.ceil(result.pricing.recommendedPrice * 1.18)})
            </span>
          </p>

          {result.outputs?.map((item) => (
            <article key={item.platform} className="platform-card" data-platform={item.platform}>
              <header>
                <span className="platform-name">{item.platform}</span>
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
              disabled={publishing}
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
