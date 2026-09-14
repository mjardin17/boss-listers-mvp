"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getSession, authedFetch } from "../lib/clientAuth";
import PostToPlatformsDialog from "../components/PostToPlatformsDialog";

/**
 * Comprehensive inventory management page for BossListers.
 *
 * Features:
 * - Table display of all products (SKU, title, price, quantity, last_updated)
 * - Add/edit/delete product operations
 * - Search and filter by SKU or title
 * - Pagination for large inventories (1000+ products)
 * - Marketplace listing visibility (which products are on eBay, Etsy, etc.)
 * - Post to All Platforms (eBay, Etsy, Amazon, TikTok Shop)
 * - Bulk actions for marketplace sync
 */

const MARKETPLACE_ICONS = {
  ebay: "🏪",
  etsy: "🧵",
  amazon: "🔶",
  facebook: "👥",
  tiktok_shop: "🎵",
  manual: "📝",
};

const MARKETPLACE_NAMES = {
  ebay: "eBay",
  etsy: "Etsy",
  amazon: "Amazon",
  facebook: "Facebook",
  tiktok_shop: "TikTok Shop",
  manual: "Manual",
};

export default function InventoryPage() {
  // Data state
  const [products, setProducts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Search & filter
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    sku: "",
    title: "",
    description: "",
    price: "",
    quantity: "",
  });

  // Bulk selection
  const [selected, setSelected] = useState(new Set());

  // Post to platforms dialog
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [postDialogProduct, setPostDialogProduct] = useState(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to first page on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load products
  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: currentPage,
        limit: pageSize,
      });

      if (debouncedSearch.trim()) {
        params.append("search", debouncedSearch.trim());
      }

      const res = await authedFetch(`/api/inventory?${params}`);
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to load products");
      }

      setProducts(data.products || []);
      setTotalCount(data.total || 0);
    } catch (err) {
      setError(err.message);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch]);

  useEffect(() => {
    const session = getSession();
    if (session?.accessToken) {
      loadProducts();
    }
  }, [loadProducts]);

  // Form handlers
  const resetForm = () => {
    setFormData({
      sku: "",
      title: "",
      description: "",
      price: "",
      quantity: "",
    });
    setEditingId(null);
  };

  const handleAddClick = () => {
    resetForm();
    setShowAddForm(true);
  };

  const handleEditClick = (product) => {
    setFormData({
      sku: product.sku,
      title: product.title,
      description: product.description || "",
      price: product.price?.toString() || "",
      quantity: product.quantity?.toString() || "",
    });
    setEditingId(product.sku);
    setShowAddForm(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.sku.trim()) {
      setError("SKU is required");
      return;
    }
    if (!formData.title.trim()) {
      setError("Title is required");
      return;
    }
    if (!formData.price || isNaN(parseFloat(formData.price))) {
      setError("Valid price is required");
      return;
    }
    if (!formData.quantity || isNaN(parseInt(formData.quantity))) {
      setError("Valid quantity is required");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const method = editingId ? "PUT" : "POST";
      const url = editingId ? `/api/inventory/${editingId}` : "/api/inventory";

      const res = await authedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: formData.sku,
          title: formData.title,
          description: formData.description,
          price: parseFloat(formData.price),
          quantity: parseInt(formData.quantity),
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Failed to save product");
      }

      setSuccess(editingId ? "Product updated successfully" : "Product added successfully");
      setShowAddForm(false);
      resetForm();
      loadProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sku) => {
    if (!confirm(`Delete product "${sku}"? This cannot be undone.`)) {
      return;
    }

    setDeleting(sku);
    setError("");
    setSuccess("");

    try {
      const res = await authedFetch(`/api/inventory/${sku}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Failed to delete product");
      }

      setSuccess("Product deleted successfully");
      loadProducts();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  };

  // Pagination helpers
  const totalPages = Math.ceil(totalCount / pageSize);
  const offset = (currentPage - 1) * pageSize;

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  // Bulk selection
  const handleSelectAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.sku)));
    }
  };

  const handleSelectProduct = (sku) => {
    const newSelected = new Set(selected);
    if (newSelected.has(sku)) {
      newSelected.delete(sku);
    } else {
      newSelected.add(sku);
    }
    setSelected(newSelected);
  };

  // Open post dialog for a product
  const handlePostToAllPlatforms = (product) => {
    setPostDialogProduct(product);
    setShowPostDialog(true);
  };

  // Handle successful posting
  const handlePostSuccess = () => {
    setSuccess("Product posted to selected platforms!");
    loadProducts(); // Refresh to show updated status
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Inventory Management</p>
              <h1 className="text-3xl font-bold text-gray-900 mt-1">Products</h1>
            </div>
            <nav className="flex gap-4">
              <Link href="/" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Stager
              </Link>
              <Link href="/channels" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
                Channels
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
        {/* Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
            <p className="font-medium">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
            <p className="font-medium">{success}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-gray-600 text-sm">Total Products</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{totalCount}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-gray-600 text-sm">Showing</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{products.length}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-gray-600 text-sm">Page</p>
            <p className="text-3xl font-bold text-gray-900 mt-2">{currentPage} of {totalPages || 1}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
          <div className="flex flex-col gap-4">
            {/* Search and Add button row */}
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search by SKU or Title
                </label>
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <button
                onClick={handleAddClick}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                + Add Product
              </button>
            </div>

            {/* Page size selector */}
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700">
                Products per page:
              </label>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value));
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>
        </div>

        {/* Add/Edit Form */}
        {showAddForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              {editingId ? "Edit Product" : "Add New Product"}
            </h2>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SKU *
                </label>
                <input
                  type="text"
                  name="sku"
                  value={formData.sku}
                  onChange={handleFormChange}
                  disabled={editingId !== null}
                  placeholder="e.g., SKU-001"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleFormChange}
                  placeholder="Product title"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleFormChange}
                  placeholder="Product description"
                  rows="3"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Price ($) *
                </label>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleFormChange}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity *
                </label>
                <input
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleFormChange}
                  placeholder="0"
                  min="0"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="md:col-span-2 flex gap-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : editingId ? "Update Product" : "Add Product"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    resetForm();
                  }}
                  className="flex-1 px-6 py-2 bg-gray-200 text-gray-900 font-medium rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Products Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12 bg-white rounded-lg border border-gray-200">
            <div className="text-center">
              <div className="inline-block animate-spin text-4xl mb-4">⟳</div>
              <p className="text-gray-600">Loading products...</p>
            </div>
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-600 text-lg mb-4">
              {searchQuery ? "No products match your search" : "No products yet"}
            </p>
            {!searchQuery && (
              <button
                onClick={handleAddClick}
                className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Add Your First Product
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left">
                      <input
                        type="checkbox"
                        checked={selected.size === products.length && products.length > 0}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">SKU</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Title</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Price</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Qty</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Updated</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Marketplaces</th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {products.map((product) => (
                    <tr key={product.sku} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selected.has(product.sku)}
                          onChange={() => handleSelectProduct(product.sku)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-6 py-4 text-sm font-mono font-medium text-gray-900">
                        {product.sku}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                        <div className="font-medium truncate">{product.title}</div>
                        {product.description && (
                          <div className="text-xs text-gray-500 truncate">{product.description}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        ${product.price?.toFixed(2) || "0.00"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          product.quantity > 10
                            ? "bg-green-100 text-green-800"
                            : product.quantity > 0
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}>
                          {product.quantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {product.last_updated
                          ? new Date(product.last_updated).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "N/A"}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="flex gap-2 flex-wrap">
                          {product.marketplaces && product.marketplaces.length > 0 ? (
                            product.marketplaces.map((market) => (
                              <span
                                key={market}
                                title={MARKETPLACE_NAMES[market] || market}
                                className="text-lg"
                              >
                                {MARKETPLACE_ICONS[market] || "📦"}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-500">None</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handlePostToAllPlatforms(product)}
                            className="px-3 py-1 text-green-600 hover:text-green-900 hover:bg-green-50 rounded transition-colors"
                            title="Post to eBay, Etsy, Amazon, TikTok Shop"
                          >
                            Post
                          </button>
                          <button
                            onClick={() => handleEditClick(product)}
                            className="px-3 py-1 text-blue-600 hover:text-blue-900 hover:bg-blue-50 rounded transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(product.sku)}
                            disabled={deleting === product.sku}
                            className="px-3 py-1 text-red-600 hover:text-red-900 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          >
                            {deleting === product.sku ? "..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ← Previous
            </button>

            <div className="flex gap-2">
              {Array.from({ length: Math.min(7, totalPages) }).map((_, i) => {
                let pageNum;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (currentPage <= 4) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = currentPage - 3 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-2 rounded-lg font-medium transition-colors ${
                      currentPage === pageNum
                        ? "bg-blue-600 text-white"
                        : "border border-gray-300 text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        )}

        {selected.size > 0 && (
          <div className="fixed bottom-8 right-8 bg-white rounded-lg shadow-lg border border-gray-200 p-6 max-w-sm">
            <p className="font-semibold text-gray-900 mb-4">
              {selected.size} product{selected.size !== 1 ? "s" : ""} selected
            </p>
            <div className="flex gap-3 flex-col">
              <p className="text-xs text-gray-600">
                Post each product individually to select different platforms per product.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelected(new Set())}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-900 font-medium hover:bg-gray-50 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Post to Platforms Dialog */}
        {showPostDialog && postDialogProduct && (
          <PostToPlatformsDialog
            productSKU={postDialogProduct.sku}
            productTitle={postDialogProduct.title}
            onClose={() => {
              setShowPostDialog(false);
              setPostDialogProduct(null);
            }}
            onSuccess={handlePostSuccess}
          />
        )}
      </main>
    </div>
  );
}
