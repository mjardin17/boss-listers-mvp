import { useState } from "react";
import Link from "next/link";
import StyleFrameStudio from "../components/StyleFrameStudio";

export default function OmniLister() {
  const [method, setMethod] = useState("image"); // 'image' or 'text'
  const [file, setFile] = useState(null);
  const [productName, setProductName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  // Background removal state (Commercial Maker v6 - RMBG-1.4)
  const [removingBg, setRemovingBg] = useState(false);
  const [cutoutData, setCutoutData] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // StyleFrame Studio 3D state (mimicking styleframe.ai)
  const [showStyleFrame, setShowStyleFrame] = useState(false);
  const [styleframeMedia, setStyleframeMedia] = useState(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      setFile(files[0]);
      setImagePreview(URL.createObjectURL(files[0]));
      setMethod("image");
      setProductName("");
      setCutoutData(null);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setImagePreview(URL.createObjectURL(e.target.files[0]));
      setMethod("image");
      setProductName("");
      setCutoutData(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setSaveStatus(null);
    setCutoutData(null);

    try {
      if (method === "image" && file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const base64 = event.target.result.split(",")[1];
            const response = await fetch("/api/omni-lister/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "image",
                imageBase64: base64,
                imageMediaType: file.type || "image/jpeg",
              }),
            });

            const data = await response.json();
            if (data.ok) {
              setResult(data.product);
            } else {
              setError(data.error || "Analysis failed");
            }
          } catch (err) {
            setError(err.message || "Network error analyzing image");
          } finally {
            setLoading(false);
          }
        };
        reader.readAsDataURL(file);
      } else if (method === "text" && productName.trim()) {
        const response = await fetch("/api/omni-lister/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "text",
            query: productName.trim(),
          }),
        });

        const data = await response.json();
        if (data.ok) {
          setResult(data.product);
        } else {
          setError(data.error || "Lookup failed");
        }
        setLoading(false);
      } else {
        setError("Please provide an image or product name");
        setLoading(false);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Run RMBG-1.4 cutout
  const handleRemoveBackground = async () => {
    setRemovingBg(true);
    setError(null);

    try {
      let bodyData = {};

      if (file) {
        const base64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.readAsDataURL(file);
        });
        bodyData = {
          imageBase64: base64,
          imageMediaType: file.type || "image/jpeg",
        };
      } else {
        // Default to test image if no file currently uploaded
        bodyData = {
          imagePath: "public/wc-shorts.jpg",
        };
      }

      const res = await fetch("/api/omni-lister/remove-bg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });

      const data = await res.json();
      if (data.ok) {
        setCutoutData(data);
        if (result) {
          setResult((prev) => ({
            ...prev,
            image_url: data.url,
            cutout_coverage_pct: data.coverage_pct,
          }));
        }
      } else {
        setError(`Background removal failed: ${data.error}`);
      }
    } catch (err) {
      setError(`Background removal error: ${err.message}`);
    } finally {
      setRemovingBg(false);
    }
  };

  const handleSaveToInventory = async () => {
    if (!result) return;
    setSaving(true);
    setSaveStatus(null);

    try {
      const payload = {
        ...result,
        image_url: cutoutData?.url || result.image_url || null,
        styleframe_video: styleframeMedia?.videoUrl || null,
        keyframes: styleframeMedia?.keyframes || null,
      };

      const res = await fetch("/api/omni-lister/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: payload }),
      });

      const data = await res.json();
      if (data.ok) {
        setSaveStatus({
          ok: true,
          sku: data.product?.sku || result.sku,
          product: data.product,
        });
      } else {
        setSaveStatus({ ok: false, error: data.error || "Failed to save product" });
      }
    } catch (err) {
      setSaveStatus({ ok: false, error: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Omni-Lister Intelligence</h1>
        <p style={styles.subtitle}>
          Universal product analyzer & background removal (Commercial Maker v6) for multi-channel listing.
        </p>

        <form onSubmit={handleSubmit}>
          {/* METHOD 1: IMAGE */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Option 1: Scan / Upload Item</label>
            <div
              style={{
                ...styles.dropZone,
                ...(dragOver ? styles.dropZoneActive : {}),
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById("fileInput").click()}
            >
              <div style={styles.dropIcon}>📸</div>
              <p style={styles.dropText}>Drop product photo or barcode image here</p>
              <p style={styles.dropSubtext}>Accepts JPG, PNG, WebP (or click to browse)</p>
              <input
                id="fileInput"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
            </div>
            {file && (
              <div style={styles.fileFeedback}>✓ Selected: {file.name}</div>
            )}
          </div>

          <div style={styles.divider}>OR</div>

          {/* METHOD 2: TEXT */}
          <div style={styles.inputGroup}>
            <label style={styles.label}>Option 2: Product Name / ASIN</label>
            <input
              type="text"
              value={productName}
              onChange={(e) => {
                setProductName(e.target.value);
                if (e.target.value) setMethod("text");
              }}
              placeholder="e.g. Logitech G502 Gaming Mouse or B07GBZ4Q68"
              style={styles.textInput}
            />
          </div>

          <button type="submit" disabled={loading} style={styles.submitButton}>
            {loading ? "Analyzing..." : "🚀 Process & Extract Product Data"}
          </button>
        </form>

        {loading && (
          <div style={styles.loadingContainer}>
            <div style={styles.spinner} />
            <p style={styles.loadingText}>Extracting structured data via open-source Vision AI...</p>
          </div>
        )}

        {error && <div style={styles.errorBox}>{error}</div>}

        {result && (
          <div style={styles.resultBox}>
            <h3 style={styles.resultTitle}>✓ Product Analysis Complete</h3>

            {/* Background removal action */}
            <div style={styles.actionBanner}>
              <div style={{ flex: 1 }}>
                <strong style={{ color: "#ffffff", fontSize: "14px" }}>Commercial Maker v6 Background Removal</strong>
                <p style={{ margin: "4px 0 0 0", color: "#8a96a3", fontSize: "12px" }}>
                  Runs local open-source RMBG-1.4 to isolate the product on a transparent PNG.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRemoveBackground}
                disabled={removingBg}
                style={styles.bgRemoveButton}
              >
                {removingBg ? "Removing Background..." : "✨ Remove Background"}
              </button>
            </div>

            {/* Side by side preview */}
            {cutoutData && (
              <div style={styles.cutoutContainer}>
                <div style={styles.cutoutHeader}>
                  <span style={styles.cutoutBadge}>✓ RMBG-1.4 Cutout Ready</span>
                  <span style={styles.coverageBadge}>
                    Alpha Coverage: <strong>{cutoutData.coverage_pct}%</strong>
                  </span>
                </div>
                <div style={styles.sideBySide}>
                  <div style={styles.imageCol}>
                    <span style={styles.imageLabel}>Original</span>
                    <div style={styles.imageWrapper}>
                      <img
                        src={imagePreview || "/wc-shorts.jpg"}
                        alt="Original"
                        style={styles.previewImage}
                      />
                    </div>
                  </div>
                  <div style={styles.imageCol}>
                    <span style={styles.imageLabel}>Transparent Cutout</span>
                    <div style={styles.checkerboardWrapper}>
                      <img
                        src={cutoutData.url}
                        alt="Cutout"
                        style={styles.previewImage}
                      />
                    </div>
                  </div>
                </div>
                <div style={styles.cutoutFooter}>
                  <span>Inference: {cutoutData.elapsed_sec}s</span>
                  <span>•</span>
                  <span>Visible Pixels: {cutoutData.foreground_pixels?.toLocaleString()} / {cutoutData.total_pixels?.toLocaleString()}</span>
                  <span>•</span>
                  <span>{cutoutData.coverage_pct > 60 ? "Warning: High coverage (hand/background may be included)" : "Clean product isolation"}</span>
                </div>

                {/* StyleFrame Studio 3D Trigger */}
                <div style={styles.styleframeTriggerBar}>
                  <button
                    type="button"
                    onClick={() => setShowStyleFrame(!showStyleFrame)}
                    style={{
                      ...styles.styleframeToggleBtn,
                      ...(showStyleFrame ? styles.styleframeToggleBtnActive : {}),
                    }}
                  >
                    {showStyleFrame ? "✕ Hide StyleFrame Studio" : "🎬 Open StyleFrame 3D Studio (Turntable & Video)"}
                  </button>
                  <Link
                    href={`/styleframe?image=${encodeURIComponent(cutoutData.url)}`}
                    target="_blank"
                    style={styles.styleframeExternalLink}
                  >
                    ↗ Open Full Page
                  </Link>
                </div>

                {showStyleFrame && (
                  <StyleFrameStudio
                    imageUrl={cutoutData.url}
                    productTitle={result?.title || "Analyzed Product"}
                    sku={result?.sku || "SKU-ITEM"}
                    onApplyStyleframe={(data) => {
                      setStyleframeMedia(data);
                      alert("✓ StyleFrame media synced to inventory payload!");
                    }}
                    onClose={() => setShowStyleFrame(false)}
                  />
                )}
              </div>
            )}

            <pre style={styles.resultData}>
              {JSON.stringify(result, null, 2)}
            </pre>

            <div style={styles.buttonRow}>
              <button
                onClick={handleSaveToInventory}
                disabled={saving}
                style={styles.saveButton}
              >
                {saving ? "Saving to DB..." : "💾 Save to Inventory"}
              </button>
              <button
                onClick={() => {
                  setResult(null);
                  setSaveStatus(null);
                  setFile(null);
                  setImagePreview(null);
                  setCutoutData(null);
                  setProductName("");
                }}
                style={styles.resetButton}
              >
                Analyze Another Item
              </button>
            </div>

            {saveStatus && (
              <div style={saveStatus.ok ? styles.saveSuccess : styles.errorBox}>
                {saveStatus.ok ? (
                  <div>
                    ✓ <strong>Saved to BossListers Inventory!</strong> SKU: <code>{saveStatus.sku}</code>
                    <div style={{ marginTop: 10, display: "flex", gap: "12px" }}>
                      <Link href="/inventory" style={styles.inlineLink}>
                        📦 Open in Inventory →
                      </Link>
                      <Link href={`/post?sku=${saveStatus.sku}`} style={styles.inlineLink}>
                        🚀 Post to Marketplaces →
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div>Error saving: {saveStatus.error}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    backgroundColor: "#11141a",
    padding: "20px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  card: {
    width: "100%",
    maxWidth: "680px",
    backgroundColor: "#1e232d",
    padding: "32px",
    borderRadius: "16px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    border: "1px solid #2d3545",
  },
  title: {
    fontSize: "26px",
    fontWeight: "700",
    textAlign: "center",
    background: "linear-gradient(45deg, #ff9900, #00f2fe)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    margin: "0 0 8px 0",
  },
  subtitle: {
    textAlign: "center",
    color: "#8a96a3",
    fontSize: "14px",
    lineHeight: "1.5",
    margin: "0 0 28px 0",
  },
  inputGroup: {
    marginBottom: "20px",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontWeight: "600",
    fontSize: "13px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: "#cbd5e1",
  },
  dropZone: {
    border: "2px dashed #44526e",
    borderRadius: "12px",
    padding: "26px",
    textAlign: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  dropZoneActive: {
    borderColor: "#00f2fe",
    backgroundColor: "rgba(0, 242, 254, 0.08)",
  },
  dropIcon: {
    fontSize: "36px",
    marginBottom: "8px",
  },
  dropText: {
    color: "#ffffff",
    margin: "0",
    fontSize: "15px",
    fontWeight: "500",
  },
  dropSubtext: {
    fontSize: "12px",
    color: "#8a96a3",
    margin: "4px 0 0 0",
  },
  fileFeedback: {
    marginTop: "8px",
    fontSize: "13px",
    color: "#00f2fe",
    fontWeight: "500",
  },
  divider: {
    textAlign: "center",
    color: "#64748b",
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "1px",
    margin: "16px 0",
  },
  textInput: {
    width: "100%",
    padding: "12px 14px",
    backgroundColor: "#11141a",
    border: "1px solid #334155",
    borderRadius: "8px",
    color: "#ffffff",
    fontSize: "14px",
    boxSizing: "border-box",
    outline: "none",
  },
  submitButton: {
    width: "100%",
    padding: "14px",
    background: "linear-gradient(45deg, #ff9900, #00f2fe)",
    color: "#11141a",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
    marginTop: "8px",
  },
  loadingContainer: {
    marginTop: "20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "10px",
  },
  spinner: {
    width: "28px",
    height: "28px",
    border: "3px solid rgba(0, 242, 254, 0.2)",
    borderTopColor: "#00f2fe",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: {
    color: "#8a96a3",
    fontSize: "13px",
    margin: 0,
  },
  errorBox: {
    marginTop: "16px",
    padding: "12px",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    border: "1px solid #ef4444",
    borderRadius: "8px",
    color: "#fca5a5",
    fontSize: "13px",
    lineHeight: "1.4",
  },
  resultBox: {
    marginTop: "24px",
    padding: "20px",
    backgroundColor: "#11141a",
    borderRadius: "12px",
    border: "1px solid #2d3545",
  },
  resultTitle: {
    color: "#00f2fe",
    fontSize: "16px",
    margin: "0 0 16px 0",
    fontWeight: "600",
  },
  actionBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#171c26",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "14px 16px",
    marginBottom: "16px",
    gap: "12px",
    flexWrap: "wrap",
  },
  bgRemoveButton: {
    padding: "10px 18px",
    background: "linear-gradient(45deg, #00f2fe, #38bdf8)",
    color: "#0f172a",
    border: "none",
    borderRadius: "6px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  cutoutContainer: {
    backgroundColor: "#171c26",
    border: "1px solid #2d3545",
    borderRadius: "10px",
    padding: "16px",
    marginBottom: "16px",
  },
  cutoutHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
    flexWrap: "wrap",
    gap: "8px",
  },
  cutoutBadge: {
    color: "#38bdf8",
    fontWeight: "600",
    fontSize: "14px",
  },
  coverageBadge: {
    backgroundColor: "rgba(0, 242, 254, 0.1)",
    border: "1px solid #00f2fe",
    color: "#00f2fe",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "12px",
  },
  sideBySide: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "14px",
  },
  imageCol: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  imageLabel: {
    color: "#94a3b8",
    fontSize: "12px",
    fontWeight: "600",
    textTransform: "uppercase",
  },
  imageWrapper: {
    backgroundColor: "#0b0d11",
    borderRadius: "8px",
    overflow: "hidden",
    border: "1px solid #334155",
    height: "220px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  checkerboardWrapper: {
    background: "repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%) 50% / 16px 16px",
    borderRadius: "8px",
    overflow: "hidden",
    border: "1px solid #334155",
    height: "220px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
  },
  cutoutFooter: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "10px",
    color: "#94a3b8",
    fontSize: "12px",
    flexWrap: "wrap",
  },
  resultData: {
    backgroundColor: "#0b0d11",
    padding: "12px",
    borderRadius: "6px",
    color: "#a5f3fc",
    fontSize: "12px",
    overflowX: "auto",
    maxHeight: "220px",
    margin: "0 0 16px 0",
    border: "1px solid #1e293b",
    fontFamily: 'Consolas, Monaco, "Courier New", monospace',
  },
  buttonRow: {
    display: "flex",
    gap: "10px",
  },
  saveButton: {
    flex: 1,
    padding: "12px",
    backgroundColor: "#ff9900",
    color: "#11141a",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
  },
  resetButton: {
    flex: 1,
    padding: "12px",
    backgroundColor: "transparent",
    color: "#cbd5e1",
    border: "1px solid #475569",
    borderRadius: "6px",
    fontSize: "14px",
    cursor: "pointer",
  },
  saveSuccess: {
    marginTop: "14px",
    padding: "12px",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    border: "1px solid #22c55e",
    borderRadius: "8px",
    color: "#86efac",
    fontSize: "13px",
    lineHeight: "1.5",
  },
  inlineLink: {
    color: "#00f2fe",
    textDecoration: "underline",
    fontWeight: "600",
  },
  styleframeTriggerBar: {
    display: "flex",
    gap: "10px",
    marginTop: "14px",
    alignItems: "center",
  },
  styleframeToggleBtn: {
    backgroundColor: "rgba(0, 242, 254, 0.12)",
    color: "#00f2fe",
    border: "1px solid #00f2fe",
    borderRadius: "6px",
    padding: "8px 14px",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
  },
  styleframeToggleBtnActive: {
    backgroundColor: "#00f2fe",
    color: "#000000",
  },
  styleframeExternalLink: {
    backgroundColor: "#1e242f",
    color: "#8a96a3",
    border: "1px solid #2e3846",
    borderRadius: "6px",
    padding: "8px 14px",
    fontSize: "13px",
    fontWeight: "600",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  },
};
