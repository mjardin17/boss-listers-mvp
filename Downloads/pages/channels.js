import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getSession, authedFetch } from "../lib/clientAuth";

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

// TikTok Shop OAuth
const TIKTOK_STATE_STORAGE_KEY = "boss_tiktok_oauth_state";

function startTikTokConnect() {
  const state = crypto.randomUUID();
  sessionStorage.setItem(TIKTOK_STATE_STORAGE_KEY, state);
  window.location.href = `/api/channels/tiktok/auth-start?state=${state}`;
}

// Amazon OAuth
const AMAZON_STATE_STORAGE_KEY = "boss_amazon_oauth_state";

function startAmazonConnect() {
  const state = crypto.randomUUID();
  sessionStorage.setItem(AMAZON_STATE_STORAGE_KEY, state);
  window.location.href = `/api/channels/amazon/auth-start?state=${state}`;
}

// Platform configuration with icons and display names
const PLATFORM_CONFIG = {
  ebay: { name: "eBay", icon: "🏪" },
  etsy: { name: "Etsy", icon: "🧵" },
  amazon: { name: "Amazon", icon: "🔶" },
  facebook_shop: { name: "Facebook Shop", icon: "👥" },
  tiktok_shop: { name: "TikTok Shop", icon: "🎵" },
};

const STATUS_COLORS = {
  connected: "bg-green-100 border-green-300 text-green-900",
  not_connected: "bg-gray-100 border-gray-300 text-gray-700",
  awaiting_approval: "bg-amber-100 border-amber-300 text-amber-900",
  manual_workflow: "bg-blue-100 border-blue-300 text-blue-900",
  configuration_required: "bg-red-100 border-red-300 text-red-900",
};

