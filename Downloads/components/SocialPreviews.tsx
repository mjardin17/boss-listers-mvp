"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";
import type { SocialCaption } from "../types/photo-workflow";

interface SocialPreviewsProps {
  captions: SocialCaption[] | null;
  loading: boolean;
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "bg-pink-50 dark:bg-pink-900/20 border-pink-200 dark:border-pink-800",
  tiktok: "bg-black/5 dark:bg-white/5 border-gray-300 dark:border-gray-700",
  facebook:
    "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
  twitter: "bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800",
  pinterest:
    "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
  linkedin:
    "bg-blue-100/50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700",
  youtube_shorts:
    "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
  threads: "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700",
};

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📷",
  tiktok: "🎵",
  facebook: "f",
  twitter: "𝕏",
  pinterest: "📌",
  linkedin: "💼",
  youtube_shorts: "🎬",
  threads: "💬",
};

// Platform-specific character limits
const PLATFORM_LIMITS: Record<string, number> = {
  instagram: 2200,
  tiktok: 2200,
  facebook: 63206,
  twitter: 280,
  pinterest: 500,
  linkedin: 3000,
  youtube_shorts: 5000,
  threads: 500,
};

export function SocialPreviews({ captions, loading }: SocialPreviewsProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getCharacterCount = (caption: string, hashtags: string[]): number => {
    const hashtagString = hashtags.join(" ");
    return caption.length + (hashtagString.length > 0 ? 1 + hashtagString.length : 0);
  };

  const isOverLimit = (
    count: number,
    limit: number
  ): boolean => count > limit;

  if (loading) {
    return (
      <div className="w-full">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Step 3: Social Media Captions
        </h2>
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent dark:border-blue-400 dark:border-t-transparent"></div>
            <span className="font-medium">
              Generating captions for all platforms...
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (!captions || captions.length === 0) {
    return (
      <div className="w-full">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Step 3: Social Media Captions
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Extract product details first to generate social media captions
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        Step 3: Social Media Captions
      </h2>

      <div className="space-y-3">
        {captions.map((caption, index) => {
          const charCount = getCharacterCount(caption.caption, caption.hashtags);
          const limit = PLATFORM_LIMITS[caption.platform] || 280;
          const isOver = isOverLimit(charCount, limit);

          return (
            <div
              key={index}
              className={`border rounded-lg p-4 transition-all ${
                isOver
                  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                  : PLATFORM_COLORS[caption.platform] ||
                    "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white capitalize flex items-center gap-2">
                    <span className="text-lg">
                      {PLATFORM_ICONS[caption.platform] || "📱"}
                    </span>
                    {caption.platform.replace("_", " ")}
                  </p>
                  <p
                    className={`text-xs mt-1 font-medium ${
                      isOver
                        ? "text-red-600 dark:text-red-400"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {charCount} / {limit} characters{" "}
                    {isOver && "(Over limit)"}
                  </p>
                  {caption.mediaRecommendations && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {caption.mediaRecommendations}
                    </p>
                  )}
                </div>
                <button
                  onClick={() =>
                    handleCopy(
                      `${caption.caption}\n\n${caption.hashtags.join(" ")}`,
                      index
                    )
                  }
                  className="flex-shrink-0 p-2 hover:bg-white/50 dark:hover:bg-white/10 rounded transition-colors"
                  title="Copy caption and hashtags"
                >
                  {copiedIndex === index ? (
                    <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  )}
                </button>
              </div>

              <p className="text-gray-900 dark:text-white text-sm mb-3 leading-relaxed">
                {caption.caption}
              </p>

              {caption.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {caption.hashtags.map((tag, tagIndex) => (
                    <span
                      key={tagIndex}
                      className="text-xs bg-white/40 dark:bg-white/10 px-2 py-1 rounded text-gray-700 dark:text-gray-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <p className="text-sm text-amber-600 dark:text-amber-400">
          ⚡ Captions are AI-generated and optimized for each platform. Character
          counts include hashtags. Click the copy icon to add them to your posts.
        </p>
      </div>
    </div>
  );
}
