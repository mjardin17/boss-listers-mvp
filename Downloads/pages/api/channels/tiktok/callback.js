// TikTok Shop OAuth callback handler
// Exchanges authorization code for access token and stores securely

import { createClient } from "@supabase/supabase-js";
import { resolveSession } from "../../../lib/supabaseAuth";
import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).json({
      error: error || "Authorization failed",
      description: error_description,
    });
  }

  if (!code) {
    return res.status(400).json({ error: "Missing authorization code" });
  }

  const cookies = req.headers.cookie || "";
  const stateMatch = cookies.match(/tiktok_state=([^;]+)/);
  const storedState = stateMatch ? stateMatch[1] : null;

  if (state !== storedState) {
    return res.status(400).json({ error: "State mismatch - potential CSRF attack" });
  }

  const authHeader = req.headers.authorization || "";
  const userAccessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const session = userAccessToken
    ? await resolveSession(process.env, userAccessToken)
    : null;

  if (!session) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const clientId = process.env.TIKTOK_CLIENT_ID;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    const redirectUri = process.env.TIKTOK_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("TikTok Shop credentials not configured on server");
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://auth.tiktok.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || "Token exchange failed");
    }

    // Encrypt token before storage
    const secretKey = (process.env.SECRET_KEY || "default-insecure-key").padEnd(32, '0').substring(0, 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(secretKey), iv);
    let encrypted = cipher.update(tokenData.access_token, "utf8", "hex");
    encrypted += cipher.final("hex");
    encrypted = iv.toString("hex") + ":" + encrypted;

    // Store encrypted token in Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error: insertError } = await supabase.from("marketplace_tokens").insert({
      tenant_id: session.tenantId,
      marketplace: "tiktok_shop",
      access_token: encrypted,
      refresh_token: tokenData.refresh_token ? encrypted : null,
      expires_at: new Date(Date.now() + tokenData.expires_in * 1000),
      shop_id: tokenData.shop_id,
      created_at: new Date(),
    });

    if (insertError) throw insertError;

    // Redirect to success page
    return res.redirect(
      `/channels?success=tiktok&shop=${tokenData.shop_id || "connected"}`
    );
  } catch (err) {
    console.error("[tiktok/callback]", err.message);
    return res.redirect(`/channels?error=${encodeURIComponent(err.message)}`);
  }
}
