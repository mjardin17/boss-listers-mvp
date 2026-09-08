"use client";

import { Loader, CheckCircle, AlertCircle } from "lucide-react";

interface ExtractionProgressProps {
  messages: string[];
  isExtracting: boolean;
  error: string | null;
}

export function ExtractionProgress({
  messages,
  isExtracting,
  error,
}: ExtractionProgressProps) {
  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        AI Extraction Progress
      </h2>

      {error ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-600 dark:text-red-400 mb-1">
              Extraction Error
            </h3>
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((message, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
            >
              <div className="flex-shrink-0 mt-0.5">
                {message.includes("Error") ? (
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                ) : message.includes("successfully") || message.includes("Generated") ? (
                  <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                ) : (
                  <Loader className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                )}
              </div>
              <p className="text-sm text-gray-900 dark:text-white">{message}</p>
            </div>
          ))}

          {isExtracting && (
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 p-3">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent dark:border-blue-400 dark:border-t-transparent"></div>
              <span className="text-sm font-medium">Processing...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
