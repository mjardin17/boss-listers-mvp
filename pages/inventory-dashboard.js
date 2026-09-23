// pages/inventory-dashboard.js
// Inventory management dashboard for eBay import and manual sync to Etsy

import { useState, useEffect } from "react";
import styles from "../styles/inventory-dashboard.module.css";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export default function InventoryDashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [filter, setFilter] = useState({ source: "all", syncStatus: "all" });
  const [notification, setNotification] = useState(null);
  const [syncingSkus, setSyncingSkus] = useState(new Set());

  // Load inventory on mount
  useEffect(() => {
    loadInventory();
  }, [filter]);

  async function loadInventory() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.source !== "all") params.append("source", filter.source);
      if (filter.syncStatus !== "all") params.append("syncStatus", filter.syncStatus);

      const res = await fetch(`${API_BASE}/api/inventory/list?${params}`);
      const data = await res.json();

      if (data.ok) {
        setItems(data.items || []);
      } else {
        showNotification(`Error loading inventory: ${data.error}`, "error");
      }
    } catch (err) {
      showNotification(`Failed to load inventory: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  }

  function showNotification(message, type = "info") {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  }

  async function handleImportEbay() {
    setImporting(true);
    try {
      const res = await fetch(`${API_BASE}/api/inventory/import-ebay`, { method: "POST" });
      const data = await res.json();

      if (data.ok) {
        showNotification(
          `Imported ${data.imported} items from eBay${data.failed > 0 ? ` (${data.failed} failed)` : ""}`,
          "success"
        );
        await loadInventory();
      } else {
        showNotification(`Import failed: ${data.error}`, "error");
      }
    } catch (err) {
      showNotification(`Import error: ${err.message}`, "error");
    } finally {
      setImporting(false);
    }
  }

  async function handleSyncOne(sku) {
    setSyncingSkus((prev) => new Set(prev).add(sku));
    try {
      const res = await fetch(`${API_BASE}/api/inventory/sync-to-etsy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku }),
      });
      const data = await res.json();

      if (data.ok && data.synced > 0) {
        showNotification(`Synced to Etsy successfully`, "success");
        await loadInventory();
      } else if (data.results && data.results[0]) {
        showNotification(`Sync failed: ${data.results[0].error}`, "error");
      } else {
        showNotification(`Sync failed: ${data.error}`, "error");
      }
    } catch (err) {
      showNotification(`Sync error: ${err.message}`, "error");
    } finally {
      setSyncingSkus((prev) => {
        const next = new Set(prev);
        next.delete(sku);
        return next;
      });
    }
  }

  async function handleBulkSync() {
    if (selected.size === 0) {
      showNotification("Please select items to sync", "error");
      return;
    }

    const skus = Array.from(selected);
    setSyncingSkus((prev) => new Set([...prev, ...skus]));

    try {
      const res = await fetch(`${API_BASE}/api/inventory/bulk-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus, platforms: ["etsy"] }),
      });
      const data = await res.json();

      if (data.ok && data.synced > 0) {
        showNotification(`Synced ${data.synced} items to Etsy`, "success");
        setSelected(new Set());
        await loadInventory();
      } else {
        showNotification(`Bulk sync failed: ${data.error || "unknown error"}`, "error");
      }
    } catch (err) {
      showNotification(`Bulk sync error: ${err.message}`, "error");
    } finally {
      setSyncingSkus((prev) => {
        const next = new Set(prev);
        skus.forEach((sku) => next.delete(sku));
        return next;
      });
    }
  }

  function toggleSelect(sku) {
    const next = new Set(selected);
    if (next.has(sku)) {
      next.delete(sku);
    } else {
      next.add(sku);
    }
    setSelected(next);
  }

  function toggleSelectAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((item) => item.sku)));
    }
  }

  const displayItems = items;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Inventory Management</h1>
        <p>Import eBay listings and sync to Etsy</p>
      </header>

      {notification && (
        <div className={`${styles.notification} ${styles[`notification-${notification.type}`]}`}>
          {notification.message}
        </div>
      )}

      <div className={styles.controls}>
        <div className={styles.actions}>
          <button
            className={styles.buttonPrimary}
            onClick={handleImportEbay}
            disabled={importing}
          >
            {importing ? "Importing..." : "📥 Import from eBay"}
          </button>

          {selected.size > 0 && (
            <button
              className={styles.buttonSecondary}
              onClick={handleBulkSync}
              disabled={syncingSkus.size > 0}
            >
              {syncingSkus.size > 0
                ? `Syncing... (${selected.size})`
                : `✓ Sync ${selected.size} to Etsy`}
            </button>
          )}
        </div>

        <div className={styles.filters}>
          <select
            value={filter.source}
            onChange={(e) => setFilter({ ...filter, source: e.target.value })}
            className={styles.select}
          >
            <option value="all">All Sources</option>
            <option value="ebay">eBay Only</option>
            <option value="manual">Manual Only</option>
          </select>

          <select
            value={filter.syncStatus}
            onChange={(e) => setFilter({ ...filter, syncStatus: e.target.value })}
            className={styles.select}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Not Synced</option>
            <option value="synced">Synced</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.checkboxCell}>
                <input
                  type="checkbox"
                  checked={selected.size === displayItems.length && displayItems.length > 0}
                  onChange={toggleSelectAll}
                  disabled={displayItems.length === 0}
                />
              </th>
              <th>Product</th>
              <th className={styles.priceCell}>Price</th>
              <th className={styles.qtyCell}>Qty</th>
              <th>Source</th>
              <th>Sync Status</th>
              <th className={styles.actionsCell}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayItems.length === 0 ? (
              <tr>
                <td colSpan="7" className={styles.emptyState}>
                  {loading ? "Loading..." : "No items found"}
                </td>
              </tr>
            ) : (
              displayItems.map((item) => (
                <tr key={item.sku}>
                  <td className={styles.checkboxCell}>
                    <input
                      type="checkbox"
                      checked={selected.has(item.sku)}
                      onChange={() => toggleSelect(item.sku)}
                    />
                  </td>
                  <td>
                    <div className={styles.productCell}>
                      {item.imageUrl && (
                        <img src={item.imageUrl} alt={item.title} className={styles.thumbnail} />
                      )}
                      <div>
                        <div className={styles.productTitle}>{item.title}</div>
                        <div className={styles.productSku}>{item.sku}</div>
                      </div>
                    </div>
                  </td>
                  <td className={styles.priceCell}>${item.price.toFixed(2)}</td>
                  <td className={styles.qtyCell}>{item.quantity}</td>
                  <td>
                    <span className={`${styles.badge} ${styles[`badge-${item.source}`]}`}>
                      {item.source}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.statusBadge} ${styles[`status-${item.syncStatus}`]}`}
                    >
                      {item.syncStatus === "pending"
                        ? "Not Synced"
                        : item.syncStatus === "synced"
                        ? `✓ Synced (${item.syncedTo.join(", ")})`
                        : "⚠ Failed"}
                    </span>
                  </td>
                  <td className={styles.actionsCell}>
                    {item.syncStatus !== "synced" && (
                      <button
                        className={styles.buttonSmall}
                        onClick={() => handleSyncOne(item.sku)}
                        disabled={syncingSkus.has(item.sku)}
                      >
                        {syncingSkus.has(item.sku) ? "..." : "Sync"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className={styles.footer}>
        <div>
          Total: {items.length} items
          {filter.source !== "all" && ` (${filter.source})`}
          {filter.syncStatus !== "all" && ` • Status: ${filter.syncStatus}`}
        </div>
      </footer>
    </div>
  );
}
