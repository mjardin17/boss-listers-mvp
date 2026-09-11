/**
 * Inventory Sync Dashboard Component
 * Displays eBay sync status, last sync time, inventory counts by marketplace
 */

import React, { useEffect, useState } from "react";
import { Clock, RefreshCw, AlertCircle, CheckCircle, TrendingUp } from "lucide-react";

interface SyncStatus {
  lastSync: {
    startedAt: string;
    finishedAt: string;
    status: "success" | "partial" | "failed";
    itemsSeen: number;
    itemsUpserted: number;
    itemsCreated: number;
    itemsUpdated: number;
    minutesSinceSync: number;
    errors: Array<{ sku?: string; error: string }>;
  } | null;
  marketplaceInventoryCounts: Record<string, number>;
  syncHistory: Array<{
    startedAt: string;
    finishedAt: string;
    status: string;
    itemsUpserted: number;
    itemsCreated: number;
    itemsUpdated: number;
  }>;
  isLoading: boolean;
  error?: string;
}

export const InventorySyncDashboard: React.FC = () => {
  const [status, setStatus] = useState<SyncStatus>({
    lastSync: null,
    marketplaceInventoryCounts: {},
    syncHistory: [],
    isLoading: true,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  // Fetch sync status on mount and every 30 seconds
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/inventory/ebay-sync-status");
        if (!res.ok) throw new Error("Failed to fetch sync status");
        const data = await res.json();
        setStatus({ ...data, isLoading: false });
      } catch (err) {
        setStatus((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : "Unknown error",
        }));
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncMessage("");

    try {
      const res = await fetch("/api/inventory/sync-ebay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trigger: "manual" }),
      });

      if (!res.ok) throw new Error("Sync failed");

      const data = await res.json();
      setSyncMessage(
        `Synced successfully: ${data.created} new, ${data.updated} updated`
      );

      // Refresh status
      const statusRes = await fetch("/api/inventory/ebay-sync-status");
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus({ ...statusData, isLoading: false });
      }
    } catch (err) {
      setSyncMessage(
        `Sync failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setIsSyncing(false);
    }
  };

  if (status.isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin">
          <RefreshCw className="w-6 h-6 text-gray-400" />
        </div>
      </div>
    );
  }

  const totalProducts = Object.values(status.marketplaceInventoryCounts).reduce(
    (sum, count) => sum + count,
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">eBay Inventory Sync</h2>
          <p className="text-gray-600 text-sm mt-1">
            Automatic sync every 15 minutes via scheduled job
          </p>
        </div>
        <button
          onClick={handleSyncNow}
          disabled={isSyncing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing..." : "Sync Now"}
        </button>
      </div>

      {/* Status Message */}
      {syncMessage && (
        <div
          className={`p-4 rounded-lg flex items-center gap-2 ${
            syncMessage.includes("failed")
              ? "bg-red-50 text-red-800 border border-red-200"
              : "bg-green-50 text-green-800 border border-green-200"
          }`}
        >
          {syncMessage.includes("failed") ? (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          )}
          {syncMessage}
        </div>
      )}

      {/* Last Sync Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Last Sync</h3>
          {status.lastSync && (
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                status.lastSync.status === "success"
                  ? "bg-green-100 text-green-800"
                  : status.lastSync.status === "partial"
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {status.lastSync.status.toUpperCase()}
            </span>
          )}
        </div>

        {status.lastSync ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="w-4 h-4" />
              <span>
                {status.lastSync.minutesSinceSync} minutes ago
                ({new Date(status.lastSync.startedAt).toLocaleTimeString()})
              </span>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-2xl font-bold text-gray-900">
                  {status.lastSync.itemsCreated}
                </div>
                <div className="text-xs text-gray-600">Created</div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-2xl font-bold text-gray-900">
                  {status.lastSync.itemsUpdated}
                </div>
                <div className="text-xs text-gray-600">Updated</div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-2xl font-bold text-gray-900">
                  {status.lastSync.itemsSeen}
                </div>
                <div className="text-xs text-gray-600">Total Seen</div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-2xl font-bold text-gray-900">
                  {status.lastSync.errors.length}
                </div>
                <div className="text-xs text-gray-600">Errors</div>
              </div>
            </div>

            {/* Errors */}
            {status.lastSync.errors.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-sm font-medium text-red-800 mb-2">
                  Errors ({status.lastSync.errors.length})
                </h4>
                <ul className="space-y-1 text-sm">
                  {status.lastSync.errors.slice(0, 3).map((err, i) => (
                    <li key={i} className="text-red-700">
                      {err.sku ? `${err.sku}: ` : ""}
                      {err.error}
                    </li>
                  ))}
                  {status.lastSync.errors.length > 3 && (
                    <li className="text-red-600 italic">
                      ... and {status.lastSync.errors.length - 3} more
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No sync history yet</p>
        )}
      </div>

      {/* Inventory Counts by Marketplace */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Inventory by Marketplace</h3>
          <TrendingUp className="w-5 h-5 text-gray-400" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="text-3xl font-bold text-blue-900">
              {status.marketplaceInventoryCounts.ebay || 0}
            </div>
            <div className="text-sm text-blue-700">eBay Products</div>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
            <div className="text-3xl font-bold text-orange-900">
              {status.marketplaceInventoryCounts.etsy || 0}
            </div>
            <div className="text-sm text-orange-700">Etsy Products</div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
            <div className="text-3xl font-bold text-purple-900">
              {totalProducts}
            </div>
            <div className="text-sm text-purple-700">Total Products</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="text-3xl font-bold text-gray-900">
              {Object.keys(status.marketplaceInventoryCounts).length}
            </div>
            <div className="text-sm text-gray-700">Marketplaces</div>
          </div>
        </div>
      </div>

      {/* Recent Sync History */}
      {status.syncHistory.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Recent Sync History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">
                    Time
                  </th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">
                    Status
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">
                    Created
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">
                    Updated
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {status.syncHistory.map((log, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-3 text-gray-900">
                      {new Date(log.startedAt).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          log.status === "success"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-gray-900">
                      {log.itemsCreated}
                    </td>
                    <td className="py-3 px-3 text-right text-gray-900">
                      {log.itemsUpdated}
                    </td>
                    <td className="py-3 px-3 text-right text-gray-900 font-medium">
                      {log.itemsUpserted}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Error State */}
      {status.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-red-900">Error Loading Status</h4>
            <p className="text-sm text-red-700 mt-1">{status.error}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventorySyncDashboard;
