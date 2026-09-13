"use client";

import { useState, useEffect } from "react";
import styles from "../styles/inventory-dashboard.module.css";

export default function InventoryDashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState([]);
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [message, setMessage] = useState("");

  const loadInventory = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sourceFilter !== "all") params.append("source", sourceFilter);
      if (statusFilter !== "all") params.append("status", statusFilter);

      const res = await fetch(`/api/inventory/list?${params}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch (err) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, [sourceFilter, statusFilter]);

  const handleImportEbay = async () => {
    setImporting(true);
    setMessage("");
    try {
      const res = await fetch("/api/inventory/import-ebay", { method: "POST" });
      const data = await res.json();
      setMessage(`✓ Imported ${data.imported} items from eBay`);
      loadInventory();
    } catch (err) {
      setMessage(`✗ Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleSyncSelected = async () => {
    if (!selected.length) {
      setMessage("Please select items to sync");
      return;
    }

    setSyncing(true);
    setMessage("");
    try {
      const res = await fetch("/api/inventory/sync-to-etsy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus: selected })
      });
      const data = await res.json();
      setMessage(`✓ Synced ${data.synced} items to Etsy`);
      setSelected([]);
      loadInventory();
    } catch (err) {
      setMessage(`✗ Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const toggleSelect = (sku) => {
    setSelected(prev =>
      prev.includes(sku) ? prev.filter(s => s !== sku) : [...prev, sku]
    );
  };

  const toggleSelectAll = () => {
    if (selected.length === items.length) {
      setSelected([]);
    } else {
      setSelected(items.map(item => item.sku));
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>📦 Inventory Dashboard</h1>
          <p>Manage and sync your product listings</p>
        </div>
      </header>

      {message && (
        <div className={`${styles.message} ${message.startsWith("✓") ? styles.success : styles.error}`}>
          {message}
        </div>
      )}

      <div className={styles.controls}>
        <button
          onClick={handleImportEbay}
          disabled={importing}
          className={styles.primaryBtn}
        >
          {importing ? "Importing..." : "📥 Import from eBay"}
        </button>

        <div className={styles.filters}>
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
            <option value="all">All Sources</option>
            <option value="ebay">eBay</option>
            <option value="manual">Manual</option>
          </select>

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="pending">Not Synced</option>
            <option value="synced">Synced</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {selected.length > 0 && (
        <div className={styles.bulkActions}>
          <span>{selected.length} selected</span>
          <button
            onClick={handleSyncSelected}
            disabled={syncing}
            className={styles.syncBtn}
          >
            {syncing ? "Syncing..." : "✓ Sync Selected to Etsy"}
          </button>
        </div>
      )}

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selected.length === items.length && items.length > 0}
                  onChange={toggleSelectAll}
                />
              </th>
              <th>SKU</th>
              <th>Product</th>
              <th>Price</th>
              <th>Qty</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.sku}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.includes(item.sku)}
                    onChange={() => toggleSelect(item.sku)}
                  />
                </td>
                <td className={styles.sku}>{item.sku}</td>
                <td className={styles.title}>{item.title}</td>
                <td>${item.price?.toFixed(2) || "0.00"}</td>
                <td>{item.quantity}</td>
                <td>
                  <span className={`${styles.badge} ${styles[item.source]}`}>
                    {item.source}
                  </span>
                </td>
                <td>
                  <span className={`${styles.status} ${styles[item.sync_status]}`}>
                    {item.sync_status === "synced" && "✓"}
                    {item.sync_status === "failed" && "⚠"}
                    {item.sync_status === "pending" && "○"}
                    {" "}
                    {item.sync_status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && items.length === 0 && (
        <div className={styles.empty}>
          <p>No items found. Click "Import from eBay" to get started!</p>
        </div>
      )}
    </div>
  );
}
