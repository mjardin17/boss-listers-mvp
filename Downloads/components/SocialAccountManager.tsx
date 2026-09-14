"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut, Loader } from "lucide-react";
import { listConnectedPlatforms, disconnectPlatform, getOAuthUrl } from "@/lib/socialCredentials";

const PLATFORMS = [
  { id: "tiktok", label: "TikTok", color: "bg-black" },
  { id: "instagram", label: "Instagram", color: "bg-pink-500" },
  { id: "youtube", label: "YouTube", color: "bg-red-600" },
  { id: "facebook", label: "Facebook", color: "bg-blue-600" },
  { id: "twitter", label: "Twitter/X", color: "bg-black" },
];

type Connected = {
  platform: string;
  account_identifier: string;
  connected_at: string;
};

export function SocialAccountManager({ userId }: { userId: string }) {
  const [connected, setConnected] = useState<Connected[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    loadConnections();
  }, [userId]);

  async function loadConnections() {
    try {
      const platforms = await listConnectedPlatforms(userId);
      setConnected(platforms);
    } catch (err) {
      console.error("Failed to load connections:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect(platform: string) {
    setDisconnecting(platform);
    try {
      await disconnectPlatform(userId, platform);
      setConnected(connected.filter((c) => c.platform !== platform));
    } catch (err) {
      console.error("Failed to disconnect:", err);
    } finally {
      setDisconnecting(null);
    }
  }

  function handleConnect(platform: string) {
    try {
      const url = getOAuthUrl(platform, userId);
      window.location.href = url;
    } catch (err) {
      console.error("OAuth error:", err);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center p-8"><Loader className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Social Media Accounts</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PLATFORMS.map((platform) => {
          const isConnected = connected.some((c) => c.platform === platform.id);
          const account = connected.find((c) => c.platform === platform.id);

          return (
            <div
              key={platform.id}
              className="border rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className={`${platform.color} w-10 h-10 rounded-lg`} />
                <div>
                  <div className="font-semibold">{platform.label}</div>
                  {isConnected && (
                    <div className="text-sm text-gray-600">
                      {account?.account_identifier}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() =>
                  isConnected
                    ? handleDisconnect(platform.id)
                    : handleConnect(platform.id)
                }
                disabled={disconnecting === platform.id}
                className={`flex items-center gap-2 px-3 py-2 rounded ${
                  isConnected
                    ? "bg-red-100 text-red-700 hover:bg-red-200"
                    : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                } disabled:opacity-50`}
              >
                {disconnecting === platform.id ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : isConnected ? (
                  <>
                    <LogOut className="w-4 h-4" />
                    Disconnect
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    Connect
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
