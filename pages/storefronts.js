"use client";

import { useEffect, useRef, useState } from "react";
import { authedFetch } from "../lib/clientAuth";

// Operator console. Deep slate surfaces, warm cream type, amber for the one primary
// action per row. Green and red appear only as status dots and error text.
const CSS = `
.sf-root{min-height:100vh;background:#0c121c;color:#f1e9d6;font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums}
.sf-root *{box-sizing:border-box}
.sf-top{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:20px 28px;border-bottom:1px solid #1f2a3b}
.sf-top h1{margin:0;font-size:20px;font-weight:650;letter-spacing:-.01em}
.sf-top p{margin:0;color:#8e9db3;font-size:13px}
.sf-grid{display:grid;grid-template-columns:240px 1fr;min-height:calc(100vh - 69px)}
.sf-nav{border-right:1px solid #1f2a3b;padding:12px 8px;position:sticky;top:0;align-self:start}
.sf-nav button{all:unset;display:flex;width:100%;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;cursor:pointer;color:#c9d2e0}
.sf-nav button:hover{background:#151e2d}
.sf-nav button[aria-current="true"]{background:#182235;color:#f1e9d6}
.sf-nav button:focus-visible,.sf-btn:focus-visible,.sf-tab:focus-visible,.sf-link:focus-visible{outline:2px solid #e0a84a;outline-offset:2px}
.sf-dot{width:8px;height:8px;border-radius:50%;flex:none;background:#4a5a72}
.sf-dot.on{background:#6fbf8e}
.sf-navcount{margin-left:auto;color:#8e9db3;font-size:12px}
.sf-main{padding:24px 28px;display:grid;gap:18px;align-content:start;max-width:1040px}
.sf-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.sf-head h2{margin:0;font-size:17px;font-weight:650}
.sf-meta{color:#8e9db3;font-size:13px}
.sf-tabs{display:flex;gap:4px;border-bottom:1px solid #1f2a3b}
.sf-tab{all:unset;cursor:pointer;padding:9px 12px;color:#8e9db3;border-bottom:2px solid transparent;margin-bottom:-1px}
.sf-tab[aria-selected="true"]{color:#f1e9d6;border-bottom-color:#e0a84a}
.sf-tab:hover{color:#f1e9d6}
.sf-row{display:grid;grid-template-columns:1fr auto auto auto;align-items:center;gap:14px;padding:12px 4px;border-bottom:1px solid #161f2e}
.sf-row:last-child{border-bottom:0}
.sf-sku{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sf-sub{color:#8e9db3;font-size:12.5px}
.sf-price{font-weight:600}
.sf-pill{font-size:12px;padding:3px 9px;border-radius:999px;background:#182235;color:#c9d2e0;white-space:nowrap}
.sf-btn{all:unset;cursor:pointer;padding:7px 12px;border-radius:8px;font-size:13px;font-weight:600;white-space:nowrap}
.sf-btn.primary{background:#e0a84a;color:#1b1407}
.sf-btn.primary:hover{background:#eab865}
.sf-btn.quiet{border:1px solid #33425a;color:#c9d2e0}
.sf-btn.quiet:hover{border-color:#8e9db3;color:#f1e9d6}
.sf-btn:disabled{opacity:.45;cursor:not-allowed}
.sf-link{color:#e0a84a;font-size:13px}
.sf-empty{color:#8e9db3;padding:14px 4px;font-size:14px;margin:0}
.sf-note{color:#8e9db3;font-size:13px;padding:10px 12px;border:1px dashed #33425a;border-radius:8px;margin:0}
.sf-ext{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 4px;border-bottom:1px solid #161f2e}
.sf-err{color:#e8917f;font-size:13px}
dialog.sf-dlg{background:#151e2d;color:#f1e9d6;border:1px solid #33425a;border-radius:12px;padding:22px;max-width:440px;width:calc(100% - 32px)}
dialog.sf-dlg::backdrop{background:rgba(5,8,14,.7)}
dialog.sf-dlg h3{margin:0 0 8px;font-size:16px}
dialog.sf-dlg p{margin:0 0 14px;color:#c9d2e0;font-size:14px}
dialog.sf-dlg label{display:block;margin-bottom:6px}
dialog.sf-dlg input{width:100%;padding:9px 11px;border-radius:8px;border:1px solid #33425a;background:#0c121c;color:#f1e9d6;font:inherit;margin-bottom:14px}
dialog.sf-dlg input:focus-visible{outline:2px solid #e0a84a;outline-offset:1px}
.sf-actions{display:flex;justify-content:flex-end;gap:8px}
@media (max-width:760px){.sf-grid{grid-template-columns:1fr}.sf-nav{position:static;border-right:0;border-bottom:1px solid #1f2a3b;display:flex;overflow-x:auto;gap:4px}.sf-nav button{width:auto;white-space:nowrap}.sf-main{padding:18px 16px}.sf-row{grid-template-columns:1fr auto}.sf-row .sf-pill{display:none}.sf-top{padding:16px}}
`;

