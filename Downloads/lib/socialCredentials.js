// lib/socialCredentials.js
// Manage social media credentials

import { createClient } from "@supabase/supabase-js";

export async function getSocialCredentials(userId, platform) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase
    .from("social_media_credentials")
    .select("*")
    .eq("user_id", userId)
    .eq("platform", platform)
    .single();

  if (error || !data) return null;
  return data;
}

export async function listConnectedPlatforms(userId) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase
    .from("social_media_credentials")
    .select("platform, account_identifier, connected_at")
    .eq("user_id", userId);

  if (error) return [];
  return data || [];
}

export async function disconnectPlatform(userId, platform) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { error } = await supabase
    .from("social_media_credentials")
    .delete()
    .eq("user_id", userId)
    .eq("platform", platform);

  if (error) throw error;
}

export function getOAuthUrl(platform, userId) {
  const configs = {
    tiktok: {
      url: "https://www.tiktok.com/v1/oauth/authorize/",
      clientId: process.env.NEXT_PUBLIC_TIKTOK_OAUTH_CLIENT_ID,
      scope: "user.info.basic,video.publish",
    },
    instagram: {
      url: "https://api.instagram.com/oauth/authorize",
      clientId: process.env.NEXT_PUBLIC_INSTAGRAM_OAUTH_CLIENT_ID,
      scope: "instagram_business_basic,instagram_business_content_publish",
    },
    youtube: {
      url: "https://accounts.google.com/o/oauth2/v2/auth",
      clientId: process.env.NEXT_PUBLIC_YOUTUBE_OAUTH_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/youtube.upload",
    },
    facebook: {
      url: "https://www.facebook.com/v18.0/dialog/oauth",
      clientId: process.env.NEXT_PUBLIC_FACEBOOK_OAUTH_CLIENT_ID,
      scope: "pages_manage_metadata,pages_read_engagement,pages_manage_posts",
    },
    twitter: {
      url: "https://twitter.com/i/oauth2/authorize",
      clientId: process.env.NEXT_PUBLIC_TWITTER_OAUTH_CLIENT_ID,
      scope: "tweet.write tweet.read users.read",
    },
  };

  const config = configs[platform];
  if (!config) throw new Error(`Unknown platform: ${platform}`);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${typeof window !== "undefined" ? window.location.origin : "http://localhost:3001"}/api/oauth/${platform}/callback`,
    response_type: "code",
    scope: config.scope,
    state: userId,
  });

  return `${config.url}?${params.toString()}`;
}
