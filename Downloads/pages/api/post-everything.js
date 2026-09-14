// POST /api/post-everything
// Phase 1: List item to all selected marketplaces
// body: { listingId, channels[] }
// SECURITY FIX: No file reads, no client-supplied tokens

import { createClient } from "@supabase/supabase-js";
import { buildManualPackage } from "../../lib/channels/manualPackage";
import { CHANNELS, API_CONNECTORS } from "../../lib/channels/registry";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { listingId, channels } = req.body || {};

    if (!listingId || !channels || !Array.isArray(channels) || channels.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "listingId and channels[] required",
      });
    }

    // Load listing from Supabase (server-side, verified)
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("*")
      .eq("id", listingId)
      .single();

    if (listingError || !listing) {
      return res.status(404).json({ ok: false, error: "Listing not found" });
    }

    const results = {
      success: true,
      results: [],
      timestamp: new Date().toISOString(),
    };

    // Validate requested channels exist in registry
    const validChannelIds = new Set(CHANNELS.map(ch => ch.id));
    const invalidChannels = channels.filter(ch => !validChannelIds.has(ch));
    if (invalidChannels.length > 0) {
      return res.status(400).json({
        ok: false,
        error: `Invalid channels: ${invalidChannels.join(", ")}`,
      });
    }

    // Post to each requested channel
    for (const channelId of channels) {
      const channel = CHANNELS.find(ch => ch.id === channelId);
      if (!channel) continue;

      try {
        if (channel.mode === "api") {
          // API-backed platform
          const connector = API_CONNECTORS[channelId];
          if (!connector) {
            results.results.push({
              channel: channelId,
              status: "error",
              message: "Connector not available",
            });
            continue;
          }

          const postResult = await connector.createListing(listing, { dryRun: false });
          results.results.push({
            channel: channelId,
            status: "success",
            data: postResult,
          });
        } else {
          // Manual platform
          const pkg = buildManualPackage(listing, channelId);
          results.results.push({
            channel: channelId,
            status: "ready",
            package: pkg,
          });
        }
      } catch (err) {
        results.results.push({
          channel: channelId,
          status: "error",
          message: err.message,
        });
      }
    }

    return res.status(200).json(results);
  } catch (err) {
    console.error("[api/post-everything]", err.message);
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message });
  }
}
