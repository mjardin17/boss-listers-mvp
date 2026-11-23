"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { authedFetch } from "../lib/clientAuth";
import StockAlertsPanel from "../components/StockAlertsPanel";

// In-house stock: everything Josh physically has, listed or not. Same operator console look
// as Storefronts: deep slate, warm cream type, amber for the one primary action per row.
const CSS = `
.st-root{min-height:100vh;background:#0c121c;color:#f1e9d6;font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums}
.st-root *{box-sizing:border-box}
.st-top{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:20px 28px;border-bottom:1px solid #1f2a3b;flex-wrap:wrap}
.st-top h1{margin:0;font-size:20px;font-weight:650;letter-spacing:-.01em}
.st-top p{margin:0;color:#8e9db3;font-size:13px}
.st-body{padding:22px 28px;display:grid;gap:20px;max-width:1080px}
.st-stages{display:flex;gap:6px;flex-wrap:wrap}
.st-stage{all:unset;cursor:pointer;display:grid;gap:2px;padding:10px 14px;border-radius:10px;border:1px solid #1f2a3b;min-width:112px}
.st-stage:hover{border-color:#33425a}
.st-stage[aria-pressed="true"]{background:#182235;border-color:#e0a84a}
.st-stage:focus-visible,.st-btn:focus-visible,.st-link:focus-visible{outline:2px solid #e0a84a;outline-offset:2px}
.st-stage b{font-size:20px;font-weight:650;line-height:1.1}
.st-stage span{font-size:12.5px;color:#c9d2e0}
.st-stage small{font-size:11.5px;color:#8e9db3}
.st-add{display:grid;grid-template-columns:2.2fr .7fr 1.1fr 1.1fr .8fr auto;gap:10px;align-items:end;padding:14px;border:1px solid #1f2a3b;border-radius:12px;background:#111927}
.st-f{display:grid;gap:5px;font-size:12px;color:#8e9db3;font-weight:600}
.st-f input,.st-f select,.st-dlg input,.st-dlg select{width:100%;padding:8px 10px;border-radius:8px;border:1px solid #33425a;background:#0c121c;color:#f1e9d6;font:inherit;font-weight:400}
.st-f input:focus-visible,.st-f select:focus-visible,.st-dlg input:focus-visible,.st-dlg select:focus-visible{outline:2px solid #e0a84a;outline-offset:1px}
.st-btn{all:unset;cursor:pointer;padding:8px 13px;border-radius:8px;font-size:13px;font-weight:600;white-space:nowrap;text-align:center}
.st-btn.primary{background:#e0a84a;color:#1b1407}
.st-btn.primary:hover{background:#eab865}
.st-btn.quiet{border:1px solid #33425a;color:#c9d2e0}
.st-btn.quiet:hover{border-color:#8e9db3;color:#f1e9d6}
.st-btn:disabled{opacity:.45;cursor:not-allowed}
.st-row{display:grid;grid-template-columns:64px 1fr auto auto;gap:14px;align-items:center;padding:12px 4px;border-bottom:1px solid #161f2e}
.st-row:last-child{border-bottom:0}
.st-thumb{width:64px;height:64px;border-radius:8px;object-fit:cover;background:#151e2d;border:1px solid #1f2a3b;display:grid;place-items:center;color:#4a5a72;font-size:11px;text-align:center}
.st-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st-sub{color:#8e9db3;font-size:12.5px}
.st-need{color:#e0a84a;font-size:12.5px}
.st-price{font-weight:600;text-align:right;min-width:70px}
.st-acts{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.st-err{color:#e8917f;font-size:13px;margin:0}
.st-note{color:#8e9db3;font-size:13px;margin:0}
.st-empty{color:#8e9db3;padding:18px 4px;margin:0}
.st-link{color:#e0a84a;font-size:13px}
dialog.st-dlg{background:#151e2d;color:#f1e9d6;border:1px solid #33425a;border-radius:12px;padding:22px;max-width:440px;width:calc(100% - 32px)}
dialog.st-dlg::backdrop{background:rgba(5,8,14,.7)}
dialog.st-dlg h3{margin:0 0 14px;font-size:16px}
.st-dlg-grid{display:grid;gap:12px;margin-bottom:16px}
.st-dlg-acts{display:flex;justify-content:flex-end;gap:8px}
.st-cap{display:grid;gap:12px;padding:14px;border:1px solid #1f2a3b;border-radius:12px;background:#111927}
.st-cap h2{margin:0;font-size:15px;font-weight:650}
.st-shoot{display:flex;gap:10px;flex-wrap:wrap}
.st-shoot label{cursor:pointer;flex:1 1 150px;text-align:center;padding:14px 12px;border-radius:10px;font-weight:650;font-size:15px}
.st-shoot .cam{background:#e0a84a;color:#1b1407}
.st-shoot .lib{border:1px solid #33425a;color:#c9d2e0}
.st-shoot label[aria-disabled="true"]{opacity:.45;cursor:not-allowed}
.st-pics{display:flex;gap:8px;flex-wrap:wrap}
.st-pic{position:relative}
.st-pic img{width:76px;height:76px;object-fit:cover;border-radius:8px;border:1px solid #1f2a3b;display:block}
.st-pic button{all:unset;cursor:pointer;position:absolute;top:3px;right:3px;width:24px;height:24px;border-radius:12px;background:rgba(5,8,14,.75);color:#f1e9d6;text-align:center;line-height:24px;font-size:15px}
.st-pic small{position:absolute;left:4px;bottom:3px;font-size:10px;background:rgba(5,8,14,.75);padding:1px 4px;border-radius:4px}
.st-capgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.st-capgrid .wide{grid-column:1/-1}
.st-f textarea{width:100%;padding:8px 10px;border-radius:8px;border:1px solid #33425a;background:#0c121c;color:#f1e9d6;font:inherit;font-weight:400;resize:vertical}
.st-profit{font-size:13px;color:#c9d2e0}
.st-profit b{color:#8fd19e}
.st-profit b.neg{color:#e8917f}
.st-money{font-size:12px;color:#8e9db3;text-align:right}
@media (max-width:820px){.st-capgrid{grid-template-columns:1fr 1fr}.st-f input,.st-f select,.st-f textarea,.st-dlg input,.st-dlg select{font-size:16px}.st-btn{padding:11px 14px;font-size:14px}.st-money{text-align:left}.st-add{grid-template-columns:1fr 1fr}.st-add .st-f:first-child{grid-column:1/-1}.st-row{grid-template-columns:52px 1fr}.st-thumb{width:52px;height:52px}.st-price{text-align:left}.st-acts{grid-column:1/-1;justify-content:flex-start}.st-body,.st-top{padding-left:16px;padding-right:16px}}
`;

