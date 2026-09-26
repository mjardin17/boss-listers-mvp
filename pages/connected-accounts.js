import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { requireSession, authedFetch } from "../lib/clientAuth";
import { TENANT_OAUTH_CHANNELS } from "../lib/clientOAuthConnect";

// Connected Accounts: one page, every sales channel, green/red at a
// glance. "Log in once, stay logged in" — Joshua clicks Connect once per
// channel; from then on every feature (omni-lister, sync, the phone PWA)
// reads the same stored token, and this page's Refresh button (or a
// revisit) silently renews it before it expires. Nothing here is ever
// shown "Connected" without a real live API call proving it — same rule
// pages/channels.js and pages/social.js already follow.
//
// Two backing OAuth systems, both reused as-is (see the audit report for
// why building a third would be wrong):
//  - Marketplace listing channels (eBay/Etsy/Amazon/TikTok Shop/Shopify):
//    lib/channels/apiConnectors.js + pages/api/channels/{id}/{status,
//    disconnect}.js, tokens encrypted in Supabase's
//    tenant_marketplace_connections (never .env.local).
//  - Social/content channels (Pinterest is the one this page surfaces —
//    the other 7 live at /social): lib/socialMediaAuth.js +
//    pages/api/social/{status,disconnect}.js + pages/api/oauth/..., tokens
//    encrypted in Supabase's social_media_credentials.
//
// Facebook Marketplace and Bonanza have no Connect button here on
// purpose: Facebook is blocked by Meta's device-trust wall (do not retry
// — reconnecting needs Joshua's own manual Meta re-auth), and Bonanza's
// API has no OAuth at all, only static developer keys pasted into
// .env.local.

const MARKETPLACE_IDS = ["ebay", "etsy", "amazon", "tiktok-shop", "shopify"];

const LABELS = {
  ebay: "eBay",
  etsy: "Etsy",
  amazon: "Amazon Seller Central",
  "tiktok-shop": "TikTok Shop",
  shopify: "Shopify",
  facebook: "Facebook Marketplace",
  bonanza: "Bonanza",
  pinterest: "Pinterest",
};

const STATUS_META = {
  connected: { label: "Connected", color: "#16a34a" },
  needs_login: { label: "Needs login", color: "#d97706" },
  blocked: { label: "Blocked", color: "#dc2626" },
  not_available: { label: "Not available", color: "#6b7280" },
  checking: { label: "Checking…", color: "#6b7280" },
  error: { label: "Error", color: "#dc2626" },
};

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.needs_login;
  return (
    <span style={{
      background: meta.color, color: "#fff", borderRadius: 999,
      padding: "2px 10px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
    }}>
      {meta.label}
    </span>
  );
}

const BONANZA_ROW = {
  label: "Bonanza",
  status: "not_available",
  detail: "Bonanza's API has no OAuth — it authenticates with a developer ID, cert ID, and access token pasted directly into .env.local (no browser consent screen exists to build a Connect button around). Register at api.bonanza.com/accounts/new, then add BONANZA_DEV_ID, BONANZA_CERT_ID, and BONANZA_ACCESS_TOKEN.",
  canConnect: false,
  canDisconnect: false,
};

function toMarketplaceRow(id, data) {
  if (!data.ok) {
    return { label: LABELS[id], status: "error", detail: data.error, canConnect: true, canDisconnect: false };
  }
  const live = data.live;
  if (live?.status === "connected") {
    return { label: LABELS[id], status: "connected", detail: live.detail, canConnect: true, canDisconnect: data.connected };
  }
  if (data.connected) {
    // A row exists but the live probe says it no longer works — never
    // silently drop this to "needs login" without saying why.
    return { label: LABELS[id], status: "error", detail: live?.detail || "Connected, but the live check failed.", canConnect: true, canDisconnect: true };
  }
  return { label: LABELS[id], status: "needs_login", detail: `Not connected yet.${live?.detail ? ` (${live.detail})` : ""}`, canConnect: true, canDisconnect: false };
}

function toFacebookRow(data) {
  // Standing rule: Facebook is blocked by Meta's device-trust wall. Never
  // retry the auth flow from here — show the real reason and stop.
  return {
    label: "Facebook Marketplace",
    status: "blocked",
    detail: data.ok
      ? `Blocked by Meta's device-trust wall: ${data.detail}. This needs Joshua's own manual re-authentication in Meta Business Suite — not retried automatically.`
      : `Blocked: ${data.error}`,
    canConnect: false,
    canDisconnect: false,
  };
}

function toPinterestRow(p) {
  if (!p) return { label: "Pinterest", status: "error", detail: "Could not load status.", canConnect: true, canDisconnect: false };
  if (p.live?.status === "connected") {
    return { label: "Pinterest", status: "connected", detail: p.live.detail, canConnect: true, canDisconnect: true };
  }
  if (p.connected) {
    return { label: "Pinterest", status: "error", detail: p.live?.detail || "Connected, but the live check failed.", canConnect: true, canDisconnect: true };
  }
  return {
    label: "Pinterest",
    status: "needs_login",
    detail: p.configured ? "App credentials are set up, but no account is connected yet." : "PINTEREST_CLIENT_ID / PINTEREST_CLIENT_SECRET are not set in the environment yet.",
    canConnect: p.configured,
    canDisconnect: false,
  };
}

