// Amazon Selling Partner OAuth callback handler
// Exchanges authorization code for LWA (Login with Amazon) token

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
  const stateMatch = cookies.match(/amazon_state=([^;]+)/);
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
    const clientId = process.env.AMAZON_CLIENT_ID;
    const clientSecret = process.env.AMAZON_CLIENT_SECRET;
    const redirectUri = process.env.AMAZON_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("Amazon credentials not configured on server");
    }

    // Exchange code for LWA token
    const tokenResponse = await fetch("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
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

    let encryptedRefresh = null;
    if (tokenData.refresh_token) {
      const refreshIv = crypto.randomBytes(16);
      const refreshCipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(secretKey), refreshIv);
      encryptedRefresh = refreshCipher.update(tokenData.refresh_token, "utf8", "hex");
      encryptedRefresh += refreshCipher.final("hex");
      encryptedRefresh = refreshIv.toString("hex") + ":" + encryptedRefresh;
    }

    // Store encrypted tokens in Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error: insertError } = await supabase.from("marketplace_tokens").insert({
      tenant_id: session.tenantId,
      marketplace: "amazon",
      access_token: encrypted,
      refresh_token: encryptedRefresh,
      expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000),
      created_at: new Date(),
    });

    if (insertError) throw insertError;

    // Redirect to success page
    return res.redirect("/channels?success=amazon");
  } catch (err) {
    console.error("[amazon/callback]", err.message);
    return res.redirect(`/channels?error=${encodeURIComponent(err.message)}`);
  }
}
