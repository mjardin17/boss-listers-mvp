import { useEffect, useState } from "react";
import Link from "next/link";
import { requireSession, authedFetch, clearSession } from "../../lib/clientAuth";

function formatPrice(price) {
  const value = Number(price);
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : "—";
}

function cardLabel(details) {
  if (!details || typeof details !== "object") return null;
  const parts = [
    details.set,
    details.card_number ? `#${details.card_number}` : null,
    details.variant,
    [details.grading_company, details.grade].filter(Boolean).join(" "),
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export default function InventoryPage() {
  const [ready, setReady] = useState(false);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!requireSession()) return;
    setReady(true);
    loadInventory();
  }, []);

  async function loadInventory() {
    setLoading(true);
    setError("");
    try {
      const res = await authedFetch("/api/inventory");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const message = data.error || "Failed to load inventory";
        if (res.status === 503) {
          setError("Inventory isn't connected yet. Supabase isn't configured in this environment.");
        } else {
          setError(message);
        }
        setProducts([]);
        return;
      }
      setProducts(Array.isArray(data.products) ? data.products : []);
    } catch (err) {
      setError(err.message || "Failed to load inventory");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Boss Listers</p>
          <h1>In-house inventory</h1>
          <p className="panel-sub">Stock on hand that feeds the posting pipeline.</p>
        </div>
        <nav>
          <Link className="nav-link" href="/inventory/add-product">Add product</Link>
          <Link className="nav-link" href="/card-scan">Scan a card</Link>
          <Link className="nav-link" href="/post">Post an item</Link>
          <button type="button" className="btn-ghost" onClick={() => { clearSession(); window.location.href = "/login"; }}>
            Sign out
          </button>
        </nav>
      </header>

      {error && (
        <div style={{ padding: 16, background: "rgba(248, 113, 113, 0.12)", color: "var(--danger, #f87171)", borderRadius: 8, marginBottom: 16 }}>
          {error}
          <button type="button" className="btn-secondary" style={{ marginLeft: 12 }} onClick={loadInventory}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <section className="panel">
          <p className="muted">Loading inventory…</p>
        </section>
      ) : !products.length && !error ? (
        <section className="panel">
          <p>No products in inventory yet.</p>
          <p className="panel-sub">Add an item or scan a card, then post it to your sales channels.</p>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <Link className="nav-link active" href="/inventory/add-product">Add a product</Link>
            <Link className="nav-link" href="/card-scan">Scan a card</Link>
          </div>
        </section>
      ) : products.length ? (
        <section className="panel" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border, #2a3142)", color: "var(--muted, #9aa3b5)" }}>
                <th style={{ padding: "10px 8px" }}>Photo</th>
                <th style={{ padding: "10px 8px" }}>Title</th>
                <th style={{ padding: "10px 8px" }}>SKU</th>
                <th style={{ padding: "10px 8px" }}>Price</th>
                <th style={{ padding: "10px 8px" }}>Qty</th>
                <th style={{ padding: "10px 8px" }}>Condition</th>
                <th style={{ padding: "10px 8px" }}>Category</th>
                <th style={{ padding: "10px 8px" }}>Status</th>
                <th style={{ padding: "10px 8px" }}></th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const details = cardLabel(product.card_details);
                return (
                  <tr key={product.sku || product.id} style={{ borderBottom: "1px solid var(--border, #2a3142)" }}>
                    <td style={{ padding: "10px 8px", width: 72 }}>
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.title || product.sku || "Product photo"}
                          style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, background: "var(--surface-2, #1f2430)" }}
                        />
                      ) : (
                        <div style={{ width: 56, height: 56, borderRadius: 6, background: "var(--surface-2, #1f2430)", color: "var(--muted, #9aa3b5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>
                          No photo
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 600 }}>{product.title || "Untitled"}</div>
                      {details && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{details}</div>}
                    </td>
                    <td style={{ padding: "10px 8px", fontFamily: "ui-monospace, monospace" }}>{product.sku || "—"}</td>
                    <td style={{ padding: "10px 8px" }}>{formatPrice(product.price)}</td>
                    <td style={{ padding: "10px 8px" }}>{product.quantity ?? "—"}</td>
                    <td style={{ padding: "10px 8px" }}>{product.condition || "—"}</td>
                    <td style={{ padding: "10px 8px" }}>{product.category || "—"}</td>
                    <td style={{ padding: "10px 8px", textTransform: "capitalize" }}>{product.status || "—"}</td>
                    <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>
                      {product.sku && (
                        <Link className="nav-link" href={`/post?sku=${encodeURIComponent(product.sku)}`}>
                          Post
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