export default function ConnectedAccountsPage() {
  const [rows, setRows] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});
  const [error, setError] = useState("");

  const checkOne = useCallback(async (id) => {
    setBusy((prev) => ({ ...prev, [id]: "checking" }));
    try {
      if (id === "pinterest") {
        const res = await authedFetch("/api/social/status?live=true");
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);
        setRows((prev) => ({ ...prev, pinterest: toPinterestRow(data.platforms.find((p) => p.id === "pinterest")) }));
      } else if (id === "facebook") {
        const res = await authedFetch("/api/channels/facebook/status");
        const data = await res.json();
        setRows((prev) => ({ ...prev, facebook: toFacebookRow(data) }));
      } else if (id === "bonanza") {
        setRows((prev) => ({ ...prev, bonanza: BONANZA_ROW }));
      } else {
        const res = await authedFetch(`/api/channels/${id}/status?live=true`);
        const data = await res.json();
        setRows((prev) => ({ ...prev, [id]: toMarketplaceRow(id, data) }));
      }
    } catch (err) {
      setRows((prev) => ({ ...prev, [id]: { label: LABELS[id], status: "error", detail: err.message, canConnect: true, canDisconnect: false } }));
    } finally {
      setBusy((prev) => ({ ...prev, [id]: null }));
    }
  }, []);

  const checkAll = useCallback(async () => {
    setLoading(true);
    setError("");
    await Promise.all([...MARKETPLACE_IDS, "facebook", "bonanza", "pinterest"].map(checkOne));
    setLoading(false);
  }, [checkOne]);

  useEffect(() => {
    if (!requireSession()) return;
    checkAll();
  }, [checkAll]);

  async function handleConnect(id) {
    if (id === "pinterest") {
      setBusy((prev) => ({ ...prev, pinterest: "connecting" }));
      try {
        const res = await authedFetch(`/api/oauth/authorize?platform=pinterest`);
        const data = await res.json();
        if (!data.ok || !data.authUrl) throw new Error(data.error || "Could not start the connect flow");
        window.location.href = data.authUrl;
      } catch (err) {
        setError(err.message);
        setBusy((prev) => ({ ...prev, pinterest: null }));
      }
      return;
    }
    TENANT_OAUTH_CHANNELS[id]?.connectFn();
  }

  async function handleDisconnect(id) {
    if (!confirm(`Disconnect ${LABELS[id]}? Listing and sync through it will stop working until you reconnect.`)) return;
    setBusy((prev) => ({ ...prev, [id]: "disconnecting" }));
    setError("");
    try {
      const path = id === "pinterest" ? "/api/social/disconnect" : `/api/channels/${id}/disconnect`;
      const res = await authedFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: id === "pinterest" ? JSON.stringify({ platform: "pinterest" }) : undefined,
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      await checkOne(id);
    } catch (err) {
      setError(err.message);
      setBusy((prev) => ({ ...prev, [id]: null }));
    }
  }

  const orderedIds = [...MARKETPLACE_IDS, "facebook", "bonanza", "pinterest"];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Boss Listers</p>
          <h1>Connected Accounts</h1>
        </div>
        <nav>
          <Link className="nav-link" href="/">Stager</Link>
          <Link className="nav-link" href="/channels">Channels (detail)</Link>
          <Link className="nav-link" href="/social">Social (detail)</Link>
        </nav>
      </header>

      <p className="panel-sub">
        Log in once per channel here. Tokens are stored encrypted and refreshed
        automatically before they expire — every feature (Omni-Lister, inventory
        sync, the phone PWA) reads the same connection from then on. Nothing on
        this page is ever shown Connected without a real live check against
        that platform, just now.
      </p>

      {error && <p style={{ color: "#dc2626" }}>{error}</p>}

      <button type="button" onClick={checkAll} disabled={loading} style={{ marginBottom: 16 }}>
        {loading ? "Checking all…" : "Refresh all"}
      </button>

      <div className="platform-grid">
        {orderedIds.map((id) => {
          const row = rows[id] || { label: LABELS[id], status: "checking", detail: "Checking…", canConnect: false, canDisconnect: false };
          const isBusy = Boolean(busy[id]);
          return (
            <div key={id} className="panel" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <strong>{row.label}</strong>
                <StatusPill status={row.status} />
              </div>
              <p style={{ fontSize: 13, color: "#4b5563", minHeight: 40 }}>{row.detail}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {row.canConnect && (
                  <button type="button" disabled={isBusy} onClick={() => handleConnect(id)}>
                    {busy[id] === "connecting"
                      ? "Connecting…"
                      : row.status === "connected" ? "Reconnect" : "Connect"}
                  </button>
                )}
                {row.canDisconnect && (
                  <button type="button" disabled={isBusy} onClick={() => handleDisconnect(id)}>
                    {busy[id] === "disconnecting" ? "Disconnecting…" : "Disconnect"}
                  </button>
                )}
                <button type="button" disabled={isBusy} onClick={() => checkOne(id)} style={{ fontSize: 12 }}>
                  {busy[id] === "checking" ? "Checking…" : "Re-check"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
