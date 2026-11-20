import { useCallback, useEffect, useRef, useState } from "react";
import { authedFetch } from "../lib/clientAuth";

const CSS = `
.sa-panel{border:1px solid #26354a;border-radius:14px;background:#101927;color:#f1e9d6;overflow:hidden}
.sa-head{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:16px 18px;border-bottom:1px solid #1f2a3b}
.sa-head h2{margin:0;font-size:16px;font-weight:650}
.sa-head p{margin:4px 0 0;color:#8e9db3;font-size:12px}
.sa-count{display:inline-grid;place-items:center;min-width:28px;height:28px;padding:0 8px;border-radius:99px;background:#4a3218;color:#f4c16b;font-size:12px;font-weight:700}
.sa-settings{display:flex;align-items:end;gap:12px;flex-wrap:wrap;padding:14px 18px;background:#0d1521;border-bottom:1px solid #1f2a3b}
.sa-field{display:grid;gap:5px;color:#9eacc0;font-size:11px;font-weight:650}
.sa-field input[type=number]{width:90px;padding:8px 9px;border:1px solid #33425a;border-radius:8px;background:#0c121c;color:#f1e9d6;font:inherit;font-size:13px}
.sa-email{display:flex;align-items:center;gap:7px;color:#c9d2e0;font-size:12px}
.sa-email input{accent-color:#e0a84a}
.sa-btn{border:1px solid #33425a;border-radius:8px;padding:7px 10px;background:transparent;color:#c9d2e0;font-size:12px;font-weight:600;cursor:pointer}
.sa-btn.primary{background:#e0a84a;color:#1b1407;border-color:#e0a84a}
.sa-btn:disabled{opacity:.45;cursor:not-allowed}
.sa-hint{width:100%;margin:0;color:#71839d;font-size:11px}
.sa-tabs{display:flex;gap:6px;padding:12px 18px 0}
.sa-tab{border:1px solid #26354a;border-radius:8px 8px 0 0;padding:8px 12px;background:#0c121c;color:#9eacc0;font-size:12px;cursor:pointer}
.sa-tab[aria-pressed=true]{background:#182235;border-color:#e0a84a;color:#f1e9d6}
.sa-list{padding:4px 18px 14px}
.sa-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #1b2738}
.sa-row:last-child{border-bottom:0}
.sa-item{min-width:0}
.sa-title{font-size:13px;font-weight:650;overflow-wrap:anywhere}
.sa-meta{margin-top:3px;color:#8e9db3;font-size:11px}
.sa-qty{flex-shrink:0;color:#f4c16b;font-size:12px;font-weight:700}
.sa-qty.out{color:#f08c82}
.sa-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.sa-empty,.sa-error{padding:18px 0;color:#8e9db3;font-size:12px}
.sa-error{color:#f08c82}
@media(max-width:650px){.sa-settings{align-items:stretch}.sa-row{align-items:flex-start;flex-direction:column}.sa-head,.sa-settings,.sa-list{padding-left:13px;padding-right:13px}}
`;

async function api(path, options) {
  const response = await authedFetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}

const timeLabel = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
};

