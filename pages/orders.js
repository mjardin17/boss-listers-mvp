"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "../lib/clientAuth";

const STATUS_BADGES = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-blue-100 text-blue-800",
  shipped: "bg-green-100 text-green-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  refunded: "bg-red-100 text-red-800",
};

const MARKETPLACE_ICONS = {
  ebay: "🏪",
  etsy: "🧵",
  amazon: "🔶",
  tiktok_shop: "🎵",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [marketplaceFilter, setMarketplaceFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("USPS");
  const [updating, setUpdating] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: 25,
        ...(statusFilter && { status: statusFilter }),
        ...(marketplaceFilter && { marketplace: marketplaceFilter }),
        ...(search && { search }),
      });

      const res = await authedFetch(`/api/orders?${params}`);
      const data = await res.json();

      if (data.ok) {
        setOrders(data.orders || []);
        setTotalPages(data.pages || 1);
      }
    } catch (err) {
      console.error("Error loading orders:", err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, marketplaceFilter, search]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  async function handleMarkShipped() {
    if (!selectedOrder || !tracking || !carrier) {
      alert("Please fill in tracking number and carrier");
      return;
    }

    setUpdating(true);
    try {
      const res = await authedFetch(`/api/orders/${selectedOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_status: "shipped",
          tracking_number: tracking,
          carrier,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setSelectedOrder(data.order);
        setTracking("");
        loadOrders();
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Boss Listers</p>
          <h1>Orders</h1>
        </div>
        <nav>
          <Link className="nav-link" href="/inventory">
            Inventory
          </Link>
          <Link className="nav-link" href="/channels">
            Channels
          </Link>
        </nav>
      </header>

      <section style={{ padding: "20px" }}>
        <div style={{ marginBottom: "20px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search by buyer name, email, or order ID"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{
              padding: "8px 12px",
              border: "1px solid #ddd",
              borderRadius: "6px",
              flex: 1,
              minWidth: "200px",
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px" }}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={marketplaceFilter}
            onChange={(e) => {
              setMarketplaceFilter(e.target.value);
              setPage(1);
            }}
            style={{ padding: "8px 12px", border: "1px solid #ddd", borderRadius: "6px" }}
          >
            <option value="">All Platforms</option>
            <option value="ebay">eBay</option>
            <option value="etsy">Etsy</option>
            <option value="amazon">Amazon</option>
            <option value="tiktok_shop">TikTok Shop</option>
          </select>
        </div>

        {loading ? (
          <p>Loading orders...</p>
        ) : orders.length === 0 ? (
          <p style={{ color: "#999" }}>No orders found</p>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #ddd" }}>
                  <th style={{ textAlign: "left", padding: "12px", fontWeight: "600" }}>
                    Order ID
                  </th>
                  <th style={{ textAlign: "left", padding: "12px", fontWeight: "600" }}>Buyer</th>
                  <th style={{ textAlign: "left", padding: "12px", fontWeight: "600" }}>
                    Platform
                  </th>
                  <th style={{ textAlign: "left", padding: "12px", fontWeight: "600" }}>Total</th>
                  <th style={{ textAlign: "left", padding: "12px", fontWeight: "600" }}>Status</th>
                  <th style={{ textAlign: "left", padding: "12px", fontWeight: "600" }}>Date</th>
                  <th style={{ textAlign: "left", padding: "12px", fontWeight: "600" }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "12px", fontFamily: "monospace", fontSize: "12px" }}>
                      {order.marketplace_order_id}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <div style={{ fontSize: "14px" }}>{order.buyer_name}</div>
                      <div style={{ fontSize: "12px", color: "#666" }}>{order.buyer_email}</div>
                    </td>
                    <td style={{ padding: "12px", fontSize: "18px" }}>
                      {MARKETPLACE_ICONS[order.marketplace]} {order.marketplace}
                    </td>
                    <td style={{ padding: "12px", fontWeight: "600" }}>
                      ${order.total_price?.toFixed(2) || "0.00"}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "600",
                          ...getStatusStyle(order.order_status),
                        }}
                      >
                        {order.order_status}
                      </span>
                    </td>
                    <td style={{ padding: "12px", fontSize: "12px", color: "#666" }}>
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <button
                        type="button"
                        onClick={() => setSelectedOrder(order)}
                        style={{
                          padding: "6px 12px",
                          fontSize: "12px",
                          backgroundColor: "#0066cc",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                        }}
                      >
                        {order.order_status === "shipped" ? "View" : "Ship"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: "20px", display: "flex", gap: "8px", justifyContent: "center" }}>
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                style={{
                  padding: "8px 12px",
                  cursor: page === 1 ? "not-allowed" : "pointer",
                  opacity: page === 1 ? 0.5 : 1,
                }}
              >
                ← Prev
              </button>
              <span style={{ padding: "8px 12px" }}>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                style={{
                  padding: "8px 12px",
                  cursor: page === totalPages ? "not-allowed" : "pointer",
                  opacity: page === totalPages ? 0.5 : 1,
                }}
              >
                Next →
              </button>
            </div>
          </>
        )}
      </section>

      {/* Ship Order Modal */}
      {selectedOrder && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setSelectedOrder(null)}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "500px",
              width: "90%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Order {selectedOrder.marketplace_order_id}</h2>

            <div style={{ marginTop: "20px" }}>
              <p>
                <strong>Buyer:</strong> {selectedOrder.buyer_name}
              </p>
              <p>
                <strong>Status:</strong> {selectedOrder.order_status}
              </p>
              <p>
                <strong>Total:</strong> ${selectedOrder.total_price?.toFixed(2)}
              </p>

              {selectedOrder.order_items && selectedOrder.order_items.length > 0 && (
                <div style={{ marginTop: "12px" }}>
                  <strong>Items:</strong>
                  <ul style={{ fontSize: "14px", color: "#666", marginTop: "8px" }}>
                    {selectedOrder.order_items.map((item) => (
                      <li key={item.id}>
                        {item.quantity}x {item.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {selectedOrder.order_status !== "shipped" && (
              <div style={{ marginTop: "24px", borderTop: "1px solid #eee", paddingTop: "16px" }}>
                <h3 style={{ marginBottom: "12px" }}>Mark as Shipped</h3>
                <input
                  type="text"
                  placeholder="Tracking number"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px",
                    marginBottom: "12px",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                />
                <select
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px",
                    marginBottom: "12px",
                    border: "1px solid #ddd",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="USPS">USPS</option>
                  <option value="UPS">UPS</option>
                  <option value="FedEx">FedEx</option>
                  <option value="Other">Other</option>
                </select>
                <button
                  onClick={handleMarkShipped}
                  disabled={updating}
                  style={{
                    width: "100%",
                    padding: "10px",
                    backgroundColor: "#16a34a",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: updating ? "not-allowed" : "pointer",
                    fontWeight: "600",
                  }}
                >
                  {updating ? "Updating..." : "Mark as Shipped"}
                </button>
              </div>
            )}

            {selectedOrder.order_status === "shipped" && (
              <div style={{ marginTop: "24px", borderTop: "1px solid #eee", paddingTop: "16px" }}>
                <p>
                  <strong>Tracking Number:</strong> {selectedOrder.tracking_number}
                </p>
                <p>
                  <strong>Carrier:</strong> {selectedOrder.carrier}
                </p>
                <p>
                  <strong>Shipped:</strong>{" "}
                  {new Date(selectedOrder.shipped_at).toLocaleString()}
                </p>
              </div>
            )}

            <button
              onClick={() => setSelectedOrder(null)}
              style={{
                width: "100%",
                marginTop: "16px",
                padding: "10px",
                backgroundColor: "#f0f0f0",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function getStatusStyle(status) {
  const styles = {
    pending: { backgroundColor: "#fef08a", color: "#854d0e" },
    paid: { backgroundColor: "#dbeafe", color: "#0c4a6e" },
    shipped: { backgroundColor: "#dcfce7", color: "#166534" },
    delivered: { backgroundColor: "#dcfce7", color: "#166534" },
    cancelled: { backgroundColor: "#fee2e2", color: "#7f1d1d" },
    refunded: { backgroundColor: "#fee2e2", color: "#7f1d1d" },
  };
  return styles[status] || styles.pending;
}
