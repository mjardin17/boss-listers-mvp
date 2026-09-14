// POST /api/commercials/generate
// Generate commercial video from listing

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { listingId } = req.body;

    if (!listingId) {
      return res.status(400).json({ ok: false, error: "listingId required" });
    }

    // Load listing from Supabase
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("*")
      .eq("id", listingId)
      .single();

    if (listingError || !listing) {
      return res.status(404).json({ ok: false, error: "Listing not found" });
    }

    // Create commercial job record
    const jobId = `commercial_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`;

    const { error: jobError } = await supabase.from("commercial_jobs").insert([
      {
        id: jobId,
        listing_id: listingId,
        product_name: listing.title,
        images: listing.image_paths || [],
        description: listing.description,
        price: listing.price,
        status: "pending",
        created_at: new Date().toISOString(),
      },
    ]);

    if (jobError) {
      console.error("[api/commercials/generate] Job creation failed:", jobError);
      return res
        .status(500)
        .json({ ok: false, error: "Failed to create commercial job" });
    }

    // Queue commercial generation via webhook
    if (process.env.VIDEO_PIPELINE_URL) {
      const payload = {
        type: "generate_commercial",
        job_id: jobId,
        listing_id: listingId,
        product_name: listing.title,
        images: listing.image_paths || [],
        description: listing.description,
        price: listing.price,
      };

      const signature = signWebhook(JSON.stringify(payload), process.env.WEBHOOK_SECRET || "");

      fetch(process.env.VIDEO_PIPELINE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
        },
        body: JSON.stringify(payload),
      }).catch((err) => {
        console.error("[api/commercials/generate] Webhook failed:", err.message);
      });
    }

    return res.status(201).json({
      ok: true,
      jobId,
      status: "queued",
    });
  } catch (err) {
    console.error("[api/commercials/generate]", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

function signWebhook(body, secret) {
  if (!secret) return "";
  return crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
}
