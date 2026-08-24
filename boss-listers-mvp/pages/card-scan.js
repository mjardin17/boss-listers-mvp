import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { requireSession, authedFetch, clearSession } from "../lib/clientAuth";

const STATUS_LABEL = {
  confirmed: "Confirmed",
  likely: "Likely match",
  needs_review: "Needs your confirmation",
  unknown: "Could not identify",
};

const STATUS_COLOR = {
  confirmed: "var(--accent, #34d399)",
  likely: "#f59e0b",
  needs_review: "#f59e0b",
  unknown: "var(--danger, #f87171)",
};

function FieldRow({ label, value }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", padding: "0.35rem 0", borderBottom: "1px solid var(--border, #2a3142)" }}>
      <span style={{ color: "var(--muted, #9aa3b5)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{String(value)}</span>
    </div>
  );
}

function CardFieldsSummary({ fields }) {
  return (
    <div>
      <FieldRow label="Player / Character" value={fields.player} />
      <FieldRow label="Team" value={fields.team} />
      <FieldRow label="Sport / Game" value={fields.cardGame || fields.sport} />
      <FieldRow label="Year" value={fields.year} />
      <FieldRow label="Manufacturer" value={fields.manufacturer} />
      <FieldRow label="Set" value={fields.set} />
      <FieldRow label="Card Number" value={fields.cardNumber} />
      <FieldRow label="Parallel / Variant" value={fields.parallel || fields.variant} />
      <FieldRow label="Serial Number" value={fields.serialNumber} />
      <FieldRow label="Rookie Card" value={fields.rookieCard ? "Yes" : null} />
      <FieldRow label="Autograph" value={fields.autograph ? "Yes" : null} />
      <FieldRow label="Memorabilia/Relic" value={fields.memorabilia ? "Yes" : null} />
      <FieldRow label="Grading" value={fields.graded ? `${fields.gradingCompany} ${fields.grade}` : fields.graded === false ? "Raw (ungraded)" : null} />
      <FieldRow label="Certification #" value={fields.certificationNumber} />
      <FieldRow label="Condition Notes" value={fields.conditionNotes} />
    </div>
  );
}

function ValuationPanel({ valuation }) {
  if (valuation.status === "insufficient") {
    return (
      <div style={{ padding: "1rem", background: "var(--surface, #181b24)", borderRadius: "var(--radius, 10px)", border: "1px solid var(--border, #2a3142)" }}>
        <p style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          BossLister could not establish a reliable value for this exact card.
        </p>
        <p style={{ fontSize: "0.78rem", color: "var(--muted, #9aa3b5)" }}>
          Confirm the card identity or connect an approved pricing-data provider.
        </p>
        {valuation.explanation && (
          <p style={{ fontSize: "0.72rem", color: "var(--muted, #9aa3b5)", marginTop: "0.5rem", fontStyle: "italic" }}>
            {valuation.explanation}
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: "1rem", background: "var(--surface, #181b24)", borderRadius: "var(--radius, 10px)", border: "1px solid var(--border, #2a3142)" }}>
      <p style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted, #9aa3b5)" }}>
        Provider market estimate — not a verified sale
      </p>
      <p style={{ fontSize: "1.4rem", fontWeight: 700, margin: "0.25rem 0" }}>${valuation.market}</p>
      {(valuation.low != null || valuation.high != null) && (
        <p style={{ fontSize: "0.75rem", color: "var(--muted, #9aa3b5)" }}>
          Range: ${valuation.low ?? "?"} – ${valuation.high ?? "?"}
        </p>
      )}
      <p style={{ fontSize: "0.7rem", color: "var(--muted, #9aa3b5)", marginTop: "0.5rem" }}>
        Source: {valuation.provider} · {new Date(valuation.fetchedAt).toLocaleString()}
      </p>
    </div>
  );
}

export default function CardScan() {
  const [ready, setReady] = useState(false);
  const [frontPhoto, setFrontPhoto] = useState(null); // { file, previewUrl }
  const [backPhoto, setBackPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { identification, valuation, requiresConfirmation }
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmedValuation, setConfirmedValuation] = useState(null);

  const frontInputRef = useRef(null);
  const backInputRef = useRef(null);

  useEffect(() => {
    if (requireSession()) setReady(true);
    return () => {
      if (frontPhoto) URL.revokeObjectURL(frontPhoto.previewUrl);
      if (backPhoto) URL.revokeObjectURL(backPhoto.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePhoto(side, file) {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    if (side === "front") setFrontPhoto({ file, previewUrl });
    else setBackPhoto({ file, previewUrl });
  }

  async function handleScan() {
    if (!frontPhoto) {
      setError("Front photo is required.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    setSelectedCandidateIndex(null);
    setConfirmedValuation(null);

    try {
      const formData = new FormData();
      formData.append("front", frontPhoto.file, frontPhoto.file.name || "front.jpg");
      if (backPhoto) formData.append("back", backPhoto.file, backPhoto.file.name || "back.jpg");

      const res = await authedFetch("/api/identify-card", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error || "Card identification failed.");
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err.message || "Upload failed — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCandidate(index) {
    setSelectedCandidateIndex(index);
    setConfirming(true);
    setConfirmedValuation(null);
    try {
      // Candidate confirmed by the user — now safe to price. The pricing
      // provider isn't re-invoked automatically here since it requires a
      // fresh photo round-trip in this MVP; this at least makes the
      // confirmed fields the source of truth for saving to inventory.
      setConfirmedValuation(result.valuation.status === "insufficient" ? result.valuation : null);
    } finally {
      setConfirming(false);
    }
  }

  function startOver() {
    if (frontPhoto) URL.revokeObjectURL(frontPhoto.previewUrl);
    if (backPhoto) URL.revokeObjectURL(backPhoto.previewUrl);
    setFrontPhoto(null);
    setBackPhoto(null);
    setResult(null);
    setError("");
    setSelectedCandidateIndex(null);
    setConfirmedValuation(null);
  }

  if (!ready) return null;

  const finalFields =
    result?.identification.status === "needs_review" && selectedCandidateIndex !== null
      ? result.identification.candidates[selectedCandidateIndex]
      : result?.identification.fields;

  const canSave =
    result &&
    (result.identification.status === "confirmed" ||
      result.identification.status === "likely" ||
      (result.identification.status === "needs_review" && selectedCandidateIndex !== null));

  return (
    <div className="app-shell" style={{ maxWidth: 560, paddingBottom: "4rem" }}>
      <div className="topbar">
        <div>
          <h1 style={{ fontSize: "1.4rem", margin: 0 }}>Scan a Card</h1>
          <p className="muted" style={{ fontSize: "0.8rem" }}>Front + back photos for accurate identification</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => { clearSession(); window.location.href = "/login"; }}>
          Sign out
        </button>
      </div>

      {!result && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", margin: "1.5rem 0" }}>
            {["front", "back"].map((side) => {
              const photo = side === "front" ? frontPhoto : backPhoto;
              const ref = side === "front" ? frontInputRef : backInputRef;
              return (
                <div key={side}>
                  <p style={{ fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "0.4rem", color: "var(--muted, #9aa3b5)" }}>
                    {side} {side === "front" ? "(required)" : "(recommended)"}
                  </p>
                  <button
                    type="button"
                    onClick={() => ref.current?.click()}
                    style={{
                      width: "100%",
                      aspectRatio: "0.7",
                      border: photo ? "none" : "2px dashed var(--border, #2a3142)",
                      borderRadius: "var(--radius, 10px)",
                      background: "var(--surface, #181b24)",
                      overflow: "hidden",
                      padding: 0,
                    }}
                  >
                    {photo ? (
                      <img src={photo.previewUrl} alt={`${side} of card`} style={{ width: "100%", height: "100%", objectFit: "cover", imageOrientation: "from-image" }} />
                    ) : (
                      <span style={{ color: "var(--muted, #9aa3b5)", fontSize: "1.5rem" }}>+</span>
                    )}
                  </button>
                  <input
                    ref={ref}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => { handlePhoto(side, e.target.files?.[0]); e.target.value = ""; }}
                  />
                </div>
              );
            })}
          </div>

          {error && <p style={{ color: "var(--danger, #f87171)", fontSize: "0.8rem" }}>{error}</p>}

          <button
            type="button"
            className="btn-primary"
            style={{ width: "100%", padding: "1rem", fontSize: "1.05rem" }}
            disabled={busy || !frontPhoto}
            onClick={handleScan}
          >
            {busy ? "Identifying card..." : "Identify Card"}
          </button>

          <p style={{ marginTop: "1.5rem" }}>
            <Link href="/capture">General item scanner →</Link>
          </p>
        </>
      )}

      {result && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            <span
              style={{
                fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase",
                padding: "0.25rem 0.6rem", borderRadius: "999px",
                color: "#0a0a0a", background: STATUS_COLOR[result.identification.status],
              }}
            >
              {STATUS_LABEL[result.identification.status]}
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--muted, #9aa3b5)" }}>
              Identification confidence: {result.identification.confidenceScore}%
            </span>
          </div>

          {result.identification.status === "unknown" && (
            <div style={{ padding: "1rem", background: "var(--surface, #181b24)", borderRadius: "var(--radius, 10px)" }}>
              <p style={{ fontSize: "0.85rem" }}>Could not identify this card from the photos provided.</p>
              {result.identification.error && (
                <p style={{ fontSize: "0.75rem", color: "var(--muted, #9aa3b5)", marginTop: "0.5rem" }}>{result.identification.error}</p>
              )}
              <p style={{ fontSize: "0.75rem", color: "var(--muted, #9aa3b5)", marginTop: "0.5rem" }}>
                Try clearer, well-lit photos with the card number and set name visible.
              </p>
            </div>
          )}

          {result.identification.status === "needs_review" && (
            <div>
              <p style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                Multiple possible matches — confirm which one is correct:
              </p>
              {result.identification.candidates.map((candidate, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => confirmCandidate(i)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", marginBottom: "0.6rem",
                    padding: "0.75rem", borderRadius: "var(--radius, 10px)",
                    border: selectedCandidateIndex === i ? "2px solid var(--accent-strong, #34d399)" : "1px solid var(--border, #2a3142)",
                    background: "var(--surface, #181b24)",
                  }}
                >
                  <div style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    {candidate.player || "Unknown player"} — {candidate.set || "Unknown set"} {candidate.parallel ? `(${candidate.parallel})` : ""}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted, #9aa3b5)" }}>
                    #{candidate.cardNumber || "?"} · {candidate.year || "?"} · {candidate.confidenceScore}% match
                  </div>
                </button>
              ))}
            </div>
          )}

          {finalFields && result.identification.status !== "unknown" && (
            <div style={{ marginTop: "1rem" }}>
              <CardFieldsSummary fields={finalFields} />
            </div>
          )}

          {(result.identification.status === "confirmed" || result.identification.status === "likely") && (
            <div style={{ marginTop: "1rem" }}>
              <ValuationPanel valuation={result.valuation} />
            </div>
          )}

          {result.identification.status === "needs_review" && selectedCandidateIndex !== null && (
            <div style={{ marginTop: "1rem" }}>
              <ValuationPanel
                valuation={{
                  status: "insufficient",
                  explanation: "Re-scan with this candidate confirmed to fetch a fresh price, or add pricing manually.",
                }}
              />
            </div>
          )}

          <button type="button" className="btn-secondary" style={{ width: "100%", marginTop: "1.5rem" }} onClick={startOver}>
            Scan another card
          </button>
        </div>
      )}
    </div>
  );
}
