// GET+POST /api/channels/ebay/account-deletion
//
// eBay's required Marketplace Account Deletion/Closure Notification endpoint.
// Any production keyset that stores other eBay users' data (which this app
// does via tenant_marketplace_connections) must expose this endpoint or eBay
// can suspend the keyset on compliance review.
//
// GET  — one-time verification handshake eBay performs when you register
//        this URL in the Developer Portal. Must echo back
//        sha256(challengeCode + verificationToken + endpointUrl).
// POST — the actual deletion notification. eBay tells us a user closed/
//        deleted their eBay account; we must purge any stored data tied to
//        that account. We match on account_identifier (the eBay username
//        stored by ebay/callback.js) across ALL tenants, since eBay's
//        notification carries no tenant context of its own.
//
// Reference: https://developer.ebay.com/marketplace-account-deletion

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const VERIFICATION_TOKEN = process.env.EBAY_DELETION_VERIFICATION_TOKEN;

function endpointUrl(req) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const base = configured && !configured.includes("localhost")
    ? configured
    : `https://${req.headers.host}`;
  return `${base}/api/channels/ebay/account-deletion`;
}

export default async function handler(req, res) {
  if (!VERIFICATION_TOKEN) {
    console.error("[ebay/account-deletion] EBAY_DELETION_VERIFICATION_TOKEN not configured");
    return res.status(500).json({ error: "Verification token not configured" });
  }

  if (req.method === "GET") {
    return handleChallenge(req, res);
  }

  if (req.method === "POST") {
    return handleDeletion(req, res);
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}

function handleChallenge(req, res) {
  const { challenge_code: challengeCode } = req.query;
  if (!challengeCode) {
    return res.status(400).json({ error: "Missing challenge_code" });
  }

  const hash = crypto
    .createHash("sha256")
    .update(challengeCode)
    .update(VERIFICATION_TOKEN)
    .update(endpointUrl(req))
    .digest("hex");

  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({ challengeResponse: hash });
}

async function handleDeletion(req, res) {
  const username = req.body?.notification?.data?.username;
  const userId = req.body?.notification?.data?.userId;

  if (!username && !userId) {
    // Malformed payload — ack anyway so eBay doesn't retry forever on
    // something we can never satisfy, but log it for investigation.
    console.error("[ebay/account-deletion] Notification missing username/userId", req.body);
    return res.status(200).json({ ok: true });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await supabase
      .from("tenant_marketplace_connections")
      .delete()
      .eq("marketplace", "ebay")
      .eq("account_identifier", username);

    if (error) {
      console.error("[ebay/account-deletion] Failed to purge connection:", error.message);
      // Still ack — eBay only cares that we received it; we handle
      // failures out-of-band rather than making eBay retry indefinitely.
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[ebay/account-deletion] Unexpected error:", err.message);
    return res.status(200).json({ ok: true });
  }
}
