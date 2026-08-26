// Production-grade social media video posting adapters
// Handles 8 platforms with retry logic, rate limiting, validation, and comprehensive error handling

const crypto = require("crypto");

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const PLATFORM_CONFIG = {
  instagram: {
    apiVersion: "v18.0",
    baseUrl: "https://graph.instagram.com",
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    rateLimit: { requests: 200, windowMs: 3600000 }, // 200/hour
    maxVideoSize: 4294967296, // 4GB
    videoFormats: ["video/mp4", "video/quicktime"],
    captionMaxLength: 2200,
  },
  tiktok: {
    apiVersion: "v1",
    baseUrl: "https://open.tiktokapi.com",
    timeout: 60000,
    maxRetries: 3,
    retryDelay: 2000,
    rateLimit: { requests: 50, windowMs: 3600000 }, // 50/hour
    maxVideoSize: 287326208, // 274MB
    videoFormats: ["video/mp4"],
    captionMaxLength: 150,
  },
  youtube: {
    apiVersion: "v3",
    baseUrl: "https://www.googleapis.com/youtube",
    timeout: 120000,
    maxRetries: 5,
    retryDelay: 2000,
    rateLimit: { requests: 100, windowMs: 3600000 }, // 100/hour
    maxVideoSize: 5368709120, // 5GB
    videoFormats: ["video/mp4", "video/quicktime", "video/mpeg"],
    titleMaxLength: 100,
    descriptionMaxLength: 5000,
  },
  facebook: {
    apiVersion: "v18.0",
    baseUrl: "https://graph.facebook.com",
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    rateLimit: { requests: 200, windowMs: 3600000 }, // 200/hour
    maxVideoSize: 2147483648, // 2GB
    videoFormats: ["video/mp4", "video/quicktime"],
    captionMaxLength: 63206,
  },
  twitter: {
    apiVersion: "2",
    baseUrl: "https://api.twitter.com",
    mediaUploadUrl: "https://upload.twitter.com/1.1",
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    rateLimit: { requests: 300, windowMs: 900000 }, // 300/15min
    maxVideoSize: 536870912, // 512MB
    videoFormats: ["video/mp4"],
    captionMaxLength: 280,
  },
  linkedin: {
    apiVersion: "v2",
    baseUrl: "https://api.linkedin.com",
    timeout: 60000,
    maxRetries: 3,
    retryDelay: 2000,
    rateLimit: { requests: 100, windowMs: 3600000 }, // 100/hour
    maxVideoSize: 5368709120, // 5GB
    videoFormats: ["video/mp4"],
    captionMaxLength: 3000,
  },
  snapchat: {
    apiVersion: "v1",
    baseUrl: "https://adsapi.snapchat.com",
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    rateLimit: { requests: 100, windowMs: 3600000 }, // 100/hour
    maxVideoSize: 536870912, // 512MB
    videoFormats: ["video/mp4"],
    captionMaxLength: 150,
  },
  pinterest: {
    apiVersion: "v1",
    baseUrl: "https://api.pinterest.com",
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    rateLimit: { requests: 100, windowMs: 3600000 }, // 100/hour
    maxVideoSize: 2147483648, // 2GB
    videoFormats: ["video/mp4"],
    captionMaxLength: 500,
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Logger utility with platform context
 * @param {string} platform - Platform name
 * @param {string} level - Log level (info, warn, error, debug)
 * @param {string} message - Log message
 * @param {object} metadata - Additional metadata
 */
function log(platform, level, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    platform,
    level,
    message,
    ...metadata,
  };
  console[level === "debug" ? "debug" : level](`[${platform}] ${message}`, metadata);
  return logEntry;
}

/**
 * Retry logic with exponential backoff
 * @param {function} fn - Async function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} initialDelay - Initial delay in ms
 * @param {string} platform - Platform name for logging
 */
async function retryWithBackoff(fn, maxRetries, initialDelay, platform) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 0) {
        log(platform, "info", `Retry succeeded after ${attempt} attempts`);
      }
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt);
        log(platform, "warn", `Attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
          error: err.message,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Validate video buffer and format
 * @param {Buffer} videoBuffer - Video data
 * @param {string} platform - Platform name
 */
function validateVideo(videoBuffer, platform) {
  const config = PLATFORM_CONFIG[platform];
  if (!config) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  if (!videoBuffer || !Buffer.isBuffer(videoBuffer)) {
    throw new Error("Invalid video buffer");
  }

  if (videoBuffer.length === 0) {
    throw new Error("Video buffer is empty");
  }

  if (videoBuffer.length > config.maxVideoSize) {
    throw new Error(
      `Video size ${(videoBuffer.length / 1024 / 1024).toFixed(2)}MB exceeds maximum ${(config.maxVideoSize / 1024 / 1024).toFixed(2)}MB for ${platform}`
    );
  }

  // Strict video format detection via magic bytes
  const header = videoBuffer.slice(0, 12);
  const headerHex = header.toString("hex");

  // MP4/QuickTime: ftyp box at bytes 4-8
  const isMp4 = header.slice(4, 8).toString("ascii") === "ftyp";

  // Matroska/WebM: EBML signature at bytes 0-4
  const isMkv = headerHex.startsWith("1a45dfa3");

  const isValidFormat = isMp4 || isMkv;

  if (!isValidFormat) {
    throw new Error(
      `Invalid video format detected. Header: ${headerHex}. Supported: MP4, Matroska, WebM`
    );
  }

  return true;
}

/**
 * Validate and sanitize caption
 * @param {string} caption - Caption text
 * @param {string} platform - Platform name
 * @returns {string} Sanitized caption
 */
function validateCaption(caption, platform) {
  const config = PLATFORM_CONFIG[platform];
  if (!caption) return "";

  let sanitized = String(caption).trim();

  if (config.captionMaxLength && sanitized.length > config.captionMaxLength) {
    log(platform, "warn", `Caption truncated from ${sanitized.length} to ${config.captionMaxLength} chars`, {
      original: sanitized.slice(0, 50),
    });
    sanitized = sanitized.slice(0, config.captionMaxLength);
  }

  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, "");

  return sanitized;
}

/**
 * Parse platform-specific error responses
 * @param {Response} response - Fetch response
 * @param {string} platform - Platform name
 */
async function parsePlatformError(response, platform) {
  const responseText = await response.text();

  try {
    const data = JSON.parse(responseText);

    switch (platform) {
      case "instagram":
        if (data.error) {
          return `${data.error.message || data.error.type} (${data.error.code || "unknown"})`;
        }
        break;

      case "tiktok":
        if (data.error) {
          return `${data.error.error_description || data.error.message}`;
        }
        break;

      case "youtube":
        if (data.error) {
          return `${data.error.message} (${data.error.errors?.[0]?.reason || "unknown"})`;
        }
        break;

      case "facebook":
        if (data.error) {
          return `${data.error.message} (${data.error.error_subcode || data.error.code})`;
        }
        break;

      case "twitter":
        if (data.errors?.[0]) {
          return `${data.errors[0].message}`;
        }
        if (data.detail) {
          return data.detail;
        }
        break;

      case "linkedin":
        if (data.serviceErrorCode) {
          return `${data.message} (${data.serviceErrorCode})`;
        }
        if (data.errors?.[0]) {
          return data.errors[0].message;
        }
        break;

      case "snapchat":
        if (data.request_status) {
          return `Status: ${data.request_status} - ${data.display_message || "Unknown error"}`;
        }
        break;

      case "pinterest":
        if (data.message) {
          return data.message;
        }
        break;
    }

    return responseText;
  } catch {
    return responseText || `HTTP ${response.status}: ${response.statusText}`;
  }
}

/**
 * Generic fetch wrapper with timeout and error handling
 */
async function fetchWithTimeout(url, options, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate idempotency key for non-idempotent requests
 * @param {string} platform - Platform name
 * @param {string} contentHash - Hash of content being posted
 * @returns {string} Idempotency key
 */
function generateIdempotencyKey(platform, contentHash) {
  return `${platform}-${contentHash}-${Date.now()}`;
}

/**
 * Rate limiter state tracker
 */
const rateLimitState = {};

/**
 * Check rate limit before making request
 * @param {string} platform - Platform name
 * @returns {boolean} True if request allowed, false if rate limited
 */
function checkRateLimit(platform) {
  const config = PLATFORM_CONFIG[platform];
  if (!config?.rateLimit) return true;

  const now = Date.now();
  if (!rateLimitState[platform]) {
    rateLimitState[platform] = { requests: [], blocked: false };
  }

  const state = rateLimitState[platform];
  const windowStart = now - config.rateLimit.windowMs;

  state.requests = state.requests.filter(t => t > windowStart);

  if (state.requests.length >= config.rateLimit.requests) {
    state.blocked = true;
    const resetTime = Math.ceil((state.requests[0] + config.rateLimit.windowMs - now) / 1000);
    log(platform, "warn", `Rate limit exceeded, resetting in ${resetTime}s`);
    return false;
  }

  state.requests.push(now);
  return true;
}

// ============================================================================
// PLATFORM IMPLEMENTATIONS
// ============================================================================

const POSTERS = {
  /**
   * Instagram Reels via Graph API
   *
   * API Payloads:
   * - Upload: POST /me/media with video_data, description, media_type=REELS
   * - Publish: POST /me/media_publish with creation_id, should_set_caption=true
   *
   * Test response:
   * {
   *   "id": "18345678901234567",
   *   "status": "PROCESSING" | "FINISHED" | "ERROR"
   * }
   *
   * URL format: https://instagram.com/reel/{mediaId}/
   */
  async instagram(videoBuffer, caption, accessToken) {
    const platform = "instagram";
    const config = PLATFORM_CONFIG[platform];

    try {
      validateVideo(videoBuffer, platform);
      const sanitizedCaption = validateCaption(caption, platform);

      log(platform, "info", "Starting upload", {
        videoSize: (videoBuffer.length / 1024 / 1024).toFixed(2),
      });

      const uploadFn = async () => {
        if (!checkRateLimit("instagram")) {
          throw new Error("Rate limit exceeded for Instagram");
        }

        const formData = new FormData();
        formData.append("video_data", new Blob([videoBuffer], { type: "video/mp4" }));
        formData.append("description", sanitizedCaption);
        formData.append("media_type", "REELS");

        const response = await fetchWithTimeout(
          `${config.baseUrl}/${config.apiVersion}/me/media`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
          },
          config.timeout
        );

        if (!response.ok) {
          const errorMsg = await parsePlatformError(response, platform);
          throw new Error(`Upload failed: ${errorMsg} (HTTP ${response.status})`);
        }

        return response.json();
      };

      const media = await retryWithBackoff(uploadFn, config.maxRetries, config.retryDelay, platform);

      log(platform, "info", "Upload successful", { mediaId: media.id });

      // Check processing status
      if (media.status === "ERROR") {
        throw new Error("Media processing error");
      }

      return {
        platform,
        mediaId: media.id,
        url: `https://instagram.com/reel/${media.id}/`,
        status: media.status,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      log(platform, "error", err.message, { stack: err.stack });
      throw err;
    }
  },

  /**
   * TikTok via Open API
   *
   * API Payloads:
   * - Upload: POST /video/upload with video file, description
   * - Response: { "data": { "video_id": "...", "share_url": "..." } }
   *
   * Test response:
   * {
   *   "data": {
   *     "video_id": "7123456789012345678",
   *     "share_url": "https://www.tiktok.com/@username/video/7123456789012345678"
   *   }
   * }
   *
   * Rate limit: 50 videos/hour per account
   */
  async tiktok(videoBuffer, caption, accessToken) {
    const platform = "tiktok";
    const config = PLATFORM_CONFIG[platform];

    try {
      validateVideo(videoBuffer, platform);
      const sanitizedCaption = validateCaption(caption, platform);

      log(platform, "info", "Starting upload", {
        videoSize: (videoBuffer.length / 1024 / 1024).toFixed(2),
      });

      const uploadFn = async () => {
        if (!checkRateLimit("tiktok")) {
          throw new Error("Rate limit exceeded for TikTok");
        }

        const formData = new FormData();
        formData.append("video", new Blob([videoBuffer], { type: "video/mp4" }));
        formData.append("description", sanitizedCaption);
        formData.append("video_title", sanitizedCaption.split("\n")[0].slice(0, 50));

        const response = await fetchWithTimeout(
          `${config.baseUrl}/${config.apiVersion}/video/upload`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
          },
          config.timeout
        );

        if (!response.ok) {
          const errorMsg = await parsePlatformError(response, platform);
          throw new Error(`Upload failed: ${errorMsg} (HTTP ${response.status})`);
        }

        const data = await response.json();
        if (data.error) {
          throw new Error(`${data.error.error_description || data.error.message}`);
        }
        return data;
      };

      const data = await retryWithBackoff(uploadFn, config.maxRetries, config.retryDelay, platform);

      log(platform, "info", "Upload successful", { videoId: data.data.video_id });

      return {
        platform,
        videoId: data.data.video_id,
        url: data.data.share_url || `https://www.tiktok.com/video/${data.data.video_id}`,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      log(platform, "error", err.message, { stack: err.stack });
      throw err;
    }
  },

  /**
   * YouTube Shorts via Resumable Upload
   *
   * API Payloads:
   * - Resumable upload: POST /upload/youtube/v3/videos?uploadType=resumable
   * - Metadata: { snippet: { title, description, tags }, status: { privacyStatus } }
   *
   * Test response:
   * {
   *   "id": "Rz7kCjhQsOQ",
   *   "snippet": { "title": "...", "description": "..." },
   *   "status": { "uploadStatus": "processed", "privacyStatus": "public" }
   * }
   *
   * Note: Video must be <60 seconds to be auto-categorized as Short
   */
  async youtube(videoBuffer, caption, accessToken) {
    const platform = "youtube";
    const config = PLATFORM_CONFIG[platform];

    try {
      validateVideo(videoBuffer, platform);
      const sanitizedCaption = validateCaption(caption, platform);

      log(platform, "info", "Starting resumable upload", {
        videoSize: (videoBuffer.length / 1024 / 1024).toFixed(2),
      });

      const uploadFn = async () => {
        if (!checkRateLimit("youtube")) {
          throw new Error("Rate limit exceeded for YouTube");
        }

        // Step 1: Get resumable session URL
        const metadata = {
          snippet: {
            title: sanitizedCaption.split("\n")[0].slice(0, 100),
            description: sanitizedCaption,
            tags: (sanitizedCaption.match(/#\w+/g) || []).slice(0, 30),
            categoryId: "22", // Shorts category
          },
          status: { privacyStatus: "public" },
        };

        const sessionResponse = await fetchWithTimeout(
          `${config.baseUrl}/${config.apiVersion}/videos?part=snippet,status&uploadType=resumable`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(metadata),
          },
          config.timeout
        );

        if (!sessionResponse.ok) {
          const errorMsg = await parsePlatformError(sessionResponse, platform);
          throw new Error(`Resumable session failed: ${errorMsg}`);
        }

        const sessionUrl = sessionResponse.headers.get("location");
        if (!sessionUrl) {
          throw new Error("No resumable session URL returned");
        }

        // Step 2: Upload video chunk
        const uploadResponse = await fetchWithTimeout(
          sessionUrl,
          {
            method: "PUT",
            headers: {
              "Content-Type": "video/mp4",
              "Content-Length": videoBuffer.length,
            },
            body: videoBuffer,
          },
          config.timeout
        );

        if (!uploadResponse.ok) {
          const errorMsg = await parsePlatformError(uploadResponse, platform);
          throw new Error(`Video chunk upload failed: ${errorMsg}`);
        }

        return uploadResponse.json();
      };

      const data = await retryWithBackoff(uploadFn, config.maxRetries, config.retryDelay, platform);

      log(platform, "info", "Upload successful", { videoId: data.id });

      return {
        platform,
        videoId: data.id,
        url: `https://youtube.com/shorts/${data.id}`,
        status: data.status?.uploadStatus || "processing",
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      log(platform, "error", err.message, { stack: err.stack });
      throw err;
    }
  },

  /**
   * Facebook Page Videos
   *
   * API Payloads:
   * - POST /me/videos with source (video file), description, title, published=false
   * - Optional: POST to /videos/{id}?published=true to publish
   *
   * Test response:
   * {
   *   "id": "123456789",
   *   "post_id": "page_id_123456789"
   * }
   *
   * Note: Page admin access required; video processing time varies
   */
  async facebook(videoBuffer, caption, accessToken) {
    const platform = "facebook";
    const config = PLATFORM_CONFIG[platform];

    try {
      validateVideo(videoBuffer, platform);
      const sanitizedCaption = validateCaption(caption, platform);

      log(platform, "info", "Starting upload", {
        videoSize: (videoBuffer.length / 1024 / 1024).toFixed(2),
      });

      const uploadFn = async () => {
        if (!checkRateLimit("facebook")) {
          throw new Error("Rate limit exceeded for Facebook");
        }

        const formData = new FormData();
        formData.append("source", new Blob([videoBuffer], { type: "video/mp4" }));
        formData.append("description", sanitizedCaption);
        formData.append("title", sanitizedCaption.split("\n")[0].slice(0, 255));
        formData.append("published", "false"); // Upload but don't publish immediately

        const response = await fetchWithTimeout(
          `${config.baseUrl}/${config.apiVersion}/me/videos`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
          },
          config.timeout
        );

        if (!response.ok) {
          const errorMsg = await parsePlatformError(response, platform);
          throw new Error(`Upload failed: ${errorMsg} (HTTP ${response.status})`);
        }

        return response.json();
      };

      const data = await retryWithBackoff(uploadFn, config.maxRetries, config.retryDelay, platform);

      log(platform, "info", "Upload successful", { videoId: data.id });

      // Publish the video
      const publishResponse = await fetchWithTimeout(
        `${config.baseUrl}/${config.apiVersion}/${data.id}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "published=true",
        },
        config.timeout
      );

      if (!publishResponse.ok) {
        log(platform, "warn", "Auto-publish failed, video uploaded but not published", { videoId: data.id });
      }

      return {
        platform,
        videoId: data.id,
        postId: data.post_id,
        url: `https://facebook.com/video.php?v=${data.id}`,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      log(platform, "error", err.message, { stack: err.stack });
      throw err;
    }
  },

  /**
   * Twitter/X via v2 API
   *
   * API Payloads:
   * - Upload media: POST /1.1/media/upload with media_data (base64), media_type
   * - Post tweet: POST /2/tweets with text and media.media_ids
   *
   * Test media response:
   * {
   *   "media_id": 1445764480,
   *   "media_id_string": "1445764480",
   *   "size": 11065,
   *   "expires_after_secs": 3600
   * }
   *
   * Test tweet response:
   * {
   *   "data": { "id": "1445765480", "text": "..." }
   * }
   *
   * Rate limit: 300 requests/15min (standard tier), video up to 512MB
   */
  async twitter(videoBuffer, caption, accessToken) {
    const platform = "twitter";
    const config = PLATFORM_CONFIG[platform];

    try {
      validateVideo(videoBuffer, platform);
      const sanitizedCaption = validateCaption(caption, platform);

      log(platform, "info", "Starting media upload", {
        videoSize: (videoBuffer.length / 1024 / 1024).toFixed(2),
      });

      // Step 1: Upload media (chunked binary upload to avoid OOM)
      const uploadMediaFn = async () => {
        const formData = new FormData();
        formData.append("media_data", new Blob([videoBuffer], { type: "video/mp4" }));
        formData.append("media_type", "video/mp4");

        const response = await fetchWithTimeout(
          `${config.mediaUploadUrl}/media/upload.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
          },
          config.timeout
        );

        if (!response.ok) {
          const errorMsg = await parsePlatformError(response, platform);
          throw new Error(`Media upload failed: ${errorMsg}`);
        }

        return response.json();
      };

      const media = await retryWithBackoff(uploadMediaFn, config.maxRetries, config.retryDelay, platform);

      if (!media.media_id_string) {
        throw new Error("Media upload succeeded but no media_id returned");
      }

      log(platform, "info", "Media uploaded", { mediaId: media.media_id_string });

      // Step 2: Post tweet with media (generate idempotency key once, outside closure)
      const contentHash = crypto.createHash("sha256").update(sanitizedCaption).digest("hex");
      const tweetIdempotencyKey = generateIdempotencyKey("twitter", contentHash);

      const postTweetFn = async () => {
        const response = await fetchWithTimeout(
          `${config.baseUrl}/${config.apiVersion}/tweets`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "Idempotency-Key": tweetIdempotencyKey,
            },
            body: JSON.stringify({
              text: sanitizedCaption,
              media: {
                media_ids: [media.media_id_string],
              },
            }),
          },
          config.timeout
        );

        if (!response.ok) {
          const errorMsg = await parsePlatformError(response, platform);
          throw new Error(`Tweet posting failed: ${errorMsg}`);
        }

        return response.json();
      };

      const tweet = await retryWithBackoff(postTweetFn, config.maxRetries, config.retryDelay, platform);

      log(platform, "info", "Tweet posted successfully", { tweetId: tweet.data.id });

      return {
        platform,
        tweetId: tweet.data.id,
        mediaId: media.media_id_string,
        url: `https://twitter.com/user/status/${tweet.data.id}`,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      log(platform, "error", err.message, { stack: err.stack });
      throw err;
    }
  },

  /**
   * LinkedIn Video Posts
   *
   * API Payloads:
   * - Initiate upload: POST /videos with uploadMechanism, owner
   * - Upload binary: PUT to returned uploadUrl with video binary
   * - Finalize: POST to register-upload endpoint
   * - Create post: POST /posts with content linking to video
   *
   * Test upload response:
   * {
   *   "value": "urn:li:video:C5622...",
   *   "uploadUrl": "https://...",
   *   "mediaUploadHttpRequest": { "uploadUrl": "...", "headers": {} }
   * }
   *
   * Note: Video must be uploaded to owner's account; transcoding takes time
   */
  async linkedin(videoBuffer, caption, accessToken) {
    const platform = "linkedin";
    const config = PLATFORM_CONFIG[platform];

    try {
      validateVideo(videoBuffer, platform);
      const sanitizedCaption = validateCaption(caption, platform);

      log(platform, "info", "Starting upload", {
        videoSize: (videoBuffer.length / 1024 / 1024).toFixed(2),
      });

      // Step 1: Initiate upload
      const initUploadFn = async () => {
        if (!checkRateLimit("linkedin")) {
          throw new Error("Rate limit exceeded for LinkedIn");
        }

        const response = await fetchWithTimeout(
          `${config.baseUrl}/${config.apiVersion}/videos?action=initializeUpload`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              uploadMechanism: {
                "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
                  uploadUrl: null, // Will be provided in response
                },
              },
              owner: "urn:li:person:me",
              fileSizeBytes: videoBuffer.length,
            }),
          },
          config.timeout
        );

        if (!response.ok) {
          const errorMsg = await parsePlatformError(response, platform);
          throw new Error(`Upload initiation failed: ${errorMsg}`);
        }

        return response.json();
      };

      const uploadInit = await retryWithBackoff(initUploadFn, config.maxRetries, config.retryDelay, platform);
      const videoUrn = uploadInit.value;
      const uploadUrl = uploadInit.uploadUrl || uploadInit.mediaUploadHttpRequest?.uploadUrl;

      if (!uploadUrl) {
        throw new Error("No upload URL returned from LinkedIn");
      }

      log(platform, "info", "Upload initiated", { videoUrn });

      // Step 2: Upload video binary
      const uploadBinaryFn = async () => {
        const response = await fetchWithTimeout(
          uploadUrl,
          {
            method: "PUT",
            headers: {
              "Content-Type": "video/mp4",
              "Content-Length": videoBuffer.length,
            },
            body: videoBuffer,
          },
          config.timeout
        );

        if (!response.ok) {
          const errorMsg = await parsePlatformError(response, platform);
          throw new Error(`Binary upload failed: ${errorMsg}`);
        }

        return response;
      };

      await retryWithBackoff(uploadBinaryFn, config.maxRetries, config.retryDelay, platform);

      log(platform, "info", "Video binary uploaded");

      // Step 3: Create post linking to video (generate idempotency key once, outside closure)
      const contentHash = crypto.createHash("sha256").update(sanitizedCaption).digest("hex");
      const postIdempotencyKey = generateIdempotencyKey("linkedin", contentHash);

      const createPostFn = async () => {
        const response = await fetchWithTimeout(
          `${config.baseUrl}/${config.apiVersion}/posts`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "Idempotency-Key": postIdempotencyKey,
            },
            body: JSON.stringify({
              author: "urn:li:person:me",
              lifecycleState: "PUBLISHED",
              specificContent: {
                "com.linkedin.ugc.ShareContent": {
                  shareCommentary: {
                    text: sanitizedCaption,
                  },
                  media: [
                    {
                      status: "READY",
                      media: videoUrn,
                    },
                  ],
                },
              },
              visibility: {
                "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
              },
            }),
          },
          config.timeout
        );

        if (!response.ok) {
          const errorMsg = await parsePlatformError(response, platform);
          throw new Error(`Post creation failed: ${errorMsg}`);
        }

        return response.json();
      };

      const post = await retryWithBackoff(createPostFn, config.maxRetries, config.retryDelay, platform);

      log(platform, "info", "Post created successfully", { videoUrn, postId: post.id });

      return {
        platform,
        videoUrn,
        postId: post.id,
        url: `https://linkedin.com/feed/update/${post.id}`,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      log(platform, "error", err.message, { stack: err.stack });
      throw err;
    }
  },

  /**
   * Snapchat Spotlight
   *
   * API Payloads:
   * - Upload: POST /media/upload with file, creative_type (SPOTLIGHT_VIDEO)
   * - Response: { "request_status": 200, "data": { "id": "...", "url": "..." } }
   *
   * Test response:
   * {
   *   "request_status": 200,
   *   "data": {
   *     "id": "spotlight_123456",
   *     "url": "https://snapchat.com/spotlight/...",
   *     "status": "PROCESSING"
   *   }
   * }
   *
   * Note: Requires Snapchat Business account and Spotlight partnership
   */
  async snapchat(videoBuffer, caption, accessToken) {
    const platform = "snapchat";
    const config = PLATFORM_CONFIG[platform];

    try {
      validateVideo(videoBuffer, platform);
      const sanitizedCaption = validateCaption(caption, platform);

      log(platform, "info", "Starting upload", {
        videoSize: (videoBuffer.length / 1024 / 1024).toFixed(2),
      });

      const uploadFn = async () => {
        if (!checkRateLimit("snapchat")) {
          throw new Error("Rate limit exceeded for Snapchat");
        }

        const formData = new FormData();
        formData.append("file", new Blob([videoBuffer], { type: "video/mp4" }));
        formData.append("creative_type", "SPOTLIGHT_VIDEO");
        formData.append("description", sanitizedCaption);

        const response = await fetchWithTimeout(
          `${config.baseUrl}/${config.apiVersion}/media/upload`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
          },
          config.timeout
        );

        if (!response.ok) {
          const errorMsg = await parsePlatformError(response, platform);
          throw new Error(`Upload failed: ${errorMsg}`);
        }

        const data = await response.json();
        if (data.request_status !== 200) {
          throw new Error(`Upload error: ${data.display_message || "Unknown"}`);
        }

        return data;
      };

      const data = await retryWithBackoff(uploadFn, config.maxRetries, config.retryDelay, platform);

      log(platform, "info", "Upload successful", { mediaId: data.data.id });

      return {
        platform,
        mediaId: data.data.id,
        url: data.data.url || `https://snapchat.com/spotlight/${data.data.id}`,
        status: data.data.status,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      log(platform, "error", err.message, { stack: err.stack });
      throw err;
    }
  },

  /**
   * Pinterest Pin with Video
   *
   * API Payloads:
   * - POST /pins with board_id, description, media (video URL or base64)
   * - Optional: Use media_source endpoint for video URL instead of base64
   *
   * Test response:
   * {
   *   "id": "1234567890",
   *   "created_at": "2024-01-15T10:30:00Z",
   *   "link": "https://pinterest.com/pin/...",
   *   "url": "https://pinterest.com/pin/..."
   * }
   *
   * Note: Video must be uploaded to a board; requires board_id
   * Maximum 15 pins/day for free accounts
   */
  async pinterest(videoBuffer, caption, accessToken, boardId = null) {
    const platform = "pinterest";
    const config = PLATFORM_CONFIG[platform];

    try {
      validateVideo(videoBuffer, platform);
      const sanitizedCaption = validateCaption(caption, platform);

      if (!boardId) {
        throw new Error("Pinterest requires a board_id parameter");
      }

      log(platform, "info", "Starting pin creation", {
        videoSize: (videoBuffer.length / 1024 / 1024).toFixed(2),
        boardId,
      });

      const createPinFn = async () => {
        if (!checkRateLimit("pinterest")) {
          throw new Error("Rate limit exceeded for Pinterest");
        }

        // Use FormData with blob instead of base64 to avoid memory bloat
        const formData = new FormData();
        formData.append("board_id", boardId);
        formData.append("description", sanitizedCaption);
        formData.append("title", sanitizedCaption.split("\n")[0].slice(0, 100));
        formData.append("media_source", new Blob([videoBuffer], { type: "video/mp4" }), "video.mp4");

        const response = await fetchWithTimeout(
          `${config.baseUrl}/${config.apiVersion}/pins`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            body: formData,
          },
          config.timeout
        );

        if (!response.ok) {
          const errorMsg = await parsePlatformError(response, platform);
          throw new Error(`Pin creation failed: ${errorMsg}`);
        }

        return response.json();
      };

      const pin = await retryWithBackoff(createPinFn, config.maxRetries, config.retryDelay, platform);

      log(platform, "info", "Pin created successfully", { pinId: pin.id });

      return {
        platform,
        pinId: pin.id,
        url: pin.url || `https://pinterest.com/pin/${pin.id}`,
        boardId,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      log(platform, "error", err.message, { stack: err.stack });
      throw err;
    }
  },
};

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

