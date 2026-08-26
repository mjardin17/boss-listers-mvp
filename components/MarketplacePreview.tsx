"use client";

import { Check, X, AlertCircle, Lock, ChevronDown } from "lucide-react";
import { useState } from "react";
import { MARKETPLACES, type MarketplaceConnection, type ProductInfo } from "../types/photo-workflow";

interface MarketplacePreviewProps {
  connections: MarketplaceConnection[];
  productInfo: ProductInfo;
  onConnect: (marketplace: string) => void;
  onDisconnect: (marketplace: string) => void;
}

const MARKETPLACE_LOGOS: Record<string, string> = {
  amazon: "🛒",
  ebay: "🏷️",
  mercari: "🤝",
  poshmark: "👗",
  depop: "✨",
  vestiaire: "👠",
  grailed: "🎽",
  etsy: "🧵",
  shopify: "🏪",
  facebook_marketplace: "📱",
  craigslist: "📰",
  letgo: "🚀",
  offerup: "💰",
  vinted: "♻️",
  rebag: "👜",
  tradesy: "💍",
  thredUP: "🔄",
  gazelle: "📦",
  kingsumo: "👑",
  whatnot: "🎤",
  pinterest_shop: "📌",
  tiktok_shop: "🎵",
  instagram_shop: "📷",
  snapchat_shop: "👻",
  twitter_commerce: "𝕏",
  woocommerce: "🛍️",
  bigcommerce: "🏬",
};

// Platform-specific field length limits
const PLATFORM_LIMITS: Record<string, Record<string, number>> = {
  amazon: { title: 200, description: 2000 },
  ebay: { title: 140, description: 4000 },
  mercari: { title: 60, description: 1000 },
  poshmark: { title: 140, description: 800 },
  depop: { title: 120, description: 1000 },
  vestiaire: { title: 100, description: 800 },
  grailed: { title: 200, description: 2000 },
  etsy: { title: 140, description: 4000 },
  shopify: { title: 255, description: 5000 },
  facebook_marketplace: { title: 100, description: 4000 },
  craigslist: { title: 100, description: 8000 },
  letgo: { title: 150, description: 2000 },
  offerup: { title: 150, description: 2000 },
  vinted: { title: 100, description: 1000 },
  rebag: { title: 120, description: 1500 },
  tradesy: { title: 120, description: 1500 },
  thredUP: { title: 150, description: 1500 },
  gazelle: { title: 100, description: 1000 },
  kingsumo: { title: 100, description: 1000 },
  whatnot: { title: 150, description: 2000 },
  pinterest_shop: { title: 120, description: 1000 },
  tiktok_shop: { title: 140, description: 1500 },
  instagram_shop: { title: 120, description: 1000 },
  snapchat_shop: { title: 150, description: 1500 },
  twitter_commerce: { title: 100, description: 800 },
  woocommerce: { title: 200, description: 5000 },
  bigcommerce: { title: 200, description: 5000 },
};

const truncateText = (text: string, limit: number): string => {
  if (text.length <= limit) return text;
  return text.substring(0, limit - 3) + "...";
};

