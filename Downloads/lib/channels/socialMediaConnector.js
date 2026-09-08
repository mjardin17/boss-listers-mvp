// Social media posting orchestrator
// Handles posting videos/commercials to all social platforms

const SOCIAL_PLATFORMS = {
  instagram: {
    name: "Instagram Reels",
    videoDuration: "15-90s",
    videoFormat: "MP4 (9:16 vertical)",
    maxDescription: 2200,
    hashtags: true,
    requiresAuth: true,
    postUrl: "https://www.instagram.com/",
  },
  tiktok: {
    name: "TikTok",
    videoDuration: "3-60s",
    videoFormat: "MP4 (9:16 vertical)",
    maxDescription: 150,
    hashtags: true,
    requiresAuth: true,
    postUrl: "https://www.tiktok.com/",
  },
  youtube: {
    name: "YouTube Shorts",
    videoDuration: "15-60s",
    videoFormat: "MP4 (9:16 vertical)",
    maxDescription: 5000,
    hashtags: true,
    requiresAuth: true,
    postUrl: "https://www.youtube.com/shorts",
  },
  facebook: {
    name: "Facebook",
    videoDuration: "15-120s",
    videoFormat: "MP4 (any aspect ratio)",
    maxDescription: 63206,
    hashtags: true,
    requiresAuth: true,
    postUrl: "https://www.facebook.com/",
  },
  twitter: {
    name: "Twitter/X",
    videoDuration: "15-140s",
    videoFormat: "MP4 (any aspect ratio)",
    maxDescription: 280,
    hashtags: true,
    requiresAuth: true,
    postUrl: "https://twitter.com/",
  },
  linkedin: {
    name: "LinkedIn",
    videoDuration: "3-600s",
    videoFormat: "MP4 (1:1 or 16:9)",
    maxDescription: 3000,
    hashtags: true,
    requiresAuth: true,
    postUrl: "https://www.linkedin.com/",
  },
  snapchat: {
    name: "Snapchat Spotlight",
    videoDuration: "5-60s",
    videoFormat: "MP4 (9:16 vertical)",
    maxDescription: 150,
    hashtags: false,
    requiresAuth: true,
    postUrl: "https://www.snapchat.com/",
  },
  pinterest: {
    name: "Pinterest",
    videoDuration: "15-60s",
    videoFormat: "MP4 (9:16 vertical)",
    maxDescription: 500,
    hashtags: true,
    requiresAuth: true,
    postUrl: "https://www.pinterest.com/",
  },
};

/**
 * Build platform-specific caption from product info
 */
function buildCaption(product, platform) {
  const { title, description, price, keyFeatures } = product;
  const hashtags = keyFeatures ? keyFeatures.map(f => `#${f.replace(/\s+/g, '')}`).slice(0, 5).join(' ') : '';

  const captions = {
    instagram: () => `${title}\n\n${description}\n\n💰 ${price}\n\n${hashtags}`,
    tiktok: () => `${title} ${price} ${hashtags}`.slice(0, 150),
    youtube: () => `${title}\n\n${description}\n\nAvailable at 27+ marketplaces\n\n${hashtags}`,
    facebook: () => `${title}\n\n${description}\n\n💰 Price: ${price}\n\n${hashtags}`,
    twitter: () => `${title} - ${price} ${hashtags}`.slice(0, 280),
    linkedin: () => `Reselling: ${title}\n\n${description}\n\n${hashtags}`,
    snapchat: () => `${title} ${price}`,
    pinterest: () => `${title}\n${description}\n\n${hashtags}`,
  };

  const buildFn = captions[platform];
  const caption = buildFn ? buildFn() : `${title} - ${price}`;

  const max = SOCIAL_PLATFORMS[platform]?.maxDescription || 280;
  return caption.length > max ? caption.slice(0, max - 3) + '...' : caption;
}

/**
 * Prepare video for each platform
 */
function prepareVideoForPlatform(videoBuffer, platform) {
  const spec = SOCIAL_PLATFORMS[platform];

  return {
    platform,
    video: videoBuffer,
    format: spec.videoFormat,
    maxDuration: spec.videoDuration,
    requiresAuth: spec.requiresAuth,
  };
}

module.exports = {
  SOCIAL_PLATFORMS,
  buildCaption,
  prepareVideoForPlatform,
};
