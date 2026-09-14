import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PLATFORM_CONFIGS = {
  tiktok: {
    endpoint: 'https://api.tiktok.com/v1/post/publish/action/publish/',
    requires: ['TIKTOK_OAUTH_ACCESS_TOKEN'],
  },
  instagram: {
    endpoint: 'https://graph.instagram.com/v18.0/me/media',
    requires: ['INSTAGRAM_ACCESS_TOKEN'],
  },
  youtube: {
    endpoint: 'https://youtube.googleapis.com/youtube/v3/videos?part=snippet,status',
    requires: ['YOUTUBE_OAUTH_ACCESS_TOKEN'],
  },
  facebook: {
    endpoint: 'https://graph.facebook.com/v18.0/me/feed',
    requires: ['FB_ACCESS_TOKEN'],
  },
};

async function postToTikTok(caption, videoUrl, hashtags) {
  try {
    const response = await fetch(PLATFORM_CONFIGS.tiktok.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TIKTOK_OAUTH_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_url: videoUrl,
        caption: `${caption}\n${hashtags.join(' ')}`,
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
      }),
    });

    const data = await response.json();
    return { success: response.ok, platform: 'tiktok', data };
  } catch (error) {
    return { success: false, platform: 'tiktok', error: error.message };
  }
}

async function postToInstagram(caption, imageUrl, hashtags) {
  try {
    // First create media
    const mediaResponse = await fetch(PLATFORM_CONFIGS.instagram.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.INSTAGRAM_ACCESS_TOKEN}`,
      },
      body: new URLSearchParams({
        image_url: imageUrl,
        caption: `${caption}\n${hashtags.join(' ')}`,
        user_id: process.env.INSTAGRAM_USER_ID,
      }),
    });

    const mediaData = await mediaResponse.json();

    if (!mediaData.id) {
      throw new Error('Failed to create media');
    }

    // Then publish
    const publishResponse = await fetch(
      `https://graph.instagram.com/v18.0/${mediaData.id}/publish`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.INSTAGRAM_ACCESS_TOKEN}`,
        },
      }
    );

    const result = await publishResponse.json();
    return { success: publishResponse.ok, platform: 'instagram', data: result };
  } catch (error) {
    return { success: false, platform: 'instagram', error: error.message };
  }
}

async function postToFacebook(caption, imageUrl, hashtags) {
  try {
    const response = await fetch(PLATFORM_CONFIGS.facebook.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.FB_ACCESS_TOKEN}`,
      },
      body: new URLSearchParams({
        message: `${caption}\n${hashtags.join(' ')}`,
        picture: imageUrl,
        link: imageUrl,
      }),
    });

    const data = await response.json();
    return { success: response.ok, platform: 'facebook', data };
  } catch (error) {
    return { success: false, platform: 'facebook', error: error.message };
  }
}

async function postToYouTube(caption, videoUrl, hashtags) {
  try {
    const response = await fetch(PLATFORM_CONFIGS.youtube.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.YOUTUBE_OAUTH_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippet: {
          title: caption.substring(0, 100),
          description: `${caption}\n${hashtags.join(' ')}\n\nVideo URL: ${videoUrl}`,
          tags: hashtags,
          categoryId: '22', // People & Blogs
        },
        status: {
          privacyStatus: 'public',
          madeForKids: false,
        },
      }),
    });

    const data = await response.json();
    return { success: response.ok, platform: 'youtube', data };
  } catch (error) {
    return { success: false, platform: 'youtube', error: error.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { caption, imageUrl, videoUrl, hashtags, platforms = ['tiktok', 'instagram', 'facebook'] } = req.body;

    if (!caption) {
      return res.status(400).json({ error: 'Missing caption' });
    }

    const results = [];

    // Post to requested platforms
    for (const platform of platforms) {
      if (platform === 'tiktok' && videoUrl) {
        const result = await postToTikTok(caption, videoUrl, hashtags || []);
        results.push(result);
      } else if (platform === 'instagram' && imageUrl) {
        const result = await postToInstagram(caption, imageUrl, hashtags || []);
        results.push(result);
      } else if (platform === 'facebook' && imageUrl) {
        const result = await postToFacebook(caption, imageUrl, hashtags || []);
        results.push(result);
      } else if (platform === 'youtube' && videoUrl) {
        const result = await postToYouTube(caption, videoUrl, hashtags || []);
        results.push(result);
      }
    }

    // Store crosspost results
    await supabase.from('social_posts').insert({
      caption,
      platforms: platforms,
      results,
      created_at: new Date().toISOString(),
    });

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return res.status(200).json({
      success: true,
      total: results.length,
      succeeded: successCount,
      failed: failureCount,
      results,
    });
  } catch (error) {
    console.error('Crosspost error:', error);
    return res.status(500).json({ error: error.message });
  }
}
