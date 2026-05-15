import { useCallback, useEffect, useRef, useState } from "react";

function getSessionId() {
  if (typeof window === "undefined") return "anon";
  let id = localStorage.getItem("boss_session");
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "s-" + Date.now();
    localStorage.setItem("boss_session", id);
  }
  return id;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}

function PlatformCard({ item, onCopy, onExport }) {
  const profit = item.profit?.netProfit ?? 0;
  const negative = profit < 0;

  return (
    <article className="platform-card" data-platform={item.platform}>
      <header>
        <span className="platform-name">{item.platform}</span>
        <span className={`profit-pill${negative ? " negative" : ""}`}>
          ${profit.toFixed(2)} profit
        </span>
      </header>
      <div className="meta">
        List ${item.price} - margin {item.profit?.marginPct ?? 0}% - ROI{" "}
        {item.profit?.roiPct ?? 0}%
      </div>
      <p className="title-line">{item.title}</p>
      <p className="desc">{item.description}</p>
      {item.hashtags?.length ? <p className="hashtags">{item.hashtags.join(" ")}</p> : null}
      {(item.copyBlocks || []).map((block, index) => (
        <div className="copy-block" key={index}>
          <strong>{block.field}</strong>
          <pre>{block.text}</pre>
        </div>
      ))}
      <div className="btn-row">
        <button type="button" className="btn-secondary" onClick={() => onCopy(item)}>
          Copy all
        </button>
        <button type="button" className="btn-ghost" onClick={() => onExport(item)}>
          Export .txt
        </button>
      </div>
    </article>
  );
}

