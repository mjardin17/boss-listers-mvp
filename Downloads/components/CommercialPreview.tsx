"use client";

import { useState, useEffect } from "react";
import { Play, Loader, AlertCircle } from "lucide-react";

type Props = {
  jobId: string;
};

export function CommercialPreview({ jobId }: Props) {
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pollStatus();
    const interval = setInterval(pollStatus, 3000);
    return () => clearInterval(interval);
  }, [jobId]);

  async function pollStatus() {
    try {
      const res = await fetch(`/api/commercials/status?jobId=${jobId}`);
      if (!res.ok) throw new Error("Failed to fetch status");
      const data = await res.json();
      setJob(data);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading commercial");
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-gray-100 rounded-lg p-8 flex flex-col items-center justify-center gap-3">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
        <p className="text-gray-600">Generating commercial video...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
        <div>
          <p className="font-semibold text-red-900">Error</p>
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (job?.status === "pending") {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-yellow-900">⏳ Commercial is generating...</p>
        <p className="text-sm text-yellow-700">This typically takes 2-5 minutes</p>
      </div>
    );
  }

  if (job?.status === "completed" && job?.videoUrl) {
    return (
      <div className="space-y-3">
        <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
          <video
            src={job.videoUrl}
            controls
            className="w-full h-full"
          />
        </div>
        <div className="text-sm text-gray-600">
          <p>✓ Commercial ready to post</p>
          <p>Generated: {new Date(job.completedAt).toLocaleDateString()}</p>
        </div>
      </div>
    );
  }

  if (job?.status === "failed") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="font-semibold text-red-900">Generation Failed</p>
        <p className="text-red-700 text-sm">{job?.error || "Unknown error"}</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 rounded-lg p-8 text-center">
      <p className="text-gray-600">No commercial available</p>
    </div>
  );
}