const CONDITIONS = ["New", "New with tags", "New in box", "Like new", "Used", "For parts"];
const BLANK = { title: "", quantity: "1", condition: "", location: "", price: "", cost: "", description: "" };
const MAX_PHOTOS = 9;
const MAX_EDGE = 1600;
const money = (n) => `${Number(n).toFixed(2)}`;

/** Shrinks a phone photo to a JPEG data URL (long edge 1600px) so it uploads fast and fits the 8 MB limit. */
function shrinkToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That photo could not be read. Try a JPEG or PNG.")); };
    img.src = url;
  });
}

/** Profit per unit at the asking price, or null when the price or what was paid is not filled in. */
function profitOf(price, cost) {
  if (cost === "" || cost === null || cost === undefined || !(Number(price) > 0)) return null;
  const n = Number(price) - Number(cost);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

async function postStock(body) {
  const r = await authedFetch("/api/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.error || "That could not be saved");
  return j.item;
}

/** Take photos, let AI read the first one, fill in the rest, save. Then the item shows in its stage. */
function CapturePanel({ busy, onSaved }) {
  const [draft, setDraft] = useState(BLANK);
  const [pics, setPics] = useState([]); // data URLs, first is the main photo
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [sold, setSold] = useState(null); // real sold prices for similar items
  const set =(k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const full = pics.length >= MAX_PHOTOS;
  const locked = busy || saving || full;

  async function readFirstPhoto(dataUrl) {
    setReading(true);
    setMsg("Reading the photo…");
    try {
      const [, mediaType, base64] = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl) || [];
      const r = await authedFetch("/api/inventory/analyze-product-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, imageMediaType: mediaType }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setMsg("AI could not read it. Type the details below."); return; }
      const prod = j.product || {};
      const pick = (v) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
      setDraft((d) => ({
        ...d,
        title: d.title || pick(prod.title).slice(0, 255),
        description: d.description || pick(prod.description),
        price: d.price || (j.sold ? String(j.sold.median) : Number(prod.price) > 0 ? String(prod.price) : ""),
        condition: d.condition || (CONDITIONS.includes(pick(prod.condition)) ? pick(prod.condition) : ""),
      }));
      setSold(j.sold || null);
      setMsg(j.lookedUp ? "Identified from the photo and checked online. Check it and fix anything wrong." : "Filled in from the photo. Check it and fix anything wrong.");
    } catch {
      setMsg("AI could not read it. Type the details below.");
    } finally {
      setReading(false);
    }
  }

  async function addPics(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setErr("");
    const room = MAX_PHOTOS - pics.length;
    if (files.length > room) setErr(`Up to ${MAX_PHOTOS} photos per item; kept the first ${room}.`);
    try {
      const shrunk = await Promise.all(files.slice(0, room).map(shrinkToDataUrl));
      const wasEmpty = pics.length === 0;
      setPics((cur) => [...cur, ...shrunk]);
      if (wasEmpty && shrunk[0]) readFirstPhoto(shrunk[0]);
    } catch (x) {
      setErr(x.message);
    }
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    let item;
    try {
      item = await postStock({ action: "add", ...draft });
    } catch (x) {
      setErr(x.message);
      setSaving(false);
      return;
    }
    const failed = [];
    for (let i = 0; i < pics.length; i++) {
      setMsg(`Saving photo ${i + 1} of ${pics.length}…`);
      try { item = await postStock({ action: "photo", sku: item.sku, photo: pics[i] }); }
      catch { failed.push(i + 1); }
    }
    setSaving(false);
    setDraft(BLANK);
    setPics([]);
    setSold(null);
    setMsg(failed.length ? `Saved ${item.title}, but photo ${failed.join(", ")} did not upload. Add it from the item.` : `Saved ${item.title}. Take the next one.`);
    onSaved(item);
  }

  const profit = profitOf(draft.price, draft.cost);
  return (
    <form className="st-cap" onSubmit={save} aria-label="Add an item">
      <h2>Add an item</h2>
      <div className="st-shoot">
        <label className="cam" aria-disabled={locked}>
          Take photo
          <input type="file" accept="image/*" capture="environment" hidden disabled={locked} onChange={addPics} />
        </label>
        <label className="lib" aria-disabled={locked}>
          Choose photos
          <input type="file" accept="image/*" multiple hidden disabled={locked} onChange={addPics} />
        </label>
      </div>
      {pics.length > 0 && (
        <div className="st-pics">
          {pics.map((src, i) => (
            <div className="st-pic" key={i}>
              <img src={src} alt={`Photo ${i + 1}`} />
              {i === 0 && <small>Main</small>}
              <button type="button" aria-label={`Remove photo ${i + 1}`} disabled={saving} onClick={() => setPics((cur) => cur.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
        </div>
      )}
      <div className="st-capgrid">
        <label className="st-f wide">Item name<input value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={255} required placeholder={reading ? "Reading the photo…" : ""} /></label>
        <label className="st-f">How many<input type="number" inputMode="numeric" min="0" step="1" value={draft.quantity} onChange={(e) => set("quantity", e.target.value)} required /></label>
        <label className="st-f">Condition
          <select value={draft.condition} onChange={(e) => set("condition", e.target.value)}>
            <option value="">Not set</option>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="st-f">What you paid<input type="number" inputMode="decimal" min="0" step="0.01" value={draft.cost} onChange={(e) => set("cost", e.target.value)} placeholder="$" /></label>
        <label className="st-f">Your price<input type="number" inputMode="decimal" min="0" step="0.01" value={draft.price} onChange={(e) => set("price", e.target.value)} placeholder="Later" /></label>
        <label className="st-f wide">Where it is kept<input value={draft.location} onChange={(e) => set("location", e.target.value)} maxLength={80} placeholder="Shelf, bin or box" /></label>
        <label className="st-f wide">Description<textarea rows={3} value={draft.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} /></label>
      </div>
      {sold && (
        <p className="st-note">
          Similar items sold for {money(sold.low)} to {money(sold.high)}, middle {money(sold.median)} ({sold.count} sales).{" "}
          {sold.sourceUrls[0] && <a href={sold.sourceUrls[0]} target="_blank" rel="noopener noreferrer">See sales</a>}
        </p>
      )}
      <p className="st-profit">{profit === null ? "Profit shows when you fill in what you paid and your price." : <>Profit per unit: <b className={profit < 0 ? "neg" : ""}>{money(profit)}</b></>}</p>
      {err && <p className="st-err">{err}</p>}
      {msg && <p className="st-note" role="status">{msg}</p>}
      <button className="st-btn primary" disabled={busy || saving || reading || !draft.title.trim()}>{saving ? "Saving…" : "Save item"}</button>
    </form>
  );
}
const STAGE_HELP = {
  intake: "Something is still missing.",
  needs_review: "Complete. Waiting for you to approve.",
  ready: "Approved. Not listed anywhere yet.",
  listed: "Live on a selling site.",
  sold: "None left.",
  archived: "Ended or put away.",
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Row({ item, busy, onAct, onEdit, onPhoto }) {
  const fileRef = useRef(null);
  const mainRef = useRef(null);
  const photoCount = Array.isArray(item.image_urls) && item.image_urls.length ? item.image_urls.length : item.image_url ? 1 : 0;
  const inHouse = item.stage === "intake" || item.stage === "needs_review" || item.stage === "ready";
  return (
    <div className="st-row">
      {item.image_url ? <img className="st-thumb" src={item.image_url} alt="" loading="lazy" width="64" height="64" /> : <div className="st-thumb">No photo</div>}
      <div style={{ minWidth: 0 }}>
        <div className="st-name">{item.title}</div>
        <div className="st-sub">
          {item.sku} · {item.digital ? "digital, never runs out" : `qty ${item.quantity}`}{item.condition ? ` · ${item.condition}` : ""}{item.location ? ` · ${item.location}` : ""}{photoCount > 1 ? ` · ${photoCount} photos` : ""}
        </div>
        {item.stage === "intake" && item.missing.length ? <div className="st-need">Needs {item.missing.join(", ")}</div> : null}
      </div>
      <div className="st-price">
        {Number(item.price) > 0 ? money(item.price) : "No price"}
        {item.cost !== null && item.cost !== undefined && <div className="st-money">paid {money(item.cost)}{item.profit !== null && item.profit !== undefined ? ` · ${item.profit < 0 ? "loses" : "makes"} ${money(Math.abs(item.profit))}` : ""}</div>}
      </div>
      <div className="st-acts">
        {inHouse && (
          <>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onPhoto(item, e.target.files?.[0], false); e.target.value = ""; }} />
            <input ref={mainRef} type="file" accept="image/*" hidden onChange={(e) => { onPhoto(item, e.target.files?.[0], true); e.target.value = ""; }} />
            {photoCount < MAX_PHOTOS && <button className="st-btn quiet" disabled={busy} onClick={() => fileRef.current?.click()}>{photoCount ? "Add photo" : "Take photo"}</button>}
            {photoCount > 0 && <button className="st-btn quiet" disabled={busy} onClick={() => mainRef.current?.click()}>Change main photo</button>}
          </>
        )}
        {item.stage !== "archived" && <button className="st-btn quiet" disabled={busy} onClick={() => onEdit(item)}>Edit</button>}
        {item.stage === "needs_review" && <button className="st-btn primary" disabled={busy} onClick={() => onAct("approve", item)}>Approve</button>}
        {item.stage === "ready" && <button className="st-btn quiet" disabled={busy} onClick={() => onAct("unapprove", item)}>Send back</button>}
        {(inHouse || item.stage === "sold") && <button className="st-btn quiet" disabled={busy} onClick={() => onAct("archive", item)}>Put away</button>}
        {item.canBringBack && <button className="st-btn quiet" disabled={busy} onClick={() => onAct("restore", item)}>Bring back</button>}
      </div>
    </div>
  );
}

export default function StockPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stage, setStage] = useState("needs_review");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const dialogRef = useRef(null);

  const load = () =>
    authedFetch("/api/stock")
      .then((r) => r.json())
      .then((j) => (j.ok ? setData(j) : setError(j.error || "Could not load your stock")))
      .catch(() => setError("Could not load your stock"));

  useEffect(() => { load(); }, []);
  // Open on the first stage that has something in it, starting with what needs Josh.
  const pickedStage = useRef(false);
  useEffect(() => {
    if (!data || pickedStage.current) return;
    pickedStage.current = true;
    const first = ["needs_review", "intake", "ready", "listed"].find((s) => data.summary[s].items > 0);
    if (first) setStage(first);
  }, [data]);
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (editing && !d.open) d.showModal();
    if (!editing && d.open) d.close();
  }, [editing]);

  const shown = useMemo(() => (data ? data.items.filter((i) => i.stage === stage) : []), [data, stage]);

  async function send(body, done) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await authedFetch("/api/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.ok) { setError(j.error || "That could not be saved"); return false; }
      setNotice(done(j.item));
      await load();
      return j.item;
    } catch {
      setError("The request did not reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function itemSaved(item) {
    setError("");
    setNotice(`Added ${item.title}.`);
    setStage(item.stage);
    await load();
  }
  const act = async (action, item) => {
    const words = { approve: "is ready to list", unapprove: "went back for review", archive: "was put away", restore: "is back in your stock" };
    const saved = await send({ action, sku: item.sku }, (i) => `${i.title} ${words[action]}.`);
    if (saved) setStage(saved.stage);
  };
  async function addPhoto(item, file, replace) {
    if (!file) return;
    try {
      const photo = await shrinkToDataUrl(file);
      await send({ action: "photo", sku: item.sku, photo, replace }, (i) => `Photo saved for ${i.title}.`);
    } catch (err) {
      setError(err.message);
    }
  }
  async function saveEdit(e) {
    e.preventDefault();
    const { item, fields } = editing;
    const changed = Object.fromEntries(Object.entries(fields).filter(([k, v]) => String(v ?? "") !== String(item[k] ?? "")));
    if (!Object.keys(changed).length) { setEditing(null); return; }
    const saved = await send({ action: "update", sku: item.sku, fields: changed }, (i) => `Saved ${i.title}.`);
    if (saved) { setEditing(null); setStage(saved.stage); }
  }
  const openEdit = (item) => setEditing({ item, fields: { title: item.title, price: item.price ?? "", cost: item.cost ?? "", quantity: item.quantity, condition: item.condition || "", location: item.location || "", description: item.description || "" } });
  const setField = (k, v) => setEditing((cur) => ({ ...cur, fields: { ...cur.fields, [k]: v } }));

  const shell = (children) => <main className="st-root"><style dangerouslySetInnerHTML={{ __html: CSS }} />{children}</main>;
  if (!data && error) return shell(<div className="st-body"><p className="st-err">{error}</p></div>);
  if (!data) return shell(<div className="st-body"><p className="st-note">Loading your stock…</p></div>);

  const total = Object.values(data.summary).reduce((n, s) => n + s.items, 0);
  const onHand = ["intake", "needs_review", "ready", "listed"].reduce((n, k) => n + data.summary[k].units, 0);
  const countLocked = editing && (editing.item.stage === "listed" || editing.item.stage === "sold");

  return shell(
    <>
      <header className="st-top">
        <h1>In-house stock</h1>
        <p>{plural(total, "item")} · {plural(onHand, "unit")} on hand · <a className="st-link" href="/storefronts">Storefronts</a></p>
      </header>

      <div className="st-body">
        <StockAlertsPanel />

        <CapturePanel busy={busy} onSaved={itemSaved} />

        <div className="st-stages" role="group" aria-label="Stage">
          {data.stages.map((s) => (
            <button key={s.id} className="st-stage" aria-pressed={stage === s.id} onClick={() => setStage(s.id)}>
              <b>{data.summary[s.id].items}</b><span>{s.label}</span><small>{plural(data.summary[s.id].units, "unit")}</small>
            </button>
          ))}
        </div>

        <div role="status" aria-live="polite">
          {error ? <p className="st-err">{error}</p> : <p className="st-note">{notice || STAGE_HELP[stage]}</p>}
        </div>

        <section aria-label={`${stage} items`}>
          {shown.length
            ? shown.map((item) => <Row key={item.sku} item={item} busy={busy} onAct={act} onEdit={openEdit} onPhoto={addPhoto} />)
            : <p className="st-empty">Nothing here.</p>}
        </section>
      </div>

      <dialog className="st-dlg" ref={dialogRef} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={saveEdit}>
            <h3>Edit item</h3>
            <div className="st-dlg-grid">
              <label className="st-f">Item name<input value={editing.fields.title} onChange={(e) => setField("title", e.target.value)} maxLength={255} required /></label>
              <label className="st-f">Your price<input type="number" min="0" step="0.01" value={editing.fields.price} onChange={(e) => setField("price", e.target.value)} /></label>
              <label className="st-f">How many{countLocked ? " (kept by the automatic sync)" : ""}<input type="number" min="0" step="1" value={editing.fields.quantity} disabled={countLocked} onChange={(e) => setField("quantity", e.target.value)} /></label>
              <label className="st-f">Condition
                <select value={editing.fields.condition} onChange={(e) => setField("condition", e.target.value)}>
                  <option value="">Not set</option>
                  {[...new Set([...CONDITIONS, editing.fields.condition].filter(Boolean))].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="st-f">Where it is kept<input value={editing.fields.location} onChange={(e) => setField("location", e.target.value)} maxLength={80} /></label>
              <label className="st-f">What you paid<input type="number" inputMode="decimal" min="0" step="0.01" value={editing.fields.cost} onChange={(e) => setField("cost", e.target.value)} /></label>
              <label className="st-f">Description<textarea rows={3} value={editing.fields.description} onChange={(e) => setField("description", e.target.value)} maxLength={4000} /></label>
            </div>
            <div className="st-dlg-acts">
              <button type="button" className="st-btn quiet" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
              <button className="st-btn primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
