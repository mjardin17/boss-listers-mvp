"use client";

import { useState } from "react";
import { authedFetch } from "../lib/clientAuth";

interface PostResult {
  success: boolean;
  error?: string;
  listingId?: string;
  url?: string;
  code?: string;
  statusCode?: number;
}

interface PostingResults {
  ebay?: PostResult;
  etsy?: PostResult;
  amazon?: PostResult;
  "tiktok-shop"?: PostResult;
}

interface PostToPlatformsDialogProps {
  productSKU: string;
  productTitle: string;
  onClose: () => void;
  onSuccess?: (results: PostingResults) => void;
}

const PLATFORM_CONFIG = [
  {
    id: "ebay",
    label: "eBay",
    icon: "🏪",
    description: "Post to eBay Seller Central",
    available: true,
  },
  {
    id: "etsy",
    label: "Etsy",
    icon: "🧵",
    description: "Post to your Etsy shop",
    available: true,
  },
  {
    id: "amazon",
    label: "Amazon",
    icon: "🔶",
    description: "Post to Amazon Seller Central",
    available: true,
  },
  {
    id: "tiktok-shop",
    label: "TikTok Shop",
    icon: "🎵",
    description: "Post to TikTok Shop",
    available: true,
  },
];

export default function PostToPlatformsDialog({
  productSKU,
  productTitle,
  onClose,
  onSuccess,
}: PostToPlatformsDialogProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(
    new Set()
  );
  const [posting, setPosting] = useState(false);
  const [results, setResults] = useState<PostingResults | null>(null);
  const [error, setError] = useState("");
  const [dryRun, setDryRun] = useState(true);

  const togglePlatform = (platformId: string) => {
    const newSelected = new Set(selectedPlatforms);
    if (newSelected.has(platformId)) {
      newSelected.delete(platformId);
    } else {
      newSelected.add(platformId);
    }
    setSelectedPlatforms(newSelected);
  };

  const handlePostClick = async () => {
    if (selectedPlatforms.size === 0) {
      setError("Please select at least one platform");
      return;
    }

    setPosting(true);
    setError("");
    setResults(null);

    try {
      const res = await authedFetch("/api/inventory/post-to-platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productSKU,
          platforms: Array.from(selectedPlatforms),
          dryRun,
          confirm: dryRun ? undefined : "PUBLISH_LIVE",
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to post product");
      }

      setResults(data.results);
      onSuccess?.(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setPosting(false);
    }
  };

  const getPlatformIcon = (platformId: string): string => {
    const platform = PLATFORM_CONFIG.find((p) => p.id === platformId);
    return platform?.icon || "📦";
  };

  const getPlatformLabel = (platformId: string): string => {
    const platform = PLATFORM_CONFIG.find((p) => p.id === platformId);
    return platform?.label || platformId;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-gray-200 p-6 sticky top-0 bg-white">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Post to Marketplaces
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {productSKU} — {productTitle}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={posting}
              className="text-gray-400 hover:text-gray-600 text-2xl disabled:opacity-50"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
              <p className="font-medium">{error}</p>
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="font-semibold text-blue-900 mb-2">
                  Posting Results
                </p>
                {Object.entries(results).map(([platform, result]) => (
                  <div
                    key={platform}
                    className="flex items-start gap-3 py-2 border-t border-blue-100 pt-2 first:border-t-0 first:pt-0"
                  >
                    <span className="text-2xl">{getPlatformIcon(platform)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-blue-900">
                        {getPlatformLabel(platform)}
                      </p>
                      {result.success ? (
                        <div className="text-sm text-green-700">
                          <p className="font-medium">✓ Success</p>
                          {result.listingId && (
                            <p className="text-xs text-gray-600">
                              Listing ID: {result.listingId}
                            </p>
                          )}
                          {result.url && (
                            <a
                              href={result.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              View listing →
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-red-700">
                          <p className="font-medium">✗ Failed</p>
                          <p className="text-xs">{result.error}</p>
                          {result.code && (
                            <p className="text-xs text-gray-600">
                              Code: {result.code}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setResults(null);
                    setSelectedPlatforms(new Set());
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 font-medium rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Start Over
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Platform Selection (hidden when showing results) */}
          {!results && (
            <>
              {/* Mode Toggle */}
              <div className="border border-gray-200 rounded-lg p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!dryRun}
                    onChange={(e) => setDryRun(!e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <div>
                    <p className="font-medium text-gray-900">
                      Post Live to Marketplaces
                    </p>
                    <p className="text-xs text-gray-600">
                      {dryRun
                        ? "Currently: Preview mode (no listings will be created)"
                        : "Listings will be created and published immediately"}
                    </p>
                  </div>
                </label>
              </div>

              {/* Platform Selection */}
              <div>
                <p className="font-semibold text-gray-900 mb-4">
                  Select Platforms
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {PLATFORM_CONFIG.map((platform) => (
                    <button
                      key={platform.id}
                      onClick={() => togglePlatform(platform.id)}
                      disabled={!platform.available || posting}
                      className={`p-4 rounded-lg border-2 transition-all text-left ${
                        selectedPlatforms.has(platform.id)
                          ? "border-blue-600 bg-blue-50"
                          : "border-gray-200 bg-white hover:border-gray-300"
                      } ${!platform.available ? "opacity-50 cursor-not-allowed" : ""} ${
                        posting ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedPlatforms.has(platform.id)}
                          onChange={() => {}}
                          disabled={!platform.available || posting}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{platform.icon}</span>
                            <p className="font-semibold text-gray-900">
                              {platform.label}
                            </p>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">
                            {platform.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Info Box */}
              {dryRun && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-900">
                    <span className="font-semibold">Preview Mode:</span> This
                    will test the posting flow without creating actual listings.
                  </p>
                </div>
              )}

              {!dryRun && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-900">
                    <span className="font-semibold">⚠ Live Posting:</span>{" "}
                    Listings will be created immediately on all selected
                    platforms.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!results && (
          <div className="border-t border-gray-200 p-6 bg-gray-50 flex gap-4">
            <button
              onClick={onClose}
              disabled={posting}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-900 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handlePostClick}
              disabled={posting || selectedPlatforms.size === 0}
              className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {posting && <span className="inline-block animate-spin">⟳</span>}
              {posting ? "Posting..." : "Post to Selected"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
