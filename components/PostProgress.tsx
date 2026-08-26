"use client";

import { Loader, CheckCircle, AlertCircle, XCircle, SkipForward } from "lucide-react";
import type { PostProgressItem } from "../types/photo-workflow";

interface PostProgressProps {
  progress: PostProgressItem[];
  isPosting: boolean;
  onCancel?: () => void;
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <div className="w-4 h-4 rounded-full border-2 border-gray-400 dark:border-gray-600" />,
  in_progress: <Loader className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />,
  success: <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />,
  error: <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />,
  skipped: <SkipForward className="w-4 h-4 text-gray-400 dark:text-gray-600" />,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700",
  in_progress: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
  success: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
  error: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
  skipped: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700",
};

const STATUS_TEXT: Record<string, string> = {
  pending: "Waiting...",
  in_progress: "In Progress",
  success: "Posted",
  error: "Failed",
  skipped: "Skipped",
};

export function PostProgress({
  progress,
  isPosting,
  onCancel,
}: PostProgressProps) {
  const stats = {
    total: progress.length,
    pending: progress.filter((p) => p.status === "pending").length,
    inProgress: progress.filter((p) => p.status === "in_progress").length,
    success: progress.filter((p) => p.status === "success").length,
    error: progress.filter((p) => p.status === "error").length,
    skipped: progress.filter((p) => p.status === "skipped").length,
  };

  const successRate =
    stats.total > 0
      ? Math.round((stats.success / (stats.total - stats.skipped)) * 100)
      : 0;

  const platformItems = progress.filter((p) => p.type === "platform");
  const marketplaceItems = progress.filter((p) => p.type === "marketplace");

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        Posting Progress
      </h2>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {stats.total}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Total</div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {stats.inProgress + stats.pending}
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-400">Pending</div>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {stats.success}
          </div>
          <div className="text-xs text-green-600 dark:text-green-400">Success</div>
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {stats.error}
          </div>
          <div className="text-xs text-red-600 dark:text-red-400">Failed</div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            {successRate}%
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">Success</div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-500 to-green-600 dark:from-green-600 dark:to-green-700 transition-all duration-500"
            style={{
              width: `${(stats.success / stats.total) * 100}%`,
            }}
          />
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
          {stats.success} of {stats.total} items posted
        </p>
      </div>

      {/* Platform Items */}
      {platformItems.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
            📱 Social Platforms
          </h3>
          <div className="space-y-2">
            {platformItems.map((item) => (
              <div
                key={item.id}
                className={`border rounded-lg p-3 flex items-center justify-between ${STATUS_COLORS[item.status]}`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex-shrink-0">
                    {STATUS_ICONS[item.status]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white capitalize">
                      {item.name}
                    </p>
                    {item.error && (
                      <p className="text-xs text-red-600 dark:text-red-400 truncate">
                        {item.error}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {STATUS_TEXT[item.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Marketplace Items */}
      {marketplaceItems.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
            🏪 Marketplaces
          </h3>
          <div className="space-y-2">
            {marketplaceItems.map((item) => (
              <div
                key={item.id}
                className={`border rounded-lg p-3 flex items-center justify-between ${STATUS_COLORS[item.status]}`}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex-shrink-0">
                    {STATUS_ICONS[item.status]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white capitalize">
                      {item.name}
                    </p>
                    {item.error && (
                      <p className="text-xs text-red-600 dark:text-red-400 truncate">
                        {item.error}
                      </p>
                    )}
                  </div>
                </div>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  {STATUS_TEXT[item.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {isPosting && onCancel && (
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 font-medium transition-colors"
          >
            Cancel Posting
          </button>
        </div>
      )}

      {!isPosting && stats.error > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-600 dark:text-amber-400 mb-1">
                Some posts failed
              </h3>
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {stats.error} platform(s) or marketplace(s) encountered errors.
                Check the details above and try again.
              </p>
            </div>
          </div>
        </div>
      )}

      {!isPosting && stats.error === 0 && stats.success > 0 && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-green-600 dark:text-green-400 mb-1">
                All posts successful!
              </h3>
              <p className="text-sm text-green-600 dark:text-green-400">
                Your item has been posted to all connected platforms and
                marketplaces.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
