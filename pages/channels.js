import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { requireSession, authedFetch } from "../lib/clientAuth";

// Client ID and RuName are not secrets — they're the public half of the
// OAuth authorize URL, same as any "Sign in with Google" client_id. The
// actual secret (EBAY_CLIENT_SECRET) never leaves the server; it's only
// used in pages/api/channels/ebay/callback.js during the code exchange.
const EBAY_CLIENT_ID = process.env.NEXT_PUBLIC_EBAY_CLIENT_ID;
const EBAY_RUNAME = process.env.NEXT_PUBLIC_EBAY_RUNAME;

const EBAY_STATE_STORAGE_KEY = "boss_ebay_oauth_state";

// Starts the eBay connect flow. Generates a random anti-CSRF state value,
// stashes it in sessionStorage, then navigates. Without this, an attacker
// could complete their OWN eBay OAuth consent, capture their own
// authorization code, and trick a logged-in victim into opening
// /channels/ebay-callback?code=<attacker's code> — the victim's session
// would link the ATTACKER's eBay account to the VICTIM's tenant. The
// callback page verifies the returned state matches before proceeding.
function startEbayConnect() {
  const state = crypto.randomUUID();
  sessionStorage.setItem(EBAY_STATE_STORAGE_KEY, state);

  const scope = "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account";
  const params = new URLSearchParams({
    client_id: EBAY_CLIENT_ID,
    redirect_uri: EBAY_RUNAME,
    response_type: "code",
    scope,
    state,
  });
  window.location.href = `https://auth.ebay.com/oauth2/authorize?${params.toString()}`;
}

// Etsy — same shared-app-registration, per-tenant-consent pattern as eBay,
// but OAuth 2.0 + PKCE (public client): no client secret ever appears
// client-side, but a code_verifier has to be generated here, stashed for
// the callback page to send back to the server, and proven via a SHA-256
// code_challenge in this authorize request.
const ETSY_KEYSTRING = process.env.NEXT_PUBLIC_ETSY_KEYSTRING;
const ETSY_REDIRECT_URI = process.env.NEXT_PUBLIC_ETSY_REDIRECT_URI;
const ETSY_OAUTH_SCOPES = "listings_r listings_w transactions_r shops_r";
const ETSY_STATE_STORAGE_KEY = "boss_etsy_oauth_state";
const ETSY_VERIFIER_STORAGE_KEY = "boss_etsy_code_verifier";

function base64UrlEncode(bytes) {
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return base64UrlEncode(bytes); // ~86 chars, well within PKCE's 43-128 range
}

async function computeCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

async function startEtsyConnect() {
  const state = crypto.randomUUID();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await computeCodeChallenge(codeVerifier);

  sessionStorage.setItem(ETSY_STATE_STORAGE_KEY, state);
  sessionStorage.setItem(ETSY_VERIFIER_STORAGE_KEY, codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: ETSY_KEYSTRING,
    redirect_uri: ETSY_REDIRECT_URI,
    scope: ETSY_OAUTH_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  window.location.href = `https://www.etsy.com/oauth/connect?${params.toString()}`;
}

// Channels dashboard: honest per-channel status, live connection tests,
// and the manual listing-package generator. No channel is ever shown as
// "Connected" unless a real authenticated API test succeeded.

const STATUS_META = {
  connected: { label: "Connected", color: "#16a34a" },
  not_connected: { label: "Not connected", color: "#6b7280" },
  awaiting_approval: { label: "Awaiting approval", color: "#d97706" },
  manual_workflow: { label: "Manual workflow", color: "#2563eb" },
  configuration_required: { label: "Configuration required", color: "#dc2626" },
};

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.not_connected;
  return (
    <span style={{
      background: meta.color, color: "#fff", borderRadius: 999,
      padding: "2px 10px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
    }}>
      {meta.label}
    </span>
  );
}

function CopyButton({ text, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text || "");
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      style={{ marginLeft: 8, fontSize: 12, cursor: "pointer" }}
    >
      {copied ? "Copied!" : `Copy ${label}`}
    </button>
  );
}

