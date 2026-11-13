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
.sf-posts{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
.sf-post{background:#151e2d;border:1px solid #1f2a3b;border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.sf-post img{width:100%;aspect-ratio:4/5;object-fit:cover;display:block;background:#0c121c}
.sf-post-blank{aspect-ratio:4/5;display:grid;place-items:center;background:#0c121c;color:#4a5a72;font-size:13px}
.sf-post-body{padding:10px 12px;display:grid;gap:4px}
.sf-post-text{margin:0;font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
dialog.sf-dlg{background:#151e2d;color:#f1e9d6;border:1px solid #33425a;border-radius:12px;padding:22px;max-width:440px;width:calc(100% - 32px)}
dialog.sf-dlg::backdrop{background:rgba(5,8,14,.7)}
dialog.sf-dlg h3{margin:0 0 8px;font-size:16px}
dialog.sf-dlg p{margin:0 0 14px;color:#c9d2e0;font-size:14px}
dialog.sf-dlg label{display:block;margin-bottom:6px}
dialog.sf-dlg input{width:100%;padding:9px 11px;border-radius:8px;border:1px solid #33425a;background:#0c121c;color:#f1e9d6;font:inherit;margin-bottom:14px}
dialog.sf-dlg input:focus-visible{outline:2px solid #e0a84a;outline-offset:1px}
.sf-actions{display:flex;justify-content:flex-end;gap:8px}
.sf-video{display:grid;gap:18px;max-width:620px}
.sf-field{display:grid;gap:6px;border:0;padding:0;margin:0}
.sf-field>label,.sf-field>legend{font-size:13px;color:#c9d2e0;font-weight:600;padding:0}
.sf-field select,.sf-field textarea,.sf-video-live input{width:100%;padding:9px 11px;border-radius:8px;border:1px solid #33425a;background:#0c121c;color:#f1e9d6;font:inherit}
.sf-field select:focus-visible,.sf-field textarea:focus-visible,.sf-video-live input:focus-visible,.sf-check input:focus-visible{outline:2px solid #e0a84a;outline-offset:1px}
.sf-video-make{padding-bottom:18px;border-bottom:1px solid #1f2a3b;justify-items:start}
.sf-video-make select{justify-self:stretch}
.sf-video-player{width:100%;max-height:340px;border-radius:10px;background:#05080e;border:1px solid #1f2a3b}
.sf-check{display:flex;flex-direction:row;align-items:center;font-size:14px;color:#f1e9d6;gap:8px;padding:4px 0;cursor:pointer}
.sf-check input{accent-color:#e0a84a;width:16px;height:16px;padding:0;margin:0;flex:none}
.sf-video-actions{display:grid;gap:14px;padding-top:14px;border-top:1px solid #1f2a3b;justify-items:start}
.sf-video-live{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;width:100%}
.sf-video-live label{grid-column:1/-1}
.sf-video-result{list-style:none;margin:0;padding:12px 14px;display:grid;gap:8px;background:#151e2d;border:1px solid #1f2a3b;border-radius:10px;font-size:14px}
@media (max-width:760px){.sf-grid{grid-template-columns:1fr}.sf-nav{position:static;border-right:0;border-bottom:1px solid #1f2a3b;display:flex;overflow-x:auto;gap:4px}.sf-nav button{width:auto;white-space:nowrap}.sf-main{padding:18px 16px}.sf-row{grid-template-columns:1fr auto}.sf-row .sf-pill{display:none}.sf-top{padding:16px}}
`;

const CHANNELS = [
  { key: "ebay", label: "eBay" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook Page" },
  { key: "video", label: "Send a video" },
  { key: "site", label: "Website" },
  { key: "etsy", label: "Etsy" },
  { key: "amazon", label: "Amazon" },
];

const PHRASE = { publish: "PUBLISH_LIVE", end: "END_LISTING" };

function ListingRow({ item, onAction }) {
  const isDraft = item.status === "UNPUBLISHED";
  return (
    <div className="sf-row">
      <div style={{ minWidth: 0 }}>
        <div className="sf-sku">{item.title || item.sku}</div>
        <div className="sf-sub">
          {item.listingId ? `Listing ${item.listingId}` : "Draft, not live"}
          {item.quantity != null ? ` · qty ${item.quantity}` : ""}
          {item.listedOnEbay ? " · listed on eBay" : ""}
        </div>
      </div>
      <div className="sf-price">${item.price ?? "—"}</div>
      <span className="sf-pill">{isDraft ? "Draft" : "Live"}</span>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {item.url && <a className="sf-link" href={item.url} target="_blank" rel="noreferrer">View</a>}
        {isDraft
          ? <button className="sf-btn primary" onClick={() => onAction("publish", item)}>Publish</button>
          : item.offerId
            ? <button className="sf-btn quiet" onClick={() => onAction("end", item)}>End listing</button>
            : null}
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
      {ebay.listNote && tab === "active" ? <p className="sf-note">{ebay.listNote}</p> : null}
      {tab === "sold"
        ? <SoldRows sold={ebay.sold} />
        : lists[tab].length
          ? lists[tab].map((item) => <ListingRow key={item.offerId || item.listingId} item={item} onAction={onAction} />)
          : <p className="sf-empty">{tab === "active" ? "Nothing is live right now." : "No drafts."}</p>}
    </>
  );
}

function PostGrid({ posts, empty }) {
  if (!posts || posts.length === 0) return <p className="sf-empty">{empty}</p>;
  return (
    <ul className="sf-posts">
      {posts.map((p) => (
        <li key={p.id} className="sf-post">
          {p.image
            ? <img src={p.image} alt="" loading="lazy" />
            : <div className="sf-post-blank">No image</div>}
          <div className="sf-post-body">
            <p className="sf-post-text">{p.text ? p.text.split("\n").filter(Boolean)[0] : "No caption"}</p>
            <div className="sf-sub">{p.time ? new Date(p.time).toLocaleString() : ""}</div>
            {p.url && <a className="sf-link" href={p.url} target="_blank" rel="noreferrer">Open post</a>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ExternalPanel({ id, data }) {
  if (id === "instagram" || id === "facebook") {
    const channel = data[id];
    if (!channel?.connected) return <p className="sf-err">{channel?.error || "Not connected."}</p>;
    return (
      <>
        <div className="sf-sub">{id === "instagram" ? `@${channel.username}` : channel.name} · {channel.posts.length} recent posts</div>
        <PostGrid posts={channel.posts} empty="No posts yet." />
      </>
    );
  }
  const text = {
    instagram: data.instagram?.connected ? `Connected as @${data.instagram.username}` : "Not connected",
    facebook: data.facebook?.connected ? `Connected: ${data.facebook.name}` : "Not connected",
    site: data.site?.note || "The shop section shows your active Boss Listers inventory (eBay-synced and items you add here).",
    etsy: data.etsy?.note || "",
    amazon: data.amazon?.note || "",
  };
  const url = { site: data.site?.url }[id];
  return (
    <div className="sf-ext">
      <span className="sf-sub">{text[id]}</span>
      {url ? <a className="sf-link" href={url} target="_blank" rel="noreferrer">Open</a> : null}
    </div>
  );
}

const VIDEO_PLATFORM_LABEL = { instagram: "Instagram Reel", facebook: "Facebook Page video" };

function megabytes(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Make a commercial for one live item. It saves a file on this computer and posts nothing. */
function MakeCommercial({ onMade }) {
  const [items, setItems] = useState(null);
  const [sku, setSku] = useState("");
  const [making, setMaking] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    authedFetch("/api/social/make-commercial")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return setMessage({ bad: true, text: j.error || "Could not load items" });
        setItems(j.items);
        setSku(j.items[0]?.sku || "");
      })
      .catch(() => setMessage({ bad: true, text: "Could not load items" }));
  }, []);

  async function make() {
    setMaking(true);
    setMessage(null);
    try {
      const r = await authedFetch("/api/social/make-commercial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      const j = await r.json();
      if (!j.ok) return setMessage({ bad: true, text: j.error || "The commercial could not be made" });
      setMessage({ bad: false, text: `Made ${j.commercial.name}. Nothing was posted.` });
      await onMade(j.commercial.name);
    } catch {
      setMessage({ bad: true, text: "The request did not reach the server." });
    } finally {
      setMaking(false);
    }
  }

  return (
    <div className="sf-field sf-video-make">
      <label htmlFor="sf-make-item">Make a commercial for</label>
      <select id="sf-make-item" value={sku} onChange={(e) => setSku(e.target.value)} disabled={!items || making}>
        {(items || []).map((i) => <option key={i.sku} value={i.sku}>{i.title} (${i.price.toFixed(2)})</option>)}
      </select>
      <button className="sf-btn quiet" disabled={!sku || making} onClick={make}>
        {making ? "Making… about two minutes" : "Make commercial (posts nothing)"}
      </button>
      <span role="status" aria-live="polite" className={message?.bad ? "sf-err" : "sf-sub"}>{message?.text || ""}</span>
    </div>
  );
}

/** Send one finished commercial to Instagram and the Facebook Page. Preview first, then a typed confirm. */
function VideoPanel() {
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [commercial, setCommercial] = useState("");
  const [chosen, setChosen] = useState(["instagram", "facebook"]);
  const [caption, setCaption] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState(null);

  const [version, setVersion] = useState(0);

  const loadCommercials = (select) =>
    authedFetch("/api/social/post-video")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return setLoadError(j.error || "Could not load commercials");
        setInfo(j);
        setCommercial(select || j.commercials[0]?.name || "");
        setVersion((v) => v + 1);
        setReply(null);
      })
      .catch(() => setLoadError("Could not load commercials"));

  useEffect(() => { loadCommercials(); }, []);

  if (loadError) return <p className="sf-err">{loadError}</p>;
  if (!info) return <p className="sf-sub">Loading commercials…</p>;
  if (!info.commercials.length) {
    return (
      <div className="sf-video">
        <MakeCommercial onMade={loadCommercials} />
        <p className="sf-empty">No finished commercials yet. Make one above.</p>
      </div>
    );
  }

  const toggle = (platform) => setChosen((cur) => (cur.includes(platform) ? cur.filter((p) => p !== platform) : [...cur, platform]));
  const ready = Boolean(commercial) && chosen.length > 0 && !busy;

  async function send(confirm) {
    setBusy(true);
    setReply(null);
    try {
      const r = await authedFetch("/api/social/post-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: chosen, commercial, caption, confirm }),
      });
      setReply(await r.json());
    } catch {
      setReply({ ok: false, error: "The request did not reach the server." });
    } finally {
      setBusy(false);
      setTyped("");
    }
  }

  return (
    <div className="sf-video">
      <MakeCommercial onMade={loadCommercials} />
      <div className="sf-field">
        <label htmlFor="sf-video-file">Commercial</label>
        <select id="sf-video-file" value={commercial} onChange={(e) => { setCommercial(e.target.value); setReply(null); }}>
          {info.commercials.map((c) => <option key={c.name} value={c.name}>{c.name} ({megabytes(c.bytes)})</option>)}
        </select>
        {commercial ? <video className="sf-video-player" key={`${commercial}-${version}`} src={`/commercials/${commercial}?v=${version}`} controls preload="metadata" /> : null}
      </div>

      <fieldset className="sf-field">
        <legend>Send to</legend>
        {info.platforms.map((p) => (
          <label key={p} className="sf-check">
            <input type="checkbox" checked={chosen.includes(p)} onChange={() => toggle(p)} /> {VIDEO_PLATFORM_LABEL[p] || p}
          </label>
        ))}
      </fieldset>

      <div className="sf-field">
        <label htmlFor="sf-video-caption">Caption</label>
        <textarea id="sf-video-caption" rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} />
        <span className="sf-sub">{caption.length} of 2200</span>
      </div>

      <div className="sf-video-actions">
        <button className="sf-btn quiet" disabled={!ready} onClick={() => send(undefined)}>{busy ? "Working…" : "Preview (sends nothing)"}</button>
        <span className="sf-video-live">
          <label htmlFor="sf-video-confirm" className="sf-sub">Type {info.confirmPhrase} to post for real</label>
          <input id="sf-video-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          <button className="sf-btn primary" disabled={!ready || typed !== info.confirmPhrase} onClick={() => send(info.confirmPhrase)}>Post live</button>
        </span>
      </div>

      <div role="status" aria-live="polite">
        {reply && !reply.ok ? <p className="sf-err">{reply.error}</p> : null}
        {reply && reply.ok ? (
          <ul className="sf-video-result">
            <li className="sf-sub">
              {reply.live
                ? (reply.video.uploaded ? "The commercial was copied to public storage." : "")
                : `Preview only. Nothing was uploaded or posted.${reply.video.wouldUpload ? " A live post first copies this file to public storage." : ""}`}
            </li>
            {Object.entries(reply.results).map(([platform, r]) => (
              <li key={platform}>
                <strong>{VIDEO_PLATFORM_LABEL[platform] || platform}:</strong>{" "}
                {r.success
                  ? <>posted. {r.url ? <a className="sf-link" href={r.url} target="_blank" rel="noreferrer">Open</a> : null}</>
                  : r.dryRun
                    ? `ready. A live post would: ${r.steps.map((s) => s.what).join(", then ")}.`
                    : <span className="sf-err">not posted. {r.error}</span>}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
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
            const connected = c.key === "video" ? Boolean(data.instagram?.connected || data.facebook?.connected) : Boolean(s?.connected);
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
            : active === "video" ? <VideoPanel /> : <ExternalPanel id={active} data={data} />}
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
