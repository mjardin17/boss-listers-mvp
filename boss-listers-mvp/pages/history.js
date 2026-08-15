import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const sessionIdRef = useRef("anon");

  useEffect(() => {
    fetch(`/api/listings?sessionId=${encodeURIComponent(sessionIdRef.current)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setItems(data.items || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const summary = items.reduce(
    (acc, item) => {
      const input = item.payload?.input || {};
      const outputs = item.payload?.outputs || [];
      const first = outputs[0];
      acc.inventoryValue += Number(first?.price || 0);
      acc.potentialProfit += Number(first?.profit?.netProfit || 0);
      acc.drafts += outputs.length ? 1 : 0;
      acc.bestRoi = Math.max(acc.bestRoi, Number(first?.profit?.roiPct || 0));
      if (input.analysisResult?.buyRecommendation === "buy") acc.buyCalls += 1;
      return acc;
    },
    { inventoryValue: 0, potentialProfit: 0, drafts: 0, bestRoi: 0, buyCalls: 0 }
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Boss Listers AI</p>
          <h1>Product history</h1>
          <p className="panel-sub">
            Legacy view: current MVP scan history now lives on the dashboard Recent scans panel.
          </p>
        </div>
        <nav>
          <Link href="/" className="nav-link">
            Dashboard
          </Link>
          <Link href="/history" className="nav-link active">
            History
          </Link>
        </nav>
      </header>

      <section className="panel history-page">
        <p className="empty">
          This legacy server history route is kept for compatibility. Use Dashboard for the active
          local scan history, sourcing session, and inventory workflow.
        </p>
        <div className="history-summary">
          <article>
            <span>Inventory value</span>
            <strong>${summary.inventoryValue.toFixed(0)}</strong>
          </article>
          <article>
            <span>Potential profit</span>
            <strong>${summary.potentialProfit.toFixed(0)}</strong>
          </article>
          <article>
            <span>Saved drafts</span>
            <strong>{summary.drafts}</strong>
          </article>
          <article>
            <span>Best ROI</span>
            <strong>{summary.bestRoi}%</strong>
          </article>
          <article>
            <span>Buy calls</span>
            <strong>{summary.buyCalls}</strong>
          </article>
        </div>
        <div className="section-heading">
          <div>
            <h2>Saved products</h2>
            <p className="panel-sub">{items.length} products saved this session</p>
          </div>
        </div>
        {loading ? (
          <p className="empty">Loading history...</p>
        ) : items.length === 0 ? (
          <p className="empty">No saved products yet.</p>
        ) : (
          <div className="history-table">
            {items.map((item) => {
              const input = item.payload?.input || {};
              const outputs = item.payload?.outputs || [];
              const title = [input.brand, input.model].filter(Boolean).join(" ") || "Untitled";
              const best = outputs[0];
              return (
                <article className="history-row" key={item.id}>
                  <div>
                    <strong>{title}</strong>
                    <span>{input.categoryHint || "general"}</span>
                  </div>
                  <div>
                    <strong>{outputs.length}</strong>
                    <span>markets</span>
                  </div>
                  <div>
                    <strong>${best?.price ?? 0}</strong>
                    <span>list price</span>
                  </div>
                  <div>
                    <strong>${best?.profit?.netProfit ?? 0}</strong>
                    <span>profit</span>
                  </div>
                  <div>
                    <strong>{input.analysisResult?.buyRecommendation || "review"}</strong>
                    <span>sourcing call</span>
                  </div>
                  <div>
                    <strong>{formatDate(item.createdAt)}</strong>
                    <span>saved</span>
                  </div>
                  <div>
                    <Link href={`/?listingId=${encodeURIComponent(item.id)}`} className="inline-link">
                      Reopen
                    </Link>
                    <Link
                      href={`/?listingId=${encodeURIComponent(item.id)}&duplicate=1`}
                      className="inline-link"
                    >
                      Duplicate
                    </Link>
                    <span>
                      {outputs.length ? "draft ready" : "needs review"}
                      {item.updatedAt ? " / edited" : ""}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