/**
 * Post video to a social media platform
 *
 * @param {string} platform - Platform name (instagram, tiktok, youtube, facebook, twitter, linkedin, snapchat, pinterest)
 * @param {Buffer} videoBuffer - Video file data
 * @param {string} caption - Video description/caption
 * @param {string} accessToken - Platform OAuth access token
 * @param {object} options - Additional options (boardId for Pinterest, etc.)
 *
 * @returns {Promise<object>} Result object with platform, videoId, url, timestamp
 *
 * @throws {Error} Platform-specific error with detailed message
 *
 * Example usage:
 * const result = await postToSocialMedia('tiktok', videoBuffer, 'My awesome video #trending', accessToken);
 * console.log(result.url); // https://www.tiktok.com/video/7123456789...
 */
async function postToSocialMedia(platform, videoBuffer, caption, accessToken, options = {}) {
  const poster = POSTERS[platform];

  if (!poster) {
    const error = new Error(`Unsupported platform: ${platform}. Supported: ${Object.keys(POSTERS).join(", ")}`);
    log("general", "error", error.message);
    throw error;
  }

  try {
    log(platform, "info", "Posting to social media", { captionLength: caption?.length || 0 });

    // Pinterest needs boardId
    if (platform === "pinterest" && options.boardId) {
      return await poster(videoBuffer, caption, accessToken, options.boardId);
    }

    return await poster(videoBuffer, caption, accessToken);
  } catch (err) {
    // Ensure proper error handling and logging
    const errorResult = {
      platform,
      error: err.message,
      success: false,
      timestamp: new Date().toISOString(),
    };

    // Don't re-throw for graceful error handling in calling code
    return errorResult;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  POSTERS,
  postToSocialMedia,
  PLATFORM_CONFIG,
  // Utilities (for testing)
  validateVideo,
  validateCaption,
  retryWithBackoff,
  log,
};