function StatusPill({ status }) {
  const labels = {
    connected: "Connected",
    not_connected: "Not connected",
    awaiting_approval: "Awaiting approval",
    manual_workflow: "Manual workflow",
    configuration_required: "Configuration required",
  };

  const label = labels[status] || "Unknown";
  const colorClass = STATUS_COLORS[status] || STATUS_COLORS.not_connected;

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${colorClass}`}>
      {status === "connected" && <span className="inline-block mr-1 text-base">✓</span>}
      {label}
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
      className="ml-2 px-2 py-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
    >
      {copied ? "Copied!" : `Copy ${label}`}
    </button>
  );
}

function ManualPackageViewer({ pkg }) {
  const f = pkg.fields;
  return (
    <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-white">
      <h4 className="text-base font-semibold text-gray-900 mb-3">
        {pkg.platformLabel}{" "}
        <a href={pkg.postUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:text-blue-700">
          open posting page ↗
        </a>
      </h4>
      <div className="space-y-3 text-sm">
        <div>
          <strong>Title</strong> ({f.title.length}/{pkg.limits.titleMax})
          <CopyButton text={f.title} label="title" />
          <div className="mt-1 p-2 bg-gray-50 rounded text-gray-700">{f.title}</div>
        </div>
        <div>
          <strong>Description</strong>
          <CopyButton text={f.description} label="description" />
          <pre className="mt-1 p-2 bg-gray-50 rounded overflow-x-auto text-gray-700 font-mono text-xs">{f.description}</pre>
        </div>
        <div><strong>Price:</strong> ${f.price}<CopyButton text={f.price} label="price" /></div>
        <div><strong>Condition:</strong> {f.condition || "—"}</div>
        <div><strong>Category tip:</strong> {f.categorySuggestion}</div>
        <div><strong>Shipping:</strong> {f.shippingText}</div>
        <div>
          <strong>Keywords:</strong> {f.keywords.join(", ")}
          <CopyButton text={f.keywords.join(", ")} label="keywords" />
        </div>
        {pkg.images.length > 0 && (
          <div>
            <strong>Images:</strong>
            <div className="mt-1 space-x-2">
              {pkg.images.map((src, i) => (
                <a key={src} href={src} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700">
                  image {i + 1} ↗
                </a>
              ))}
            </div>
          </div>
        )}
        <details className="mt-2">
          <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">Photo checklist</summary>
          <ul className="mt-2 ml-4 space-y-1 list-disc text-gray-600">
            {pkg.photoChecklist.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
        <p className="text-xs text-gray-500 mt-2">Tone guide: {pkg.toneGuide}</p>
      </div>
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
    const session = getSession();
    if (session?.accessToken) {
      loadChannels();
      loadTenantConnections();
    }
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Marketplace Integrations</p>
              <h1 className="text-3xl font-bold text-gray-900 mt-1">Channel Connections</h1>
            </div>
            <nav className="flex gap-4">
              <Link href="/" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Stager
              </Link>
              <Link href="/inventory" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Inventory
              </Link>
              <Link href="/social" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Social
              </Link>
              <Link href="/history" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                History
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            <p className="font-medium">{error}</p>
          </div>
        )}

        {/* Marketplace Connections Section */}
        <section className="mb-12">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connected Marketplaces</h2>
            <p className="text-gray-600">Authorize your marketplace accounts to start syncing inventory across channels.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {channels.map((ch) => (
              <div key={ch.id} className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                {/* Header with icon and status */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{PLATFORM_CONFIG[ch.id]?.icon || "📦"}</span>
                      <h3 className="text-lg font-bold text-gray-900">{ch.label}</h3>
                    </div>
                    <StatusPill status={ch.status} />
                  </div>
                </div>

                {/* Platform Details */}
                <p className="text-sm text-gray-600 mb-4 min-h-[60px]">{ch.detail}</p>
                {ch.last_sync_at && <p className="text-xs text-gray-500 mb-4">Last sync: {ch.last_sync_at}</p>}

                {/* OAuth Connection Section */}
                {(ch.id === "ebay" || ch.id === "etsy" || ch.id === "amazon" || ch.id === "tiktok_shop") && (() => {
                  const conn = tenantConnections[ch.id];
                  let connectFn, label;
                  if (ch.id === "ebay") {
                    connectFn = startEbayConnect;
                    label = "eBay";
                  } else if (ch.id === "etsy") {
                    connectFn = startEtsyConnect;
                    label = "Etsy";
                  } else if (ch.id === "amazon") {
                    connectFn = startAmazonConnect;
                    label = "Amazon";
                  } else {
                    connectFn = startTikTokConnect;
                    label = "TikTok Shop";
                  }
                  return (
                    <div className={`p-4 rounded-lg mb-4 ${conn?.connected ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200"}`}>
                      {conn?.connected ? (
                        <p className="text-sm text-green-800 flex items-center gap-2">
                          <span className="text-lg">✓</span>
                          Your {label} {ch.id === "etsy" ? "shop" : "account"} is connected
                          {conn.account_identifier && <span className="font-mono text-xs bg-white px-2 py-1 rounded">({conn.account_identifier})</span>}
                        </p>
                      ) : (
                        <>
                          <p className="text-sm text-gray-700 mb-3">Connect your {label} {ch.id === "etsy" ? "shop" : "account"} to start listing.</p>
                          <button
                            type="button"
                            onClick={connectFn}
                            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                          >
                            Connect {label}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* Action Buttons */}
                <div className="space-y-2">
                  {ch.mode === "api" && (
                    <button
                      type="button"
                      disabled={testing === ch.id}
                      onClick={() => runTest(ch.id)}
                      className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {testing === ch.id ? "Testing…" : "Test Connection"}
                    </button>
                  )}
                  <a
                    href={`https://github.com/mjardin17/boss-listers-mvp/blob/main/${ch.setup}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-sm text-blue-600 hover:text-blue-700 text-center py-2"
                  >
                    Setup Instructions ↗
                  </a>
                </div>

                {testResults[ch.id] && (
                  <p className="text-xs text-gray-600 mt-3 p-2 bg-gray-50 rounded">{testResults[ch.id]}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Manual Listing Package Section */}
        <section className="bg-white rounded-lg border border-gray-200 p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Manual Listing Package</h2>
            <p className="text-gray-600">
              Generate copy-paste-ready listings for Facebook Marketplace, OfferUp, Craigslist, Mercari, and Poshmark from any SKU in your inventory. You post them yourself — nothing is ever auto-submitted to a marketplace.
            </p>
          </div>

          <form onSubmit={generatePackages} className="mb-6 flex flex-col sm:flex-row gap-3">
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Enter a SKU from your inventory"
              required
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {busy ? "Generating…" : "Generate"}
            </button>
            {packages.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
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
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
              >
                Download CSV
              </button>
            )}
          </form>

          {packages.length > 0 && (
            <div className="space-y-4">
              {packages.map((pkg) => (
                <ManualPackageViewer key={pkg.platform} pkg={pkg} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
