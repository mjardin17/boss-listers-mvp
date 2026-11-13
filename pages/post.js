import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { requireSession, authedFetch } from "../lib/clientAuth";
import { LIVE_CONFIRM } from "../lib/liveConfirm";

const PLATFORMS = [
  { id: "ebay", label: "eBay", color: "#E53238" },
  { id: "amazon", label: "Amazon", color: "#FF9900" },
  { id: "etsy", label: "Etsy", color: "#F1641E" },
  { id: "facebook", label: "Facebook Shop (Page catalog)", color: "#1877F2" },
  { id: "tiktok", label: "TikTok Shop", color: "#000000" },
  { id: "bonanza", label: "Bonanza", color: "#FF6B35" },
  { id: "woocommerce", label: "WooCommerce", color: "#96588A" },
  { id: "instagram", label: "Instagram photo post", color: "#E4405F" },
];

export default function PostPage() {
  const router = useRouter();
  const [inventory, setInventory] = useState([]);
  const [selectedSku, setSelectedSku] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState(["ebay"]);
  const [posting, setPosting] = useState(false);
  const [results, setResults] = useState(null);
  const [lastRunLive, setLastRunLive] = useState(false);
  const [error, setError] = useState("");
  const [loadingInventory, setLoadingInventory] = useState(true);

  useEffect(() => {
    if (!requireSession()) return;
    loadInventory();
  }, []);

  useEffect(() => {
    const sku = typeof router.query.sku === "string" ? router.query.sku : "";
    if (sku) setSelectedSku(sku);
  }, [router.query.sku]);

  async function loadInventory() {
    setLoadingInventory(true);
    try {
      const res = await authedFetch("/api/inventory");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (res.status === 503) {
          setError("Inventory isn't connected yet. Supabase isn't configured in this environment.");
        } else {
          setError(data.error || "Failed to load inventory");
        }
        setInventory([]);
        return;
      }
      setInventory(Array.isArray(data.products) ? data.products : []);
    } catch (err) {
      setError(`Failed to load inventory: ${err.message}`);
      setInventory([]);
    } finally {
      setLoadingInventory(false);
    }
  }

  // Dry run (preview) by default. Live only after the seller confirms.
  async function postToAllPlatforms(live = false) {
    if (!selectedSku) {
      setError("Please select an item");
      return;
    }
    if (selectedPlatforms.length === 0) {
      setError("Please select at least one platform");
      return;
    }

    if (live) {
      const ok = window.confirm(
        `Publish ${selectedSku} LIVE to ${selectedPlatforms.join(", ")}? Buyers will see it and it can sell.`
      );
      if (!ok) return;
    }

    setPosting(true);
    setError("");
    setResults(null);
    setLastRunLive(live);

    try {
      const res = await authedFetch("/api/inventory/post-to-platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productSKU: selectedSku,
          platforms: selectedPlatforms,
          ...(live ? { confirmLive: LIVE_CONFIRM } : {}),
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
          <Link className="nav-link" href="/inventory">Inventory</Link>
          <Link className="nav-link" href="/inventory/add-product">Add product</Link>
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
            <option value="">{loadingInventory ? "Loading inventory..." : "Choose an item..."}</option>
            {inventory.map((item) => (
              <option key={item.sku} value={item.sku}>
                {item.title || item.sku} ({item.sku}){item.price != null ? ` — $${item.price}` : ""}
              </option>
            ))}
          </select>
          {!loadingInventory && inventory.length === 0 && (
            <p style={{ marginTop: 12 }}>
              No inventory items yet. <Link href="/inventory/add-product">Add a product</Link>
              {" or "}
              <Link href="/card-scan">scan a card</Link>.
            </p>
          )}
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

      <section style={{ display: "grid", gap: 12 }}>
        <button
          onClick={() => postToAllPlatforms(false)}
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
          {posting ? "Working..." : `Preview (dry run) on ${selectedPlatforms.length} platform${selectedPlatforms.length !== 1 ? "s" : ""}`}
        </button>
        <button
          onClick={() => postToAllPlatforms(true)}
          disabled={posting || !selectedSku || selectedPlatforms.length === 0}
          style={{
            width: "100%",
            padding: "12px 16px",
            background: "#DC2626",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 700,
            cursor: posting ? "wait" : "pointer",
            opacity: posting || !selectedSku || selectedPlatforms.length === 0 ? 0.5 : 1,
          }}
        >
          {posting ? "Working..." : "Publish live"}
        </button>
        <p style={{ margin: 0, fontSize: 13, color: "#6B7280" }}>
          Preview checks the listing without posting anything. Publish live asks you to confirm, then posts for real.
        </p>
      </section>

      {results && (
        <section style={{ marginTop: 32, padding: 16, background: "#F0FDF4", borderRadius: 8 }}>
          <h3 style={{ margin: "0 0 16px" }}>{lastRunLive ? "Live posting results" : "Preview results (nothing was posted)"}</h3>
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
                  <span style={{ color: "#DC2626" }}>✗ Not posted - {result.error || result.note || "no reason given"}</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