export default function StockAlertsPanel() {
  const [alerts, setAlerts] = useState([]);
  const [settings, setSettings] = useState({ threshold: 2, email_enabled: false });
  const [thresholdInput, setThresholdInput] = useState("2");
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [tab, setTab] = useState("open");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const emailAttempted = useRef(false);

  const refresh = useCallback(async () => {
    const [alertData, settingsData] = await Promise.all([
      api("/api/stock-alerts"),
      api("/api/stock-alert-settings"),
    ]);
    setAlerts(alertData.alerts || []);
    setSettings(settingsData.settings || { threshold: 2, email_enabled: false });
    setThresholdInput(String(settingsData.settings?.threshold ?? 2));
    setEmailAvailable(Boolean(settingsData.emailAvailable));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([api("/api/stock-alerts"), api("/api/stock-alert-settings")])
      .then(([alertData, settingsData]) => {
        if (!active) return;
        setAlerts(alertData.alerts || []);
        setSettings(settingsData.settings || { threshold: 2, email_enabled: false });
        setThresholdInput(String(settingsData.settings?.threshold ?? 2));
        setEmailAvailable(Boolean(settingsData.emailAvailable));
      })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!settings.email_enabled || !emailAvailable || emailAttempted.current) return;
    emailAttempted.current = true;
    api("/api/stock-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send_pending_email" }),
    }).catch((err) => console.error("[StockAlertsPanel] pending email delivery:", err.message));
  }, [settings.email_enabled, emailAvailable]);

  const act = async (action, alert) => {
    setBusyId(alert?.id || action);
    setError("");
    try {
      await api("/api/stock-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(alert ? { id: alert.id } : {}) }),
      });
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  };

  const saveSettings = async () => {
    const threshold = Number(thresholdInput);
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 10000) {
      setError("Enter a whole-number threshold from 0 to 10,000.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await api("/api/stock-alert-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold, email_enabled: Boolean(settings.email_enabled) }),
      });
      setSettings(result.settings);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const unread = alerts.filter((a) => a.status !== "archived" && !a.is_read).length;
  const visible = alerts.filter((a) => a.status === tab);
  const tabs = [
    { id: "open", label: "Inbox" },
    { id: "restocked", label: "Restocked" },
    { id: "archived", label: "Archived" },
  ];

  return (
    <section className="sa-panel" aria-label="Low stock alerts">
      <style>{CSS}</style>
      <header className="sa-head">
        <div>
          <h2>Stock alerts</h2>
          <p>One alert per item per low-stock cycle. Restocks are recorded automatically.</p>
        </div>
        <span className="sa-count" aria-label={`${unread} unread alerts`}>{unread} unread</span>
      </header>

      <div className="sa-settings">
        <label className="sa-field">
          Alert when quantity is at or below
          <input type="number" min="0" max="10000" step="1" value={thresholdInput}
            onChange={(event) => setThresholdInput(event.target.value)} />
        </label>
        <label className="sa-email">
          <input type="checkbox" checked={Boolean(settings.email_enabled)}
            disabled={!emailAvailable}
            onChange={(event) => setSettings((current) => ({ ...current, email_enabled: event.target.checked }))} />
          Email me too
        </label>
        <button type="button" className="sa-btn primary" onClick={saveSettings} disabled={saving || loading}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {!emailAvailable && <p className="sa-hint">Email alerts are optional. Configure RESEND_API_KEY and STOCK_ALERT_FROM_EMAIL on the server to enable them.</p>}
      </div>

      <nav className="sa-tabs" role="tablist" aria-label="Alert folders">
        {tabs.map((item) => (
          <button key={item.id} type="button" className="sa-tab" role="tab"
            aria-selected={tab === item.id} aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}>{item.label}</button>
        ))}
      </nav>

      <div className="sa-list">
        {error && <p className="sa-error" role="alert">{error}</p>}
        {loading ? <p className="sa-empty">Loading alerts…</p> :
          visible.length === 0 ? <p className="sa-empty">
            {tab === "open" ? "No low-stock alerts. Inventory is above your threshold." :
              tab === "restocked" ? "Restocked items will appear here." : "Archived alerts will appear here."}
          </p> :
          visible.map((alert) => (
            <article className="sa-row" key={alert.id}>
              <div className="sa-item">
                <div className="sa-title">{alert.product_title}</div>
                <div className="sa-meta">{alert.sku} · Threshold {alert.threshold} · {timeLabel(alert.created_at)}</div>
                <div className="sa-actions">
                  {tab !== "archived" && (
                    <button type="button" className="sa-btn" disabled={busyId === alert.id}
                      onClick={() => act(alert.is_read ? "mark_unread" : "mark_read", alert)}>
                      {alert.is_read ? "Mark unread" : "Mark read"}
                    </button>
                  )}
                  {tab === "archived" ? (
                    <button type="button" className="sa-btn" disabled={busyId === alert.id}
                      onClick={() => act("restore", alert)}>Restore</button>
                  ) : (
                    <button type="button" className="sa-btn" disabled={busyId === alert.id}
                      onClick={() => act("archive", alert)}>Archive</button>
                  )}
                </div>
              </div>
              <span className={`sa-qty ${Number(alert.quantity) === 0 ? "out" : ""}`}>
                {Number(alert.quantity) === 0 ? "OUT OF STOCK" : `${alert.quantity} left`}
              </span>
            </article>
          ))
        }
        {tab === "open" && visible.some((a) => a.is_read) && (
          <div className="sa-actions">
            <button type="button" className="sa-btn" onClick={() => act("clear_read")} disabled={Boolean(busyId)}>Archive read alerts</button>
          </div>
        )}
        {tab !== "archived" && unread > 0 && (
          <div className="sa-actions">
            <button type="button" className="sa-btn" onClick={() => act("mark_all_read")} disabled={Boolean(busyId)}>Mark all read</button>
          </div>
        )}
      </div>
    </section>
  );
}