function ManualPackageViewer({ pkg }) {
  const f = pkg.fields;
  return (
    <div className="panel" style={{ marginTop: 12, padding: 14 }}>
      <h4 style={{ margin: "0 0 8px" }}>
        {pkg.platformLabel}{" "}
        <a href={pkg.postUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
          open posting page ↗
        </a>
      </h4>
      <div><strong>Title</strong> ({f.title.length}/{pkg.limits.titleMax})<CopyButton text={f.title} label="title" /><div>{f.title}</div></div>
      <div style={{ marginTop: 8 }}>
        <strong>Description</strong><CopyButton text={f.description} label="description" />
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: "4px 0" }}>{f.description}</pre>
      </div>
      <div><strong>Price:</strong> ${f.price}<CopyButton text={f.price} label="price" /></div>
      <div><strong>Condition:</strong> {f.condition || "—"}</div>
      <div><strong>Category tip:</strong> {f.categorySuggestion}</div>
      <div><strong>Shipping:</strong> {f.shippingText}</div>
      <div><strong>Keywords:</strong> {f.keywords.join(", ")}<CopyButton text={f.keywords.join(", ")} label="keywords" /></div>
      {pkg.images.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <strong>Images:</strong>{" "}
          {pkg.images.map((src, i) => (
            <a key={src} href={src} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>image {i + 1} ↗</a>
          ))}
        </div>
      )}
      <details style={{ marginTop: 8 }}>
        <summary>Photo checklist</summary>
        <ul>{pkg.photoChecklist.map((item) => <li key={item}>{item}</li>)}</ul>
      </details>
      <p style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>Tone guide: {pkg.toneGuide}</p>
    </div>
  );
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState([]);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState("");
  const [testResults, setTestResults] = useState({});
  const [sku, setSku] = useState("");
  const [packages, setPackages] = useState([]);
  const [busy, setBusy] = useState(false);
  // Keyed by marketplace id: { ebay: {connected, account_identifier}, etsy: {...} }
  const [tenantConnections, setTenantConnections] = useState({});

  const loadChannels = useCallback(async () => {
    try {
      const res = await authedFetch("/api/channels");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setChannels(data.channels);
    } catch (err) {
      setError(`Could not load channels: ${err.message}`);
    }
  }, []);

  // Per-tenant connection status per marketplace — distinct from the
  // app-level "Test connection" above, which only proves the SHARED
  // credentials work, not whether THIS customer has connected their own
  // account/shop. Generalized to loop over both eBay and Etsy rather than
  // duplicating the eBay-only version that existed before Etsy was added.
  const loadTenantConnections = useCallback(async () => {
    const results = {};
    await Promise.all(
      ["ebay", "etsy"].map(async (marketplace) => {
        try {
          const res = await authedFetch(`/api/channels/${marketplace}/status`);
          const data = await res.json();
          if (data.ok) results[marketplace] = data;
        } catch {
          // Non-fatal — that card just shows "not connected" if this fails.
        }
      })
    );
    setTenantConnections(results);
  }, []);

  useEffect(() => {
    if (!requireSession()) return;
    loadChannels();
    loadTenantConnections();
  }, [loadChannels, loadTenantConnections]);

  async function runTest(channelId) {
    setTesting(channelId);
    try {
      const res = await authedFetch("/api/channels/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: channelId }),
      });
      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [channelId]: data.detail || data.error }));
      if (data.status) {
        setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, status: data.status, detail: data.detail } : c)));
      }
    } catch (err) {
      setTestResults((prev) => ({ ...prev, [channelId]: err.message }));
    } finally {
      setTesting("");
    }
  }

  async function generatePackages(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setPackages([]);
    try {
      const res = await authedFetch("/api/channels/manual-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: sku.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setPackages(data.packages);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Boss Listers</p>
          <h1>Channels</h1>
        </div>
        <nav>
          <Link className="nav-link" href="/">Stager</Link>
          <Link className="nav-link" href="/history">History</Link>
        </nav>
      </header>

      {error && <p style={{ color: "#dc2626" }}>{error}</p>}

      <section>
        <h2 className="section-heading">Marketplace connections</h2>
        <div className="platform-grid">
          {channels.map((ch) => (
            <div key={ch.id} className="panel" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <strong>{ch.label}</strong>
                <StatusPill status={ch.status} />
              </div>
              <p style={{ fontSize: 13, color: "#4b5563", minHeight: 40 }}>{ch.detail}</p>
              {ch.last_sync_at && <p style={{ fontSize: 12 }}>Last sync: {ch.last_sync_at}</p>}

              {(ch.id === "ebay" || ch.id === "etsy") && (() => {
                const conn = tenantConnections[ch.id];
                const connectFn = ch.id === "ebay" ? startEbayConnect : startEtsyConnect;
                const label = ch.id === "ebay" ? "eBay" : "Etsy";
                return (
                  <div style={{ margin: "8px 0", padding: 10, borderRadius: 8, background: conn?.connected ? "#f0fdf4" : "#f9fafb" }}>
                    {conn?.connected ? (
                      <p style={{ fontSize: 13, margin: 0, color: "#166534" }}>
                        ✓ Your {label} {ch.id === "etsy" ? "shop" : "account"} is connected{conn.account_identifier ? ` (${conn.account_identifier})` : ""}.
                      </p>
                    ) : (
                      <>
                        <p style={{ fontSize: 13, margin: "0 0 8px" }}>Connect your own {label} {ch.id === "etsy" ? "shop" : "account"} to start listing.</p>
                        <button type="button" onClick={connectFn} className="btn-primary" style={{ fontSize: 13 }}>
                          Connect {label}
                        </button>
                      </>
                    )}
                  </div>
                );
              })()}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {ch.mode === "api" && (
                  <button type="button" disabled={testing === ch.id} onClick={() => runTest(ch.id)}>
                    {testing === ch.id ? "Testing…" : "Test connection"}
                  </button>
                )}
                <a href={`https://github.com/mjardin17/boss-listers-mvp/blob/main/${ch.setup}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, alignSelf: "center" }}>
                  Setup instructions ↗
                </a>
              </div>
              {testResults[ch.id] && <p style={{ fontSize: 12, marginTop: 6 }}>{testResults[ch.id]}</p>}
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 className="section-heading">Manual listing package</h2>
        <p style={{ fontSize: 14, color: "#4b5563" }}>
          Generate copy-paste-ready listings for Facebook Marketplace, OfferUp, Craigslist,
          Mercari, and Poshmark from any SKU in your shared inventory. You post them yourself —
          nothing is ever auto-submitted to a marketplace.
        </p>
        <form onSubmit={generatePackages} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="Enter a SKU from your inventory"
            style={{ padding: 8, minWidth: 260 }}
            required
          />
          <button type="submit" disabled={busy}>{busy ? "Generating…" : "Generate package"}</button>
          {packages.length > 0 && (
            <a
              href={`/api/channels/manual-package?format=csv`}
              onClick={(e) => {
                // CSV needs a POST; do it via a temporary form-less fetch → blob.
                e.preventDefault();
                authedFetch("/api/channels/manual-package?format=csv", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ sku: sku.trim() }),
                }).then(async (res) => {
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `listing-package-${sku.trim()}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                });
              }}
            >
              Download CSV
            </a>
          )}
        </form>
        {packages.map((pkg) => <ManualPackageViewer key={pkg.platform} pkg={pkg} />)}
      </section>
    </div>
  );
}
