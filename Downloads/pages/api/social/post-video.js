// POST /api/social/post-video
// Post commercial video to social media platforms

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const PLATFORM_HANDLERS = {
  tiktok: postToTikTok,
  instagram: postToInstagram,
  youtube: postToYouTube,
  facebook: postToFacebook,
  twitter: postToTwitter,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const { commercialJobId, platforms } = req.body;

    if (!commercialJobId) {
      return res
        .status(400)
        .json({ ok: false, error: "commercialJobId required" });
    }

    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: "platforms[] required" });
    }

    // Load commercial job
    const { data: job, error: jobError } = await supabase
      .from("commercial_jobs")
      .select("*")
      .eq("id", commercialJobId)
      .single();

    if (jobError || !job) {
      return res.status(404).json({ ok: false, error: "Commercial job not found" });
    }

    if (!job.video_url && !job.video_path) {
      return res
        .status(400)
        .json({ ok: false, error: "Commercial not ready (video not generated)" });
    }

    // Load listing for context
    const { data: listing } = await supabase
      .from("listings")
      .select("*")
      .eq("id", job.listing_id)
      .single();

    const results = [];

    // Post to each requested platform
    for (const platform of platforms) {
      try {
        const handler = PLATFORM_HANDLERS[platform];
        if (!handler) {
          results.push({
            platform,
            status: "error",
            message: `Unknown platform: ${platform}`,
          });
          continue;
        }

        const postResult = await handler(job, listing);
        results.push({
          platform,
          status: "success",
          postId: postResult.postId,
          url: postResult.url,
        });
      } catch (err) {
        results.push({
          platform,
          status: "error",
          message: err.message,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      commercialJobId,
      results,
    });
  } catch (err) {
    console.error("[api/social/post-video]", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

async function postToTikTok(job, listing) {
  const token = process.env.TIKTOK_SOCIAL_ACCESS_TOKEN;
  if (!token) throw new Error("TikTok not configured");

  const caption = `🎥 ${listing?.title || "Check out this product"} 🛒 Link in bio`;

  const res = await fetch("https://open-api.tiktok.com/v1/video/publish/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_url: job.video_url,
      caption,
      disable_comment: false,
      disable_duet: false,
      disable_stitch: false,
    }),
  });

  if (!res.ok) {
    throw new Error(`TikTok API error: ${res.status}`);
  }

  const data = await res.json();
  return {
    postId: data.data?.video_id,
    url: `https://www.tiktok.com/@user/video/${data.data?.video_id}`,
  };
}

async function postToInstagram(job, listing) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error("Instagram not configured");

  const caption = `🎥 ${listing?.title || "Check out this product"} 🛒 Link in bio`;

  const res = await fetch(
    `https://graph.instagram.com/v18.0/me/media?media_type=VIDEO&video_url=${encodeURIComponent(
      job.video_url
    )}&caption=${encodeURIComponent(caption)}&access_token=${token}`,
    { method: "POST" }
  );

  if (!res.ok) {
    throw new Error(`Instagram API error: ${res.status}`);
  }

  const data = await res.json();
  return {
    postId: data.id,
    url: `https://www.instagram.com/p/${data.id}`,
  };
}

async function postToYouTube(job, listing) {
  const token = process.env.YOUTUBE_ACCESS_TOKEN;
  if (!token) throw new Error("YouTube not configured");

  const title = `${listing?.title || "Product"} Commercial`;
  const description = `${listing?.description || listing?.title}\n\nCheck out this product!`;

  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/videos?part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: {
          title,
          description,
          tags: ["product", "commercial", "demo"],
          categoryId: "28",
        },
        status: {
          privacyStatus: "public",
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`YouTube API error: ${res.status}`);
  }

  const data = await res.json();
  return {
    postId: data.id,
    url: `https://www.youtube.com/watch?v=${data.id}`,
  };
}

async function postToFacebook(job, listing) {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token) throw new Error("Facebook not configured");

  const caption = `${listing?.title || "Check out this"} - ${listing?.price ? `$${listing.price}` : ""}`;

  const res = await fetch(
    `https://graph.facebook.com/v18.0/me/videos`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_url: job.video_url,
        title: listing?.title,
        description: caption,
        access_token: token,
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Facebook API error: ${res.status}`);
  }

  const data = await res.json();
  return {
    postId: data.id,
    url: `https://facebook.com/${data.id}`,
  };
}

async function postToTwitter(job, listing) {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) throw new Error("Twitter not configured");

  const text = `🎬 ${listing?.title || "New product"} ${
    listing?.price ? `- $${listing.price}` : ""
  }\n\n#ProductLaunch #Ecommerce`;

  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      media: {
        media_ids: [job.twitter_media_id],
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Twitter API error: ${res.status}`);
  }

  const data = await res.json();
  return {
    postId: data.data.id,
    url: `https://twitter.com/i/web/status/${data.data.id}`,
  };
}
