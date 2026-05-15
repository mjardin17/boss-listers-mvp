import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function getSessionId() {
  if (typeof window === "undefined") return "anon";
  return localStorage.getItem("boss_session") || "anon";
}

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
    sessionIdRef.current = getSessionId();
    fetch(`/api/listings?sessionId=${encodeURIComponent(sessionIdRef.current)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) setItems(data.items || []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Boss Listers AI</p>
          <h1>Product history</h1>
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
                    <strong>{formatDate(item.createdAt)}</strong>
                    <span>saved</span>
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