export function MarketplacePreview({
  connections,
  productInfo,
  onConnect,
  onDisconnect,
}: MarketplacePreviewProps) {
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(
    new Set()
  );
  const [expandedPreviews, setExpandedPreviews] = useState<Set<string>>(
    new Set()
  );

  const toggleExpanded = (market: string) => {
    const newExpanded = new Set(expandedMarkets);
    if (newExpanded.has(market)) {
      newExpanded.delete(market);
    } else {
      newExpanded.add(market);
    }
    setExpandedMarkets(newExpanded);
  };

  const togglePreview = (marketplace: string) => {
    const newExpanded = new Set(expandedPreviews);
    if (newExpanded.has(marketplace)) {
      newExpanded.delete(marketplace);
    } else {
      newExpanded.add(marketplace);
    }
    setExpandedPreviews(newExpanded);
  };

  const connectedCount = connections.filter((c) => c.connected).length;
  const categories = {
    "E-Commerce Giants": [
      "amazon",
      "ebay",
      "etsy",
      "shopify",
      "woocommerce",
      "bigcommerce",
    ],
    "Resale Platforms": [
      "mercari",
      "poshmark",
      "depop",
      "vestiaire",
      "grailed",
      "vinted",
      "rebag",
      "tradesy",
      "thredUP",
    ],
    "Local & Social": [
      "facebook_marketplace",
      "craigslist",
      "letgo",
      "offerup",
      "pinterest_shop",
      "instagram_shop",
    ],
    "Live & Trending": [
      "tiktok_shop",
      "snapchat_shop",
      "twitter_commerce",
      "whatnot",
    ],
    "Specialty": ["gazelle", "kingsumo"],
  };

  const MarketplacePackagePreview = ({ marketplace }: { marketplace: string }) => {
    const limits = PLATFORM_LIMITS[marketplace] || { title: 140, description: 1000 };
    const truncatedTitle = truncateText(productInfo.title, limits.title);
    const truncatedDesc = truncateText(productInfo.description, limits.description);
    const isExpanded = expandedPreviews.has(marketplace);

    return (
      <div className="mt-3 border-t border-gray-200 dark:border-gray-600 pt-3">
        <button
          onClick={() => togglePreview(marketplace)}
          className="flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ChevronDown
            className={`w-3 h-3 transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
          {isExpanded ? "Hide" : "Show"} preview
        </button>

        {isExpanded && (
          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs space-y-2">
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Title ({truncatedTitle.length} / {limits.title})
              </p>
              <p className="text-gray-900 dark:text-white text-xs mt-1">
                {truncatedTitle}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Description ({truncatedDesc.length} / {limits.description})
              </p>
              <p className="text-gray-900 dark:text-white text-xs mt-1 line-clamp-3">
                {truncatedDesc}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Price
              </p>
              <p className="text-gray-900 dark:text-white text-xs mt-1 font-semibold">
                ${productInfo.price.toFixed(2)}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Step 4: Marketplace Packages
          </h2>
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-sm font-medium">
            <Check className="w-4 h-4" />
            {connectedCount} connected
          </span>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Connect your marketplace accounts. Each platform has different title and description limits.
        </p>
      </div>

      <div className="space-y-4">
        {Object.entries(categories).map(([categoryName, markets]) => (
          <div
            key={categoryName}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
          >
            <button
              onClick={() => toggleExpanded(categoryName)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {categoryName}
              </h3>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {markets.filter((m) => {
                  const conn = connections.find((c) => c.marketplace === m);
                  return conn?.connected;
                }).length}/{markets.length}
              </div>
            </button>

            {expandedMarkets.has(categoryName) && (
              <div className="border-t border-gray-200 dark:border-gray-700 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {markets.map((marketplace) => {
                  const connection = connections.find(
                    (c) => c.marketplace === marketplace
                  );
                  const isConnected = connection?.connected ?? false;
                  const limits = PLATFORM_LIMITS[marketplace] || { title: 140, description: 1000 };

                  return (
                    <div
                      key={marketplace}
                      className={`p-3 rounded-lg border transition-all ${
                        isConnected
                          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                          : "bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">
                            {MARKETPLACE_LOGOS[marketplace] || "🏪"}
                          </span>
                          <span className="font-medium text-sm text-gray-900 dark:text-white capitalize">
                            {marketplace.replace("_", " ")}
                          </span>
                        </div>
                        {isConnected ? (
                          <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <Lock className="w-4 h-4 text-gray-400" />
                        )}
                      </div>

                      {isConnected && connection?.sellerId && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                          ID: {connection.sellerId.substring(0, 8)}...
                        </p>
                      )}

                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                        Title: {limits.title} chars | Desc: {limits.description} chars
                      </p>

                      <button
                        onClick={() =>
                          isConnected
                            ? onDisconnect(marketplace)
                            : onConnect(marketplace)
                        }
                        className={`w-full px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                          isConnected
                            ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                            : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                        }`}
                      >
                        {isConnected ? "Disconnect" : "Connect"}
                      </button>

                      {isConnected && (
                        <MarketplacePackagePreview marketplace={marketplace} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {connectedCount === 0 && (
        <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-600 dark:text-amber-400 mb-1">
              No marketplaces connected
            </h3>
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Connect at least one marketplace to post your listing
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-600 dark:text-blue-400">
          🔐 Your credentials are encrypted. Titles and descriptions are automatically truncated to match platform limits.
        </p>
      </div>
    </div>
  );
}
