"use client";

import { useState } from "react";
import { CheckCircle, XCircle, Loader } from "lucide-react";

type Result = {
  platform: string;
  status: "success" | "error";
  postId?: string;
  url?: string;
  message?: string;
};

type Props = {
  commercialJobId: string;
  selectedPlatforms: string[];
  onClose?: () => void;
};

const PLATFORM_NAMES: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  twitter: "Twitter/X",
};

export function SocialPostingResults({
  commercialJobId,
  selectedPlatforms,
  onClose,
}: Props) {
  const [results, setResults] = useState<Result[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePost() {
    setIsPosting(true);
    setError(null);

    try {
      const res = await fetch("/api/social/post-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commercialJobId,
          platforms: selectedPlatforms,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to post commercials");
      }

      const data = await res.json();
      setResults(data.results);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to post commercials"
      );
    } finally {
      setIsPosting(false);
    }
  }

  if (results.length === 0 && !isPosting && !error) {
    return (
      <div className="space-y-4">
        <p className="text-gray-700">
          Ready to post your commercial to {selectedPlatforms.length} platform
          {selectedPlatforms.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={handlePost}
          className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-semibold"
        >
          Post to Social Media
        </button>
      </div>
    );
  }

  if (isPosting) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-gray-600">Posting to social platforms...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
        <p className="font-semibold text-red-900">Error Posting</p>
        <p className="text-red-700 text-sm">{error}</p>
        <button
          onClick={handlePost}
          className="text-blue-600 hover:text-blue-700 font-semibold text-sm"
        >
          Try Again
        </button>
      </div>
    );
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const failureCount = results.filter((r) => r.status === "error").length;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="font-semibold text-blue-900">
          ✓ Posted to {successCount}/{results.length} platform
          {results.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="space-y-2">
        {results.map((result) => (
          <div
            key={result.platform}
            className={`flex items-center justify-between p-3 rounded border ${
              result.status === "success"
                ? "bg-green-50 border-green-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <div className="flex items-center gap-3">
              {result.status === "success" ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
              <div>
                <p className="font-semibold text-gray-900">
                  {PLATFORM_NAMES[result.platform] || result.platform}
                </p>
                {result.status === "error" && (
                  <p className="text-sm text-red-600">{result.message}</p>
                )}
              </div>
            </div>
            {result.status === "success" && result.url && (
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 text-sm font-semibold"
              >
                View →
              </a>
            )}
          </div>
        ))}
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="w-full bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 font-semibold"
        >
          Done
        </button>
      )}
    </div>
  );
}