export default function Home() {
  const [photoFiles, setPhotoFiles] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState("");
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [activeHistoryId, setActiveHistoryId] = useState(null);

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [condition, setCondition] = useState("Used");
  const [size, setSize] = useState("");
  const [categoryHint, setCategoryHint] = useState("");
  const [suggestedPrice, setSuggestedPrice] = useState("");
  const [costOfGoods, setCostOfGoods] = useState("");
  const [weightLb, setWeightLb] = useState("1");
  const [description, setDescription] = useState("");

  const fileInputRef = useRef(null);
  const sessionIdRef = useRef("anon");

  useEffect(() => {
    sessionIdRef.current = getSessionId();
    fetchHistory();
    return () => {
      photoPreviews.forEach((url) => {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showToast(message, timeout = 1800) {
    setToast(message);
    if (message) setTimeout(() => setToast(""), timeout);
  }

  async function fetchHistory() {
    try {
      setHistoryLoading(true);
      const res = await fetch(
        `/api/listings?sessionId=${encodeURIComponent(sessionIdRef.current)}`
      );
      const data = await res.json();
      if (data.ok) setHistory(data.items || []);
    } catch {
      showToast("Could not load history");
    } finally {
      setHistoryLoading(false);
    }
  }

  const addPhotos = useCallback((files) => {
    const list = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
    if (!list.length) return;
    setPhotoFiles((prev) => [...prev, ...list].slice(0, 8));
    setPhotoPreviews((prev) => [
      ...prev,
      ...list.map((file) => URL.createObjectURL(file))
    ].slice(0, 8));
  }, []);

  function onFileChange(event) {
    addPhotos(event.target.files);
    event.target.value = "";
  }

  function onDrop(event) {
    event.preventDefault();
    setDragOver(false);
    addPhotos(event.dataTransfer.files);
  }

  function clearPhotos() {
    photoPreviews.forEach((url) => {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
    setPhotoFiles([]);
    setPhotoPreviews([]);
  }

  function appendCommonFields(formData, generate) {
    photoFiles.forEach((file) => formData.append("photos", file));
    formData.append("brand", brand);
    formData.append("model", model);
    formData.append("condition", condition);
    formData.append("size", size);
    formData.append("categoryHint", categoryHint);
    formData.append("suggestedPrice", suggestedPrice);
    formData.append("costOfGoods", costOfGoods);
    formData.append("weightLb", weightLb);
    formData.append("description", description);
    formData.append("sessionId", sessionIdRef.current);
    formData.append("generate", generate ? "true" : "false");
  }

  async function analyzeOnly() {
    if (!photoFiles.length && !brand && !model) {
      showToast("Add photos or enter brand/model");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      appendCommonFields(formData, false);
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Analyze failed");

      if (data.hints?.titleHint && !brand && !model) {
        const parts = data.hints.titleHint.split(/\s+/);
        if (parts[0]) setBrand(parts[0]);
        if (parts.slice(1).length) setModel(parts.slice(1).join(" "));
      }
      if (data.hints?.categoryHint) setCategoryHint(data.hints.categoryHint);
      if (data.input?.imageUrls?.length) setPhotoPreviews(data.input.imageUrls);
      setPricing(data.pricing || null);
      showToast("Photo analyzed - review fields");
    } catch (error) {
      showToast(error.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function generateListings() {
    if (!brand && !model) {
      showToast("Enter brand and model");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      appendCommonFields(formData, true);
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Generate failed");

      setOutputs(data.outputs || []);
      setPricing(data.pricing || null);
      if (data.input?.imageUrls?.length) setPhotoPreviews(data.input.imageUrls);
      showToast(`Generated ${data.outputs?.length || 0} listings`);
      await fetchHistory();
    } catch (error) {
      showToast(error.message || "Generate failed");
    } finally {
      setLoading(false);
    }
  }

  async function saveCurrent() {
    if (!outputs.length) {
      showToast("Generate listings first");
      return;
    }
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          input: {
            brand,
            model,
            condition,
            size,
            categoryHint,
            suggestedPrice: parseFloat(suggestedPrice) || undefined,
            costOfGoods: parseFloat(costOfGoods) || 0,
            weightLb: parseFloat(weightLb) || 1,
            description
          },
          outputs,
          imageUrls: photoPreviews.filter((url) => !url.startsWith("blob:"))
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      showToast("Saved to history");
      await fetchHistory();
    } catch (error) {
      showToast(error.message || "Save failed");
    }
  }

  function loadHistoryItem(item) {
    setActiveHistoryId(item.id);
    const input = item.payload?.input || {};
    setBrand(input.brand || "");
    setModel(input.model || "");
    setCondition(input.condition || "Used");
    setSize(input.size || "");
    setCategoryHint(input.categoryHint || "");
    setSuggestedPrice(input.suggestedPrice ? String(input.suggestedPrice) : "");
    setCostOfGoods(input.costOfGoods ? String(input.costOfGoods) : "");
    setWeightLb(input.weightLb ? String(input.weightLb) : "1");
    setDescription(input.description || "");
    setOutputs(item.payload?.outputs || []);
    if (item.payload?.imageUrls?.length) setPhotoPreviews(item.payload.imageUrls);
    setPricing(null);
    showToast("Loaded from history");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteHistoryItem(id, event) {
    event.stopPropagation();
    try {
      const res = await fetch(`/api/listings?id=${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      if (activeHistoryId === id) setActiveHistoryId(null);
      showToast("Deleted");
      await fetchHistory();
    } catch (error) {
      showToast(error.message || "Delete failed");
    }
  }

  function buildCopyText(item) {
    const lines = [
      `[${item.platform}]`,
      `Title: ${item.title}`,
      `Price: $${item.price}`,
      "",
      item.description || ""
    ];
    if (item.hashtags?.length) lines.push("", item.hashtags.join(" "));
    (item.copyBlocks || []).forEach((block) => {
      lines.push("", `--- ${block.field} ---`, block.text);
    });
    return lines.join("\n");
  }

  async function copyPlatform(item) {
    try {
      await navigator.clipboard.writeText(buildCopyText(item));
      showToast(`Copied ${item.platform}`);
    } catch {
      showToast("Copy failed");
    }
  }

  function exportPlatform(item) {
    const blob = new Blob([buildCopyText(item)], { type: "text/plain" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${item.platform}-listing.txt`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    showToast(`Exported ${item.platform}`);
  }

  function exportAll() {
    const text = outputs.map(buildCopyText).join("\n\n==========\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "all-platform-listings.txt";
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    showToast("Exported all platforms");
  }

  async function copyAllPlatforms() {
    const text = outputs.map(buildCopyText).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied all platforms");
    } catch {
      showToast("Copy failed");
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Boss Listers</h1>
          <p>Upload - fill details - generate multi-platform listings</p>
        </div>
        <span className="badge">MVP - 8 platforms</span>
      </header>
      <div className="layout">
        <main>
          <section className="panel">
            <h2>Product photos</h2>
            <p className="panel-sub">Up to 8 images. Filename hints help auto-fill.</p>
            <div
              className={`dropzone${dragOver ? " drag-over" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => event.key === "Enter" && fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={onFileChange} />
              <p>Tap or drag photos here</p>
              <p className="panel-sub">JPG, PNG, WEBP - max 12MB each</p>
            </div>
            {photoPreviews.length > 0 && (
              <div className="thumb-grid">
                {photoPreviews.map((src, index) => (
                  <div className="thumb" key={index}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Product ${index + 1}`} />
                  </div>
                ))}
              </div>
            )}
            <div className="btn-row">
              <button type="button" className="btn-secondary" onClick={analyzeOnly} disabled={loading}>
                {loading ? <span className="spinner" /> : null}
                Analyze photos
              </button>
              {photoPreviews.length > 0 && (
                <button type="button" className="btn-ghost" onClick={clearPhotos}>
                  Clear photos
                </button>
              )}
            </div>
          </section>

          <section className="panel" style={{ marginTop: "1rem" }}>
            <h2>Product info</h2>
            <p className="panel-sub">Used by the listing generator and profit estimates.</p>
            {pricing ? (
              <div className="pricing-summary">
                <div>
                  <span>Recommended</span>
                  <strong>${pricing.recommendedPrice}</strong>
                </div>
                <div>
                  <span>Floor</span>
                  <strong>${pricing.floorPrice}</strong>
                </div>
                <div>
                  <span>Expected profit</span>
                  <strong>${pricing.expectedProfit?.netProfit ?? 0}</strong>
                </div>
                <div>
                  <span>ROI</span>
                  <strong>{pricing.expectedProfit?.roiPct ?? 0}%</strong>
                </div>
              </div>
            ) : null}
            <div className="form-grid two">
              <label>
                Brand
                <input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Sony" />
              </label>
              <label>
                Model
                <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="MDR-7506" />
              </label>
              <label>
                Condition
                <select value={condition} onChange={(event) => setCondition(event.target.value)}>
                  <option>New</option>
                  <option>Like New</option>
                  <option>Used</option>
                  <option>For Parts</option>
                </select>
              </label>
              <label>
                Size
                <input value={size} onChange={(event) => setSize(event.target.value)} placeholder="10 / M" />
              </label>
              <label>
                Category hint
                <input value={categoryHint} onChange={(event) => setCategoryHint(event.target.value)} placeholder="electronics" />
              </label>
              <label>
                Weight (lb)
                <input type="number" min="0" step="0.1" value={weightLb} onChange={(event) => setWeightLb(event.target.value)} />
              </label>
              <label>
                Sale price ($)
                <input type="number" min="0" value={suggestedPrice} onChange={(event) => setSuggestedPrice(event.target.value)} placeholder="Auto if empty" />
              </label>
              <label>
                Cost of goods ($)
                <input type="number" min="0" value={costOfGoods} onChange={(event) => setCostOfGoods(event.target.value)} />
              </label>
            </div>
            <label style={{ marginTop: "0.65rem" }}>
              Description
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional - generator fills a default" />
            </label>
            <div className="btn-row">
              <button type="button" className="btn-primary" onClick={generateListings} disabled={loading}>
                {loading ? <span className="spinner" /> : null}
                Generate listings
              </button>
              <button type="button" className="btn-secondary" onClick={saveCurrent} disabled={!outputs.length}>
                Save to history
              </button>
            </div>
          </section>

          {outputs.length > 0 && (
            <section className="panel" style={{ marginTop: "1rem" }}>
              <div className="section-heading">
                <h2>Platform listings</h2>
                <div className="btn-row">
                  <button type="button" className="btn-secondary" onClick={copyAllPlatforms}>
                    Copy all
                  </button>
                  <button type="button" className="btn-ghost" onClick={exportAll}>
                    Export all
                  </button>
                </div>
              </div>
              <div className="platform-grid">
                {outputs.map((item) => (
                  <PlatformCard key={item.platform} item={item} onCopy={copyPlatform} onExport={exportPlatform} />
                ))}
              </div>
            </section>
          )}
        </main>

        <aside className="panel">
          <h2>Saved history</h2>
          <p className="panel-sub">{history.length} saved run{history.length === 1 ? "" : "s"}</p>
          {historyLoading ? (
            <p className="empty">
              <span className="spinner" /> Loading...
            </p>
          ) : history.length === 0 ? (
            <p className="empty">Generate and save listings to see them here.</p>
          ) : (
            <div className="history-list">
              {history.map((item) => {
                const input = item.payload?.input || {};
                const title = [input.brand, input.model].filter(Boolean).join(" ") || "Untitled";
                return (
                  <div
                    key={item.id}
                    className={`history-item${activeHistoryId === item.id ? " active" : ""}`}
                    onClick={() => loadHistoryItem(item)}
                    onKeyDown={(event) => event.key === "Enter" && loadHistoryItem(item)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="hi-title">{title}</div>
                    <div className="hi-meta">
                      {formatDate(item.createdAt)} - {(item.payload?.outputs || []).length} platforms
                    </div>
                    <button type="button" className="btn-danger" style={{ marginTop: "0.35rem" }} onClick={(event) => deleteHistoryItem(item.id, event)}>
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
