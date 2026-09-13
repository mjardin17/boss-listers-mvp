import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getSession, authedFetch } from "../lib/clientAuth";

// Social connections dashboard: honest per-platform status for the 8
// platforms wired into lib/socialMediaAuth.js (Instagram, TikTok,
// YouTube, Facebook, Twitter, LinkedIn, Snapchat, Pinterest). Same rule
// as pages/channels.js — no platform is ever shown "Connected" unless a
// real stored OAuth token exists (see pages/api/social/status.js).
// Nothing here auto-posts or auto-submits anything; this page only shows
// status and lets the user manually kick off an OAuth connect
// (lib/channels/connector.js: "Nothing cross-posts automatically — user
// confirmation required.").

const PLATFORM_ICONS = {
  tiktok: "🎵",
  youtube: "▶️",
  twitter: "𝕏",
  instagram: "📷",
  facebook: "👥",
  linkedin: "💼",
  snapchat: "👻",
  pinterest: "📌",
};

const STATUS_COLORS = {
  connected: "bg-green-100 border-green-300 text-green-900",
  configured: "bg-amber-100 border-amber-300 text-amber-900",
  not_configured: "bg-gray-100 border-gray-300 text-gray-700",
};

function StatusPill({ status }) {
  const labels = {
    connected: "Connected",
    configured: "Configured — Not Connected",
    not_configured: "Not Configured",
  };

  const label = labels[status] || "Unknown";
  const colorClass = STATUS_COLORS[status] || STATUS_COLORS.not_configured;

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${colorClass}`}>
      {status === "connected" && <span className="inline-block mr-1 text-base">✓</span>}
      {label}
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
    const session = getSession();
    if (session?.accessToken) {
      loadStatus();
    }
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Social Media Integrations</p>
              <h1 className="text-3xl font-bold text-gray-900 mt-1">Social Connections</h1>
            </div>
            <nav className="flex gap-4">
              <Link href="/" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Stager
              </Link>
              <Link href="/channels" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Channels
              </Link>
              <Link href="/inventory" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Inventory
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

        <section>
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connect Your Social Accounts</h2>
            <p className="text-gray-600">
              Connect the accounts you want to post to. Each connect click opens that platform&apos;s own login/consent screen — nothing is posted or shared until you approve it there, and this page never posts anything on its own.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-600 text-lg">
                <span className="inline-block animate-pulse">Loading connection status…</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {platforms.map((p) => (
                <div key={p.id} className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                  {/* Header with icon and status */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-3xl">{PLATFORM_ICONS[p.id] || "📱"}</span>
                        <h3 className="text-lg font-bold text-gray-900">{p.label}</h3>
                      </div>
                      <StatusPill status={p.status} />
                    </div>
                  </div>

                  {/* Status Description */}
                  <p className="text-sm text-gray-600 mb-4 min-h-[60px]">
                    {p.status === "connected" && (
                      <>
                        <span className="text-green-700 font-medium">Connected</span>
                        {p.accountIdentifier && <span className="block text-xs text-gray-500 mt-1">Account: {p.accountIdentifier}</span>}
                      </>
                    )}
                    {p.status === "configured" && (
                      <>App credentials are set up, but no account is connected yet.</>
                    )}
                    {p.status === "not_configured" && (
                      <>App credentials for {p.label} are not set in the environment yet.</>
                    )}
                  </p>

                  {p.connectedAt && (
                    <p className="text-xs text-gray-500 mb-4">Connected: {new Date(p.connectedAt).toLocaleDateString()}</p>
                  )}

                  {/* Connect Button */}
                  <button
                    type="button"
                    disabled={!p.configured || connecting === p.id}
                    onClick={() => startConnect(p.id)}
                    title={!p.configured ? `${p.label} app credentials are not configured` : undefined}
                    className={`w-full px-4 py-2 font-medium rounded-lg transition-colors ${
                      !p.configured
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : p.status === "connected"
                          ? "bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                    } ${connecting === p.id ? "opacity-75" : ""}`}
                  >
                    {connecting === p.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="inline-block animate-spin">⟳</span>
                        Connecting…
                      </span>
                    ) : p.status === "connected" ? (
                      "Reconnect Account"
                    ) : p.status === "configured" ? (
                      "Connect Account"
                    ) : (
                      "Not Configured"
                    )}
                  </button>

                  {/* Error Message */}
                  {connectError[p.id] && (
                    <p className="text-xs text-red-600 mt-3 p-2 bg-red-50 rounded">{connectError[p.id]}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Info Box */}
        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">Security & Privacy</h3>
          <p className="text-sm text-blue-800">
            Your account credentials are encrypted and stored securely. We never post on your behalf without explicit confirmation. You control what, when, and where content is published.
          </p>
        </div>
      </main>
    </div>
  );
}
