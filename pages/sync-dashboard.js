// pages/sync-dashboard.js
// Dashboard for monitoring and managing inventory syncs across platforms

import { useEffect, useState } from "react";
import styles from "../styles/sync-dashboard.module.css";

export default function SyncDashboard() {
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [runDetails, setRunDetails] = useState(null);

  // Fetch current sync status
  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/sync/status");
      const data = await response.json();
      if (data.ok) {
        setStatus(data);
        setError(null);
      } else {
        setError(data.error || "Failed to fetch status");
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Fetch sync history
  const fetchHistory = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/sync/history?limit=20&details=true");
      const data = await response.json();
      if (data.ok) {
        setHistory(data.runs || []);
        setError(null);
      } else {
        setError(data.error || "Failed to fetch history");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger a manual sync
  const triggerSync = async () => {
    try {
      setIsSyncing(true);
      setError(null);

      const token = localStorage.getItem("supabase.auth.token");
      const response = await fetch("/api/sync/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
      });

      const data = await response.json();
      if (data.ok) {
        // Refresh status and history
        await fetchStatus();
        await fetchHistory();
      } else {
        setError(data.error || "Sync failed");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Sync a single SKU
  const syncSku = async (sku) => {
    try {
      setIsSyncing(true);
      setError(null);

      const token = localStorage.getItem("supabase.auth.token");
      const response = await fetch(`/api/sync/sku/${sku}/sync-now`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
      });

      const data = await response.json();
      if (data.ok) {
        // Refresh status and history
        await fetchStatus();
        await fetchHistory();
      } else {
        setError(data.error || "Sync failed");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchHistory();
    const interval = setInterval(fetchStatus, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "success":
        return "#10b981"; // green
      case "partial":
        return "#f59e0b"; // amber
      case "failed":
        return "#ef4444"; // red
      case "running":
        return "#3b82f6"; // blue
      default:
        return "#6b7280"; // gray
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Inventory Sync Dashboard</h1>
        <p>Cross-platform inventory synchronization (eBay + Etsy)</p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {/* Configuration Status */}
      {status && (
        <div className={styles.configStatus}>
          <h2>Platform Configuration</h2>
          <div className={styles.platforms}>
            <div className={styles.platform}>
              <div className={styles.platformName}>eBay</div>
              <div
                className={styles.platformBadge}
                style={{
                  backgroundColor: status.isConfigured.ebay ? "#10b981" : "#ef4444",
                }}
              >
                {status.isConfigured.ebay ? "Configured" : "Not Configured"}
              </div>
            </div>
            <div className={styles.platform}>
              <div className={styles.platformName}>Etsy</div>
              <div
                className={styles.platformBadge}
                style={{
                  backgroundColor: status.isConfigured.etsy ? "#10b981" : "#ef4444",
                }}
              >
                {status.isConfigured.etsy ? "Configured" : "Not Configured"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Last Sync Status */}
      {status?.lastSync && (
        <div className={styles.lastSync}>
          <h2>Last Sync</h2>
          <div className={styles.syncInfo}>
            <div className={styles.infoItem}>
              <span className={styles.label}>Status:</span>
              <span
                className={styles.value}
                style={{ color: getStatusColor(status.lastSync.status) }}
              >
                {status.lastSync.status.toUpperCase()}
              </span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Completed:</span>
              <span className={styles.value}>{formatDate(status.lastSync.finished_at || status.lastSync.started_at)}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>SKUs Processed:</span>
              <span className={styles.value}>{status.lastSync.total_skus_checked}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.label}>Quantity Updates:</span>
              <span className={styles.value}>{status.lastSync.quantity_updates}</span>
            </div>
            {status.lastSync.delistings > 0 && (
              <div className={styles.infoItem}>
                <span className={styles.label}>Delistings:</span>
                <span className={styles.value}>{status.lastSync.delistings}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sync Controls */}
      <div className={styles.controls}>
        <button
          className={styles.buttonPrimary}
          onClick={triggerSync}
          disabled={isSyncing}
        >
          {isSyncing ? "Syncing..." : "Trigger Full Sync"}
        </button>
      </div>

      {/* Synced Products */}
      {status?.syncedProducts && status.syncedProducts.length > 0 && (
        <div className={styles.syncedProducts}>
          <h2>Synced Products ({status.syncedProductCount})</h2>
          <div className={styles.productTable}>
            <div className={styles.tableHeader}>
              <div className={styles.columnSku}>SKU</div>
              <div className={styles.columnTitle}>Title</div>
              <div className={styles.columnQty}>Quantity</div>
              <div className={styles.columnActions}>Actions</div>
            </div>
            {status.syncedProducts.map((product) => (
              <div key={product.id} className={styles.tableRow}>
                <div className={styles.columnSku}>{product.sku}</div>
                <div className={styles.columnTitle}>{product.title}</div>
                <div className={styles.columnQty}>{product.quantity}</div>
                <div className={styles.columnActions}>
                  <button
                    className={styles.buttonSmall}
                    onClick={() => syncSku(product.sku)}
                    disabled={isSyncing}
                  >
                    Sync Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync History */}
      <div className={styles.history}>
        <h2>Sync History</h2>
        {isLoading ? (
          <div>Loading...</div>
        ) : history.length === 0 ? (
          <div>No sync runs yet</div>
        ) : (
          <div className={styles.historyList}>
            {history.map((run) => (
              <div key={run.id} className={styles.historyItem}>
                <div className={styles.historyHeader}>
                  <div className={styles.historyTitle}>
                    <span className={styles.runType}>{run.sync_type === "full" ? "Full Sync" : `Single SKU: ${run.target_sku}`}</span>
                    <span
                      className={styles.historyStatus}
                      style={{ backgroundColor: getStatusColor(run.status) }}
                    >
                      {run.status.toUpperCase()}
                    </span>
                  </div>
                  <div className={styles.historyTime}>{formatDate(run.started_at)}</div>
                </div>

                <div className={styles.historyDetails}>
                  <span>SKUs: {run.total_skus_checked}</span>
                  <span>Updates: {run.quantity_updates}</span>
                  {run.delistings > 0 && <span>Delistings: {run.delistings}</span>}
                  {run.error_message && <span className={styles.error}>Error: {run.error_message}</span>}
                </div>

                {run.details && run.details.length > 0 && (
                  <div className={styles.detailsContainer}>
                    <button
                      className={styles.detailsToggle}
                      onClick={() =>
                        setSelectedRunId(selectedRunId === run.id ? null : run.id)
                      }
                    >
                      {selectedRunId === run.id ? "Hide Details" : "Show Details"}
                    </button>

                    {selectedRunId === run.id && (
                      <div className={styles.detailsTable}>
                        <div className={styles.detailsHeader}>
                          <div>SKU</div>
                          <div>eBay</div>
                          <div>Etsy</div>
                          <div>Action</div>
                        </div>
                        {run.details.map((detail, idx) => (
                          <div key={idx} className={styles.detailsRow}>
                            <div>{detail.sku}</div>
                            <div>
                              {detail.ebay_qty_before !== null && (
                                <>
                                  {detail.ebay_qty_before} → {detail.ebay_qty_after}
                                </>
                              )}
                            </div>
                            <div>
                              {detail.etsy_qty_before !== null && (
                                <>
                                  {detail.etsy_qty_before} → {detail.etsy_qty_after}
                                </>
                              )}
                            </div>
                            <div className={styles.actionBadge} style={{ backgroundColor: getStatusColor(detail.action) }}>
                              {detail.action}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