const CHANNELS = [
  { key: "ebay", label: "eBay" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook Page" },
  { key: "site", label: "Website" },
  { key: "shopify", label: "Shopify" },
  { key: "etsy", label: "Etsy" },
  { key: "amazon", label: "Amazon" },
];

const PHRASE = { publish: "PUBLISH_LIVE", end: "END_LISTING" };

function ListingRow({ item, onAction }) {
  const isDraft = item.status === "UNPUBLISHED";
  return (
    <div className="sf-row">
      <div style={{ minWidth: 0 }}>
        <div className="sf-sku">{item.sku}</div>
        <div className="sf-sub">
          {item.listingId ? `Listing ${item.listingId}` : "Draft, not live"}
          {item.quantity != null ? ` · qty ${item.quantity}` : ""}
        </div>
      </div>
      <div className="sf-price">${item.price ?? "—"}</div>
      <span className="sf-pill">{isDraft ? "Draft" : "Live"}</span>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {item.url && <a className="sf-link" href={item.url} target="_blank" rel="noreferrer">View</a>}
        {isDraft
          ? <button className="sf-btn primary" onClick={() => onAction("publish", item)}>Publish</button>
          : <button className="sf-btn quiet" onClick={() => onAction("end", item)}>End listing</button>}
      </div>
    </div>
  );
}

function SoldRows({ sold }) {
  if (!sold?.available) return <p className="sf-note">{sold?.note || "Sold orders are not available yet."}</p>;
  if (!sold.orders.length) return <p className="sf-empty">No sold orders yet.</p>;
  return sold.orders.map((o) => (
    <div className="sf-row" key={o.orderId}>
      <div style={{ minWidth: 0 }}>
        <div className="sf-sku">{(o.items || []).join(", ") || o.orderId}</div>
        <div className="sf-sub">Order {o.orderId}</div>
      </div>
      <div className="sf-price">${o.total ?? "—"}</div>
      <span className="sf-pill">{o.status}</span>
      <span />
    </div>
  ));
}

function EbayPanel({ ebay, onAction }) {
  const [tab, setTab] = useState("active");
  if (!ebay.connected) return <p className="sf-err">{ebay.error || "eBay is not connected."}</p>;
  const lists = { active: ebay.active, drafts: ebay.drafts };
  return (
    <>
      <div className="sf-tabs" role="tablist">
        {[["active", `Active (${ebay.active.length})`], ["drafts", `Drafts (${ebay.drafts.length})`], ["sold", "Sold"]].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className="sf-tab" onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === "sold"
        ? <SoldRows sold={ebay.sold} />
        : lists[tab].length
          ? lists[tab].map((item) => <ListingRow key={item.offerId} item={item} onAction={onAction} />)
          : <p className="sf-empty">{tab === "active" ? "Nothing is live right now." : "No drafts."}</p>}
    </>
  );
}

function ExternalPanel({ id, data }) {
  const text = {
    instagram: data.instagram?.connected ? `Connected as @${data.instagram.username}` : "Not connected",
    facebook: data.facebook?.connected ? `Connected: ${data.facebook.name}` : "Not connected",
    site: "The shop section syncs live from eBay. New ebook listings appear within about 15 minutes.",
    shopify: data.shopify?.note || "",
    etsy: data.etsy?.note || "",
    amazon: data.amazon?.note || "",
  };
  const url = { site: data.site?.url, shopify: data.shopify?.url }[id];
  return (
    <div className="sf-ext">
      <span className="sf-sub">{text[id]}</span>
      {url ? <a className="sf-link" href={url} target="_blank" rel="noreferrer">Open</a> : null}
    </div>
  );
}

export default function StorefrontsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState("ebay");
  const [pending, setPending] = useState(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const dialogRef = useRef(null);

  const load = () =>
    authedFetch("/api/storefronts")
      .then((r) => r.json())
      .then((j) => (j.ok ? setData(j.storefronts) : setError(j.error || "Could not load storefronts")))
      .catch(() => setError("Could not load storefronts"));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (pending && !d.open) d.showModal();
    if (!pending && d.open) d.close();
  }, [pending]);

  const phrase = pending ? PHRASE[pending.action] : "";

  async function confirmAction() {
    if (!pending || typed !== phrase) return;
    setBusy(true);
    try {
      const r = await authedFetch("/api/storefronts/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: pending.action, offerId: pending.item.offerId, confirm: phrase }),
      });
      const j = await r.json();
      setNotice(j.ok ? `${pending.action === "publish" ? "Published" : "Ended"} ${pending.item.sku}.` : `Failed: ${j.error}`);
      if (j.ok) await load();
    } catch {
      setNotice("Failed: the request did not reach the server.");
    } finally {
      setBusy(false);
      setPending(null);
      setTyped("");
    }
  }

  const shell = (children) => (
    <main className="sf-root"><style dangerouslySetInnerHTML={{ __html: CSS }} />{children}</main>
  );

  if (error) return shell(<p className="sf-err" style={{ padding: 28 }}>{error}</p>);
  if (!data) return shell(<p className="sf-sub" style={{ padding: 28 }}>Loading storefronts…</p>);

  const ebayLive = data.ebay.connected ? data.ebay.active.length : 0;
  const ebayDrafts = data.ebay.connected ? data.ebay.drafts.length : 0;
  const current = CHANNELS.find((c) => c.key === active);

  return shell(
    <>
      <header className="sf-top">
        <h1>Storefronts</h1>
        <p>{ebayLive} live on eBay · {ebayDrafts} drafts waiting</p>
      </header>

      <div className="sf-grid">
        <nav className="sf-nav" aria-label="Storefronts">
          {CHANNELS.map((c) => {
            const s = data[c.key];
            const connected = Boolean(s?.connected);
            const count = c.key === "ebay" && data.ebay.connected ? data.ebay.active.length : null;
            return (
              <button key={c.key} aria-current={active === c.key ? "true" : undefined} onClick={() => setActive(c.key)}>
                <span className={`sf-dot${connected ? " on" : ""}`} aria-hidden="true" />
                {c.label}
                {count != null && <span className="sf-navcount">{count}</span>}
              </button>
            );
          })}
        </nav>

        <section className="sf-main" aria-labelledby="sf-current">
          <div className="sf-head">
            <h2 id="sf-current">{current.label}</h2>
            <span className="sf-meta" role="status">{notice}</span>
          </div>
          {active === "ebay"
            ? <EbayPanel ebay={data.ebay} onAction={(action, item) => { setNotice(""); setPending({ action, item }); }} />
            : <ExternalPanel id={active} data={data} />}
        </section>
      </div>

      <dialog className="sf-dlg" ref={dialogRef} onClose={() => { setPending(null); setTyped(""); }}>
        {pending && (
          <>
            <h3>{pending.action === "publish" ? "Publish this draft live?" : "End this listing?"}</h3>
            <p>
              {pending.action === "publish"
                ? `${pending.item.sku} goes on sale at $${pending.item.price} on eBay.`
                : `${pending.item.sku} comes off eBay. Buyers cannot see it until it is published again.`}
            </p>
            <label htmlFor="sf-type" className="sf-sub">Type {phrase} to confirm</label>
            <input id="sf-type" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            <div className="sf-actions">
              <button className="sf-btn quiet" onClick={() => setPending(null)} disabled={busy}>Cancel</button>
              <button className="sf-btn primary" onClick={confirmAction} disabled={busy || typed !== phrase}>
                {busy ? "Working…" : pending.action === "publish" ? "Publish live" : "End listing"}
              </button>
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
