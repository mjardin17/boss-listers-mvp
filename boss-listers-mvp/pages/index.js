import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const demoProducts = [
  {
    brand: "Sony",
    model: "MDR-7506",
    condition: "Used",
    categoryHint: "electronics",
    suggestedPrice: "",
    costOfGoods: "20",
    weightLb: "1",
    description: "Studio monitor headphones with clean earcups and tested audio."
  },
  {
    brand: "Nike",
    model: "Air Max 90",
    condition: "Like New",
    size: "10",
    categoryHint: "footwear",
    suggestedPrice: "",
    costOfGoods: "28",
    weightLb: "2",
    description: "Lightly worn sneakers with strong tread and clean uppers."
  },
  {
    brand: "Levi's",
    model: "Trucker Jacket",
    condition: "Used",
    size: "M",
    categoryHint: "vintage clothing",
    suggestedPrice: "",
    costOfGoods: "18",
    weightLb: "2",
    description: "Classic denim jacket with natural fading and no major flaws."
  }
];

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

function PlatformCard({ item, onCopy, onExport }) {
  const profit = item.profit?.netProfit ?? 0;
  const negative = profit < 0;

  return (
    <article className="platform-card" data-platform={item.platform}>
      <header>
        <span className="platform-name">{item.platform}</span>
        <span className={`profit-pill${negative ? " negative" : ""}`}>
          ${profit.toFixed(2)}
        </span>
      </header>
      <div className="meta">
        List ${item.price} - margin {item.profit?.marginPct ?? 0}% - ROI{" "}
        {item.profit?.roiPct ?? 0}%
      </div>
      <p className="title-line">{item.title}</p>
      <p className="desc">{item.description}</p>
      {item.hashtags?.length ? <p className="hashtags">{item.hashtags.join(" ")}</p> : null}
      <div className="btn-row compact">
        <button type="button" className="btn-secondary" onClick={() => onCopy(item)}>
          Copy
        </button>
        <button type="button" className="btn-ghost" onClick={() => onExport(item)}>
          Export
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
  const [analysisResult, setAnalysisResult] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState("");
  const [dragOver, setDragOver] = useState(false);

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
  const cameraInputRef = useRef(null);
  const sessionIdRef = useRef("anon");

  useEffect(() => {
    sessionIdRef.current = getSessionId();
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

  const addPhotos = useCallback((files) => {
    const list = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
    if (!list.length) return;
    setPhotoFiles((prev) => [...prev, ...list].slice(0, 8));
    setPhotoPreviews((prev) => [
      ...prev,
      ...list.map((file) => URL.createObjectURL(file))
    ].slice(0, 8));
  }, []);

  function clearPhotos() {
    photoPreviews.forEach((url) => {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
    setPhotoFiles([]);
    setPhotoPreviews([]);
    setAnalysisResult(null);
  }

  function onDrop(event) {
    event.preventDefault();
    setDragOver(false);
    addPhotos(event.dataTransfer.files);
  }

  function onFileChange(event) {
    addPhotos(event.target.files);
    event.target.value = "";
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
    if (analysisResult) {
      formData.append("analysisResult", JSON.stringify(analysisResult));
    }
  }

  function applyDemoProduct(product) {
    setBrand(product.brand);
    setModel(product.model);
    setCondition(product.condition);
    setSize(product.size || "");
    setCategoryHint(product.categoryHint);
    setSuggestedPrice(product.suggestedPrice);
    setCostOfGoods(product.costOfGoods);
    setWeightLb(product.weightLb);
    setDescription(product.description);
    setPricing(null);
    setAnalysisResult(null);
    setOutputs([]);
    showToast("Demo product loaded");
  }

  async function runAnalyze(generate) {
    if (!photoFiles.length && !brand && !model) {
      showToast("Add photos or enter product info");
      return;
    }
    setBusyAction(generate ? "generate" : "analyze");
    setProgress(generate ? 18 : 24);
    try {
      const formData = new FormData();
      appendCommonFields(formData, generate);
      setProgress(generate ? 42 : 56);
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Request failed");

      const nextAnalysis = data.analysis || null;
      if (nextAnalysis) {
        setAnalysisResult(nextAnalysis);
        if (nextAnalysis.brand) setBrand(nextAnalysis.brand);
        if (nextAnalysis.productName) setModel(nextAnalysis.productName);
        if (nextAnalysis.category) setCategoryHint(nextAnalysis.category);
        if (nextAnalysis.conditionGuess) setCondition(nextAnalysis.conditionGuess);
      } else if (data.hints?.titleHint && !brand && !model) {
        const parts = data.hints.titleHint.split(/\s+/);
        if (parts[0]) setBrand(parts[0]);
        if (parts.slice(1).length) setModel(parts.slice(1).join(" "));
      }
      if (data.hints?.categoryHint && !nextAnalysis?.category)
        setCategoryHint(data.hints.categoryHint);
      if (data.input?.imageUrls?.length) setPhotoPreviews(data.input.imageUrls);
      setPricing(data.pricing || null);
      if (generate) setOutputs(data.outputs || []);
      setProgress(100);
      showToast(generate ? "Listings generated" : "Item analyzed");
    } catch (error) {
      showToast(error.message || "Request failed");
    } finally {
      setTimeout(() => {
        setBusyAction("");
        setProgress(0);
      }, 350);
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
    } catch (error) {
      showToast(error.message || "Save failed");
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Boss Listers AI</p>
          <h1>Reseller listing dashboard</h1>
        </div>
        <nav>
          <Link href="/" className="nav-link active">
            Dashboard
          </Link>
          <Link href="/history" className="nav-link">
            History
          </Link>
        </nav>
      </header>

      <section className="overview-grid">
        <article className="metric-card">
          <span>Photos</span>
          <strong>{photoPreviews.length}</strong>
        </article>
        <article className="metric-card">
          <span>Marketplaces</span>
          <strong>{outputs.length || 10}</strong>
        </article>
        <article className="metric-card">
          <span>Expected profit</span>
          <strong>${pricing?.expectedProfit?.netProfit ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span>ROI</span>
          <strong>{pricing?.expectedProfit?.roiPct ?? 0}%</strong>
        </article>
      </section>

      <section className="workflow-strip" aria-label="Workflow">
        {[
          "Add product photo/details",
          "Analyze product",
          "Generate marketplace listings",
          "Review / export / copy listings"
        ].map((label, index) => (
          <div
            className={`workflow-step${
              (index === 1 && analysisResult) ||
              (index === 2 && outputs.length) ||
              (index === 3 && outputs.length)
                ? " complete"
                : ""
            }`}
            key={label}
          >
            <span>{index + 1}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </section>

      <div className="dashboard-grid">
        <main className="stack">
          <section className="panel upload-panel">
            <div className="section-heading">
              <div>
                <h2>Step 1: Add product photo/details</h2>
                <p className="panel-sub">Upload the item, then add anything the photo cannot show.</p>
              </div>
              {photoPreviews.length ? (
                <button type="button" className="btn-ghost" onClick={clearPhotos}>
                  Clear
                </button>
              ) : null}
            </div>
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
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onFileChange}
              />
              <strong>Drop product photos here</strong>
              <span>JPG, PNG, WEBP - up to 8 images</span>
            </div>
            <div className="action-grid">
              <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                Upload File
              </button>
              <button type="button" className="btn-secondary" onClick={() => cameraInputRef.current?.click()}>
                Take Photo
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => runAnalyze(false)}
                disabled={Boolean(busyAction)}
              >
                {busyAction === "analyze" ? "Analyzing..." : "Analyze product"}
              </button>
            </div>
            {photoPreviews.length ? (
              <div className="thumb-grid">
                {photoPreviews.map((src, index) => (
                  <div className="thumb" key={index}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Product ${index + 1}`} />
                  </div>
                ))}
              </div>
            ) : null}
            {busyAction ? (
              <div className="progress-shell" aria-label="Progress">
                <span style={{ width: `${progress}%` }} />
              </div>
            ) : null}
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Product details</h2>
                <p className="panel-sub">Use a demo item or edit the fields directly.</p>
              </div>
            </div>
            <div className="demo-grid">
              {demoProducts.map((product) => (
                <button
                  type="button"
                  className="demo-card"
                  key={`${product.brand}-${product.model}`}
                  onClick={() => applyDemoProduct(product)}
                >
                  <strong>{product.brand}</strong>
                  <span>{product.model}</span>
                </button>
              ))}
            </div>
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
            <label>
              Description
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional product notes" />
            </label>
          </section>

          <section className="panel analysis-panel" aria-live="polite">
            <div className="section-heading">
              <div>
                <h2>Step 2: Analysis results</h2>
                <p className="panel-sub">What Boss Listers found before listing generation.</p>
              </div>
            </div>
            {!analysisResult ? (
              <p className="empty">
                Analyze a photo to see product findings, price guidance, and confidence here.
              </p>
            ) : !analysisResult.productName || !analysisResult.brand ? (
              <p className="analysis-empty">
                I could not confidently identify the item yet. Add the item name, brand, or a short note,
                then analyze again.
              </p>
            ) : (
              <div className="analysis-grid">
                <div>
                  <span>Detected product</span>
                  <strong>{analysisResult.productName}</strong>
                </div>
                <div>
                  <span>Brand</span>
                  <strong>{analysisResult.brand}</strong>
                </div>
                <div>
                  <span>Category</span>
                  <strong>{analysisResult.category || "Not sure yet"}</strong>
                </div>
                <div>
                  <span>Condition guess</span>
                  <strong>{analysisResult.conditionGuess || "Not sure yet"}</strong>
                </div>
                <div>
                  <span>Quantity / bundle</span>
                  <strong>{analysisResult.quantity || "Not sure yet"}</strong>
                </div>
                <div>
                  <span>Confidence</span>
                  <strong>{Math.round((analysisResult.confidence || 0) * 100)}%</strong>
                </div>
                <div className="analysis-range">
                  <span>Price range</span>
                  <strong>
                    ${analysisResult.priceRange.low} low / ${analysisResult.priceRange.suggested} suggested / $
                    {analysisResult.priceRange.high} high
                  </strong>
                </div>
                <div className="analysis-summary">
                  <span>Raw AI / debug summary</span>
                  <p>{analysisResult.summary || "No summary returned."}</p>
                </div>
              </div>
            )}
          </section>

          {outputs.length ? (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2>Step 4: Review marketplace listings</h2>
                  <p className="panel-sub">Ready-to-copy drafts for ten channels.</p>
                </div>
              </div>
              <div className="platform-grid">
                {outputs.map((item) => (
                  <PlatformCard key={item.platform} item={item} onCopy={copyPlatform} onExport={exportPlatform} />
                ))}
              </div>
            </section>
          ) : null}
        </main>

        <aside className="stack">
          <section className="panel summary-panel">
            <h2>Step 3: Generate marketplace listings</h2>
            <p className="panel-sub">Uses the latest analysis result plus your edits.</p>
            <div className="pricing-summary">
              <div>
                <span>Recommended</span>
                <strong>${pricing?.recommendedPrice ?? 0}</strong>
              </div>
              <div>
                <span>Floor</span>
                <strong>${pricing?.floorPrice ?? 0}</strong>
              </div>
              <div>
                <span>Profit</span>
                <strong>${pricing?.expectedProfit?.netProfit ?? 0}</strong>
              </div>
              <div>
                <span>ROI</span>
                <strong>{pricing?.expectedProfit?.roiPct ?? 0}%</strong>
              </div>
            </div>
            <div className="stack-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => runAnalyze(true)}
                disabled={Boolean(busyAction)}
              >
                {busyAction === "generate" ? "Generating..." : "Generate listings"}
              </button>
              <button type="button" className="btn-secondary" onClick={saveCurrent} disabled={!outputs.length}>
                Save product
              </button>
            </div>
          </section>
        </aside>
      </div>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
