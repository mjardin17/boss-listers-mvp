import { useEffect, useState } from "react";
import Link from "next/link";
import { requireSession, authedFetch } from "../lib/clientAuth";

const PLATFORMS = [
  { id: "ebay", label: "eBay", color: "#E53238" },
  { id: "amazon", label: "Amazon", color: "#FF9900" },
  { id: "etsy", label: "Etsy", color: "#F1641E" },
  { id: "facebook", label: "Facebook Marketplace", color: "#1877F2" },
  { id: "shopify", label: "Shopify", color: "#96BE28" },
  { id: "tiktok", label: "TikTok Shop", color: "#000000" },
];

export default function PostPage() {
  const [inventory, setInventory] = useState([]);
  const [selectedSku, setSelectedSku] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState(["ebay", "amazon"]);
  const [posting, setPosting] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!requireSession()) return;
    loadInventory();
  }, []);

  async function loadInventory() {
    try {
      const res = await authedFetch("/api/inventory");
      const data = await res.json();
      if (data.ok) {
        setInventory(data.items || []);
      }
    } catch (err) {
      setError(`Failed to load inventory: ${err.message}`);
    }
  }

  async function postToAllPlatforms() {
    if (!selectedSku) {
      setError("Please select an item");
      return;
    }
    if (selectedPlatforms.length === 0) {
      setError("Please select at least one platform");
      return;
    }

    setPosting(true);
    setError("");
    setResults(null);

    try {
      const res = await authedFetch("/api/inventory/post-to-platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productSKU: selectedSku,
          platforms: selectedPlatforms,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "Posting failed");
      } else {
        setResults(data.results);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Boss Listers</p>
          <h1>Post to All Platforms</h1>
        </div>
        <nav>
          <Link className="nav-link" href="/capture">Capture</Link>
          <Link className="nav-link" href="/channels">Channels</Link>
          <Link className="nav-link" href="/history">History</Link>
        </nav>
      </header>

      {error && (
        <div style={{ padding: 16, background: "#FEE2E2", color: "#DC2626", borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <section style={{ marginBottom: 32 }}>
        <h2 className="section-heading">Select Item</h2>
        <div className="panel" style={{ padding: 16 }}>
          <label style={{ display: "block", marginBottom: 8 }}>
            <strong>SKU:</strong>
          </label>
          <select
            value={selectedSku}
            onChange={(e) => setSelectedSku(e.target.value)}
            style={{
              width: "100%",
              padding: 8,
              border: "1px solid #E5E7EB",
              borderRadius: 4,
              fontSize: 14,
            }}
          >
            <option value="">Choose an item...</option>
            {inventory.map((item) => (
              <option key={item.sku} value={item.sku}>
                {item.title || item.sku} (${item.price})
              </option>
            ))}
          </select>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 className="section-heading">Select Platforms</h2>
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
            {PLATFORMS.map((platform) => (
              <label
                key={platform.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 12,
                  border: selectedPlatforms.includes(platform.id) ? `2px solid ${platform.color}` : "1px solid #E5E7EB",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: selectedPlatforms.includes(platform.id) ? `${platform.color}10` : "white",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedPlatforms.includes(platform.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedPlatforms([...selectedPlatforms, platform.id]);
                    } else {
                      setSelectedPlatforms(selectedPlatforms.filter((p) => p !== platform.id));
                    }
                  }}
                  style={{ cursor: "pointer" }}
                />
                <strong style={{ color: platform.color }}>{platform.label}</strong>
              </label>
            ))}
          </div>
        </div>
      </section>

      <section>
        <button
          onClick={postToAllPlatforms}
          disabled={posting || !selectedSku || selectedPlatforms.length === 0}
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "#2563EB",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: posting ? "wait" : "pointer",
            opacity: posting || !selectedSku || selectedPlatforms.length === 0 ? 0.5 : 1,
          }}
        >
          {posting ? "Posting..." : `Post to ${selectedPlatforms.length} Platform${selectedPlatforms.length !== 1 ? "s" : ""}`}
        </button>
      </section>

      {results && (
        <section style={{ marginTop: 32, padding: 16, background: "#F0FDF4", borderRadius: 8 }}>
          <h3 style={{ margin: "0 0 16px" }}>Posting Results</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {Object.entries(results).map(([platform, result]) => (
              <div
                key={platform}
                style={{
                  padding: 12,
                  background: result.success ? "#D1FAE5" : "#FEE2E2",
                  borderRadius: 4,
                  borderLeft: `4px solid ${result.success ? "#10B981" : "#EF4444"}`,
                }}
              >
                <strong>{PLATFORMS.find((p) => p.id === platform)?.label || platform}:</strong>{" "}
                {result.success ? (
                  <span style={{ color: "#059669" }}>
                    ✓ Posted{result.listingId && ` - ${result.listingId}`}
                  </span>
                ) : (
                  <span style={{ color: "#DC2626" }}>✗ {result.error}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
