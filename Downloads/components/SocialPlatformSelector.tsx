"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { listConnectedPlatforms } from "@/lib/socialCredentials";

const PLATFORMS = [
  { id: "tiktok", label: "TikTok", icon: "🎵" },
  { id: "instagram", label: "Instagram", icon: "📸" },
  { id: "youtube", label: "YouTube", icon: "▶️" },
  { id: "facebook", label: "Facebook", icon: "👥" },
  { id: "twitter", label: "Twitter/X", icon: "𝕏" },
];

type Props = {
  userId: string;
  selected: string[];
  onChange: (platforms: string[]) => void;
};

export function SocialPlatformSelector({ userId, selected, onChange }: Props) {
  const [available, setAvailable] = useState<string[]>([]);

  useEffect(() => {
    loadAvailable();
  }, [userId]);

  async function loadAvailable() {
    try {
      const connected = await listConnectedPlatforms(userId);
      setAvailable(connected.map((c) => c.platform));
    } catch (err) {
      console.error("Failed to load available platforms:", err);
    }
  }

  function togglePlatform(platformId: string) {
    if (selected.includes(platformId)) {
      onChange(selected.filter((p) => p !== platformId));
    } else {
      onChange([...selected, platformId]);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block font-semibold">Post to Social Platforms</label>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {PLATFORMS.map((platform) => {
          const isAvailable = available.includes(platform.id);
          const isSelected = selected.includes(platform.id);

          return (
            <button
              key={platform.id}
              onClick={() => togglePlatform(platform.id)}
              disabled={!isAvailable}
              className={`p-4 rounded-lg border-2 transition flex flex-col items-center gap-2 ${
                isSelected
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-200 bg-white"
              } ${
                !isAvailable ? "opacity-50 cursor-not-allowed" : "hover:border-blue-300"
              }`}
            >
              <div className="text-2xl">{platform.icon}</div>
              <div className="text-sm font-medium">{platform.label}</div>
              {isSelected && (
                <Check className="w-4 h-4 text-blue-500 absolute top-2 right-2" />
              )}
              {!isAvailable && (
                <div className="text-xs text-gray-500 mt-1">Not connected</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
