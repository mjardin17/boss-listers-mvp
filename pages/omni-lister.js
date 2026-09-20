import { useState } from "react";

export default function OmniLister() {
  const [method, setMethod] = useState("image"); // 'image' or 'text'
  const [file, setFile] = useState(null);
  const [productName, setProductName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

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
      setMethod("image");
      setProductName("");
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setMethod("image");
      setProductName("");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      let payload;

      if (method === "image" && file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
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
          setLoading(false);
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

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Omni-Lister Intelligence</h1>
        <p style={styles.subtitle}>
          Analyze physical items for FBA & TikTok Shop multi-channel listing.
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
              <p style={styles.dropSubtext}>or click to browse files</p>
              <input
                id="fileInput"
                type="file"
                accept="image/*"
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
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g., Logitech G502 Gaming Mouse Black or B07GBZ4Q68"
              style={styles.textInput}
            />
          </div>

          <button type="submit" disabled={loading} style={styles.submitButton}>
            {loading ? "Analyzing..." : "🚀 Process & Generate Listings"}
          </button>
        </form>

        {error && <div style={styles.errorBox}>{error}</div>}

        {result && (
          <div style={styles.resultBox}>
            <h3 style={styles.resultTitle}>✓ Product Analysis Complete</h3>
            <pre style={styles.resultData}>
              {JSON.stringify(result, null, 2)}
            </pre>
            <button
              onClick={() => setResult(null)}
              style={styles.resetButton}
            >
              Analyze Another Item
            </button>
          </div>
        )}
      </div>
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
    maxWidth: "600px",
    backgroundColor: "#1e232d",
    padding: "30px",
    borderRadius: "16px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    border: "1px solid #2d3545",
  },
  title: {
    fontSize: "24px",
    textAlign: "center",
    marginBottom: "5px",
    background: "linear-gradient(45deg, #ff9900, #00f2fe)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    margin: "0 0 5px 0",
  },
  subtitle: {
    textAlign: "center",
    color: "#8a96a3",
    fontSize: "14px",
    marginBottom: "30px",
    margin: "0 0 30px 0",
  },
  inputGroup: {
    marginBottom: "25px",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontWeight: "600",
    fontSize: "14px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: "#ffffff",
  },
  dropZone: {
    border: "2px dashed #44526e",
    borderRadius: "12px",
    padding: "30px",
    textAlign: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
    cursor: "pointer",
    transition: "all 0.3s ease",
  },
  dropZoneActive: {
    borderColor: "#00f2fe",
    backgroundColor: "rgba(0, 242, 254, 0.05)",
  },
  dropIcon: {
    fontSize: "40px",
    marginBottom: "10px",
  },
  dropText: {
    color: "#ffffff",
    margin: "0",
    fontSize: "16px",
  },
  dropSubtext: {
    fontSize: "12px",
    color: "#8a96a3",
    margin: "5px 0 0 0",
  },
  fileFeedback: {
    fontSize: "12px",
    color: "#00f2fe",
    marginTop: "8px",
    textAlign: "center",
    fontWeight: "bold",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    textAlign: "center",
    margin: "20px 0",
    color: "#8a96a3",
    fontSize: "12px",
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  textInput: {
    width: "100%",
    padding: "14px",
    backgroundColor: "#11141a",
    border: "1px solid #333d52",
    borderRadius: "8px",
    color: "#ffffff",
    fontSize: "16px",
    boxSizing: "border-box",
    transition: "border-color 0.3s",
  },
  submitButton: {
    width: "100%",
    padding: "15px",
    background: "linear-gradient(90deg, #ff9900, #ffb700)",
    border: "none",
    borderRadius: "8px",
    color: "#000",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "transform 0.2s, opacity 0.2s",
  },
  errorBox: {
    marginTop: "20px",
    padding: "15px",
    backgroundColor: "rgba(255, 0, 0, 0.1)",
    border: "1px solid #ff4444",
    borderRadius: "8px",
    color: "#ff8888",
    fontSize: "14px",
  },
  resultBox: {
    marginTop: "20px",
    padding: "20px",
    backgroundColor: "rgba(0, 242, 254, 0.1)",
    border: "1px solid #00f2fe",
    borderRadius: "8px",
  },
  resultTitle: {
    color: "#00f2fe",
    marginTop: "0",
    marginBottom: "15px",
  },
  resultData: {
    backgroundColor: "#11141a",
    padding: "15px",
    borderRadius: "8px",
    color: "#00ff00",
    fontSize: "12px",
    overflow: "auto",
    maxHeight: "300px",
    border: "1px solid #333d52",
  },
  resetButton: {
    marginTop: "15px",
    padding: "10px 20px",
    backgroundColor: "#ff9900",
    border: "none",
    borderRadius: "8px",
    color: "#000",
    fontWeight: "bold",
    cursor: "pointer",
    width: "100%",
  },
};
