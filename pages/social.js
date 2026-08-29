import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { requireSession, authedFetch } from "../lib/clientAuth";

// Social connections dashboard: honest per-platform status for the 8
// platforms wired into lib/socialMediaAuth.js (Instagram, TikTok,
// YouTube, Facebook, Twitter, LinkedIn, Snapchat, Pinterest). Same rule
// as pages/channels.js — no platform is ever shown "Connected" unless a
// real stored OAuth token exists (see pages/api/social/status.js).
// Nothing here auto-posts or auto-submits anything; this page only shows
// status and lets the user manually kick off an OAuth connect
// (lib/channels/connector.js: "Nothing cross-posts automatically — user
// confirmation required.").

const STATUS_META = {
  connected: { label: "Connected", color: "#16a34a" },
  configured: { label: "Configured — not connected", color: "#d97706" },
  not_configured: { label: "Not configured", color: "#6b7280" },
};

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.not_configured;
  return (
    <span style={{
      background: meta.color, color: "#fff", borderRadius: 999,
      padding: "2px 10px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
    }}>
      {meta.label}
    </span>
  );
}

export default function SocialConnectionsPage() {
  const [platforms, setPlatforms] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState("");
  const [connectError, setConnectError] = useState({});

  const loadStatus = useCallback(async () => {
    setError("");
    try {
      const res = await authedFetch("/api/social/status");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Failed to load status");
      setPlatforms(data.platforms);
    } catch (err) {
      setError(`Could not load social connection status: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!requireSession()) return;
    loadStatus();
  }, [loadStatus]);

  // Kicks off OAuth for one platform. This has to be a click handler (not
  // a plain <a href>) because pages/api/oauth/authorize.js requires the
  // caller's session bearer token and returns JSON, not a redirect — the
  // browser can't attach that header via a normal navigation.
  async function startConnect(platformId) {
    setConnecting(platformId);
    setConnectError((prev) => ({ ...prev, [platformId]: "" }));
    try {
      const res = await authedFetch(`/api/oauth/authorize?platform=${encodeURIComponent(platformId)}`);
      const data = await res.json();
      if (!data.ok || !data.authUrl) {
        throw new Error(data.error || "Could not start the connect flow");
      }
      window.location.href = data.authUrl;
    } catch (err) {
      setConnectError((prev) => ({ ...prev, [platformId]: err.message }));
      setConnecting("");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Boss Listers</p>
          <h1>Social Connections</h1>
        </div>
        <nav>
          <Link className="nav-link" href="/">Stager</Link>
          <Link className="nav-link" href="/channels">Channels</Link>
          <Link className="nav-link" href="/history">History</Link>
        </nav>
      </header>

      {error && <p style={{ color: "#dc2626" }}>{error}</p>}

      <section>
        <h2 className="section-heading">Connect your social accounts</h2>
        <p className="panel-sub">
          Connect the accounts you want to post to. Each connect click opens that
          platform&apos;s own login/consent screen — nothing is posted or shared until
          you approve it there, and this page never posts anything on its own.
        </p>

        {loading ? (
          <p className="panel-sub">Loading connection status…</p>
        ) : (
          <div className="platform-grid">
            {platforms.map((p) => (
              <div key={p.id} className="panel" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <strong>{p.label}</strong>
                  <StatusPill status={p.status} />
                </div>

                <p style={{ fontSize: 13, color: "#4b5563", minHeight: 40 }}>
                  {p.status === "connected" && (
                    <>Connected{p.accountIdentifier ? ` as ${p.accountIdentifier}` : ""}.</>
                  )}
                  {p.status === "configured" && (
                    <>App credentials are set up, but no account is connected yet.</>
                  )}
                  {p.status === "not_configured" && (
                    <>App credentials for {p.label} are not set in the environment yet.</>
                  )}
                </p>

                <button
                  type="button"
                  disabled={!p.configured || connecting === p.id}
                  onClick={() => startConnect(p.id)}
                  title={!p.configured ? `${p.label} app credentials are not configured` : undefined}
                >
                  {connecting === p.id
                    ? "Connecting…"
                    : p.status === "connected"
                      ? "Reconnect"
                      : "Connect"}
                </button>

                {connectError[p.id] && (
                  <p style={{ fontSize: 12, marginTop: 6, color: "#dc2626" }}>{connectError[p.id]}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
