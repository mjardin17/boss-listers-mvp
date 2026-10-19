// Comprehensive test suite for social media posters
// Shows expected API payloads, responses, and error handling

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  POSTERS,
  postToSocialMedia,
  validateVideo,
  validateCaption,
  PLATFORM_CONFIG,
} = require("./socialMediaPosters");

/**
 * ============================================================================
 * TEST DATA STRUCTURES & MOCK RESPONSES
 * ============================================================================
 */

// Sample video buffer (minimal MP4 header for testing)
const createMockVideoBuffer = (sizeInMB = 10) => {
  const size = Math.round(sizeInMB * 1024 * 1024);
  const buffer = Buffer.alloc(size);
  buffer.writeUInt32BE(0x0000001c, 0);
  buffer.write("ftypisom", 4);
  return buffer;
};

const SAMPLE_CAPTION =
  "Check out this amazing video! 🎬 #viral #trending #reels #shorts #content";

/**
 * PLATFORM-SPECIFIC MOCK API RESPONSES
 */
const MOCK_RESPONSES = {
  instagram: {
    upload: {
      id: "18345678901234567",
      status: "PROCESSING",
    },
    statusCheck: {
      id: "18345678901234567",
      status: "FINISHED",
      media_type: "REELS",
    },
    error: {
      error: {
        message: "Invalid OAuth access token.",
        type: "OAuthException",
        code: 190,
        fbtrace_id: "ABCD1234",
      },
    },
  },

  tiktok: {
    success: {
      data: {
        video_id: "7123456789012345678",
        share_url: "https://www.tiktok.com/@username/video/7123456789012345678",
        download_addr: "https://v16-web.tiktok.com/video/7123456789012345678.mp4",
        play_addr: "https://v16-web.tiktok.com/video/7123456789012345678.mp4",
      },
      status_code: 0,
      status_msg: "ok",
    },
    rateLimitError: {
      error: {
        message: "You have exceeded the rate limit.",
        error_description: "429 Too Many Requests",
        error_code: 429,
      },
      status_code: 429,
      status_msg: "Rate limit exceeded",
    },
    invalidVideoError: {
      error: {
        message: "Video format not supported.",
        error_description: "Only MP4 format is supported",
        error_code: 10001,
      },
    },
  },

  youtube: {
    success: {
      kind: "youtube#video",
      etag: "test_etag_123",
      id: "Rz7kCjhQsOQ",
      snippet: {
        publishedAt: "2024-01-15T10:30:00Z",
        title: "My Awesome Short Video",
        description:
          "Check out this amazing video! 🎬 #viral #trending #reels #shorts #content",
        thumbnails: {
          default: { url: "https://i.ytimg.com/vi/Rz7kCjhQsOQ/default.jpg" },
          medium: { url: "https://i.ytimg.com/vi/Rz7kCjhQsOQ/mqdefault.jpg" },
          high: { url: "https://i.ytimg.com/vi/Rz7kCjhQsOQ/hqdefault.jpg" },
        },
      },
      status: {
        uploadStatus: "processed",
        privacyStatus: "public",
        publishedAt: "2024-01-15T10:30:00Z",
      },
    },
    incompleteUploadError: {
      error: {
        code: 400,
        message: "Invalid value for: video body",
        errors: [
          {
            domain: "youtube.video",
            reason: "videoNotProcessed",
            message: "Video not processed",
          },
        ],
      },
    },
  },

  facebook: {
    success: {
      id: "123456789012345",
      post_id: "100001234567890_123456789012345",
      video_data: {
        length: 1024000,
        image: "https://example.com/thumb.jpg",
      },
    },
    invalidToken: {
      error: {
        message:
          "The user has not granted the app the permission to access their videos.",
        type: "FacebookApiException",
        code: 10,
        error_subcode: 2206357,
        error_user_title: "No Permission",
        error_user_msg:
          "You do not have permission to upload videos to this account.",
        fbtrace_id: "ABCD1234",
      },
    },
    videoTooLarge: {
      error: {
        message: "Invalid parameter",
        type: "FacebookApiException",
        code: 100,
        error_subcode: 1234567,
        fbtrace_id: "ABCD1234",
      },
    },
  },

  twitter: {
    mediaUpload: {
      media_id: 1445764480,
      media_id_string: "1445764480",
      media_key: "7_1445764480",
      size: 11065,
      expires_after_secs: 3600,
      image: {
        image_type: "image/mp4",
        w: 1280,
        h: 720,
      },
    },
    tweetResponse: {
      data: {
        id: "1445765480",
        text: "Check out this amazing video! 🎬 #viral #trending #reels #shorts #content",
        edit_history_tweet_ids: ["1445765480"],
      },
    },
    mediaProcessingError: {
      errors: [
        {
          value: "12345",
          message: "Media ID expired or invalid",
          code: 144,
        },
      ],
      title: "Bad Request",
      detail: "One or more parameters to your request was invalid.",
      type: "https://api.twitter.com/2/problems/resource-not-found",
    },
  },

  linkedin: {
    uploadInit: {
      value: "urn:li:video:C5622AQEBSa5ZLh3BT2g",
      uploadUrl: "https://media-upload.linkedin.com/upload-video",
      mediaUploadHttpRequest: {
        uploadUrl: "https://media-upload.linkedin.com/upload-video",
        headers: {
          "X-Upload-Authorization": "AuthToken",
        },
      },
    },
    postCreation: {
      id: "urn:li:activity:6823456789012345678",
      urn: "urn:li:activity:6823456789012345678",
      createdTime: 1642253400000,
      created: {
        actor: "urn:li:person:ABC123XYZ",
        time: 1642253400000,
      },
      lastModifiedTime: 1642253400000,
    },
    serviceError: {
      serviceErrorCode: 503,
      message: "Service temporarily unavailable",
      errors: [
        {
          message: "Unable to upload video at this time",
        },
      ],
    },
  },

  snapchat: {
    success: {
      request_status: 200,
      request_id: "req_123456",
      data: {
        id: "spotlight_abc123def456",
        url: "https://snapchat.com/spotlight/abc123def456",
        status: "PROCESSING",
        created_at: "2024-01-15T10:30:00Z",
      },
    },
    invalidToken: {
      request_status: 401,
      request_id: "req_123456",
      display_message: "Unauthorized",
      debug_message: "Invalid access token",
    },
    notApproved: {
      request_status: 400,
      request_id: "req_123456",
      display_message: "Invalid request",
      debug_message: "User not eligible for Spotlight uploads",
    },
  },

  pinterest: {
    registerMedia: {
      media_id: "1234567890",
      upload_url: "https://pinterest-media-upload.s3.amazonaws.com/",
      upload_parameters: {
        key: "media/1234567890.mp4",
        AWSAccessKeyId: "EXAMPLE_KEY",
        policy: "eyAiZXhwaXJhdGlvbiI6ICIyMDI0LTAxLTAxVDEyOjAwOjAwWiIsImNvbmRpdGlvbnMiOiBbXSB9",
        signature: "vjbyPxybdZaNmGa+riT27DhKWYc=",
      },
    },
    mediaStatus: {
      media_id: "1234567890",
      status: "succeeded",
    },
    success: {
      id: "1234567890",
      url: "https://www.pinterest.com/pin/1234567890/",
      created_at: "2024-01-15T10:30:00Z",
      title: "My pin",
      description: "My pin",
      board_id: "board_12345",
    },
    rateLimitError: {
      message: "You have reached your daily pin limit.",
      code: 9001,
    },
    invalidBoardError: {
      message: "Board not found or access denied.",
      code: 3001,
    },
  },
};

/**
 * ============================================================================
 * UNIT TESTS
 * ============================================================================
 */

test("Video Validation - accepts valid buffer", () => {
  const buffer = createMockVideoBuffer(10);
  assert.doesNotThrow(() => validateVideo(buffer, "tiktok"));
});

test("Video Validation - rejects empty buffer", () => {
  assert.throws(() => validateVideo(Buffer.alloc(0), "tiktok"), /empty/);
});

test("Video Validation - rejects oversized video", () => {
  const buffer = Buffer.alloc(300 * 1024 * 1024);
  assert.throws(() => validateVideo(buffer, "tiktok"), /exceeds maximum/);
});

test("Video Validation - rejects non-buffer input", () => {
  assert.throws(() => validateVideo("not a buffer", "tiktok"), /Invalid video buffer/);
});

test("Caption Validation - truncates long captions", () => {
  const longCaption = "a".repeat(3000);
  const result = validateCaption(longCaption, "tiktok");
  assert.ok(result.length <= 2200);
});

test("Caption Validation - preserves valid captions", () => {
  const caption = "My awesome video #trending";
  assert.equal(validateCaption(caption, "tiktok"), caption);
});

test("Caption Validation - removes control characters", () => {
  const caption = "My video\x00\x01\x02";
  const result = validateCaption(caption, "tiktok");
  assert.ok(!result.includes("\x00"));
});

test("Caption Validation - handles empty input", () => {
  assert.equal(validateCaption("", "tiktok"), "");
  assert.equal(validateCaption(null, "tiktok"), "");
});

/**
 * ============================================================================
 * INTEGRATION TESTS (with mocked fetch)
 * ============================================================================
 */

test("Instagram Poster - successful Instagram upload payload", async () => {
  const origFetch = global.fetch;
  const origFormData = global.FormData;
  const origBlob = global.Blob;

  global.FormData = class FormData {
    constructor() { this.data = {}; }
    append(key, value) { this.data[key] = value; }
  };
  global.Blob = class Blob {
    constructor(parts, options) { this.data = parts[0]; this.type = options?.type; }
  };

  const videoBuffer = createMockVideoBuffer(5);
  const caption = "My awesome reel!";

  global.fetch = async () => ({
    ok: true,
    json: async () => MOCK_RESPONSES.instagram.upload,
    text: async () => "{}",
  });

  try {
    const result = await POSTERS.instagram(videoBuffer, caption, "test_token");
    assert.equal(result.platform, "instagram");
    assert.equal(result.mediaId, "18345678901234567");
    assert.ok(result.url.includes("instagram.com/reel"));
    assert.equal(result.status, "PROCESSING");
  } finally {
    global.fetch = origFetch;
    global.FormData = origFormData;
    global.Blob = origBlob;
  }
});

test("Instagram Poster - Instagram handles rate limit error", async () => {
  const origFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => MOCK_RESPONSES.instagram.error,
    text: async () => JSON.stringify(MOCK_RESPONSES.instagram.error),
  });

  try {
    await assert.rejects(
      async () => POSTERS.instagram(createMockVideoBuffer(5), "caption", "test_token"),
      /Invalid OAuth access token/
    );
  } finally {
    global.fetch = origFetch;
  }
});

test("postToSocialMedia main function - dispatches to correct platform", async () => {
  const origFetch = global.fetch;
  const platforms = ["instagram", "tiktok", "youtube", "facebook", "twitter", "linkedin", "snapchat"];

  try {
    for (const platform of platforms) {
      global.fetch = async () => ({
        ok: true,
        headers: new Map([["location", "https://upload-url.com"]]),
        json: async () => ({ id: "test_id", data: { video_id: "test" } }),
        text: async () => "{}",
      });

      const result = await postToSocialMedia(platform, createMockVideoBuffer(10), "test caption", "token");
      assert.equal(result.platform, platform);
      assert.ok(result.timestamp);
    }
  } finally {
    global.fetch = origFetch;
  }
});

test("postToSocialMedia main function - returns error object on failure", async () => {
  const origFetch = global.fetch;
  global.fetch = async () => { throw new Error("Network error"); };

  try {
    const result = await postToSocialMedia("tiktok", createMockVideoBuffer(10), "test", "token");
    assert.equal(result.success, false);
    assert.ok(result.error.includes("Network error"));
    assert.ok(result.timestamp);
  } finally {
    global.fetch = origFetch;
  }
});

test("postToSocialMedia main function - rejects unsupported platform", async () => {
  await assert.rejects(
    async () => postToSocialMedia("snapschat", createMockVideoBuffer(10), "test", "token"),
    /Unsupported platform/
  );
});

test("Platform Configuration - all platforms have required config", () => {
  const platforms = ["instagram", "tiktok", "youtube", "facebook", "twitter", "linkedin", "snapchat", "pinterest"];
  const requiredFields = [
    "apiVersion",
    "baseUrl",
    "timeout",
    "maxRetries",
    "retryDelay",
    "rateLimit",
    "maxVideoSize",
    "videoFormats",
  ];

  for (const platform of platforms) {
    assert.ok(PLATFORM_CONFIG[platform], `Platform ${platform} config missing`);
    for (const field of requiredFields) {
      assert.ok(PLATFORM_CONFIG[platform][field] !== undefined, `Platform ${platform} missing ${field}`);
    }
  }
});

test("Platform Configuration - rate limits are reasonable", () => {
  for (const [platform, config] of Object.entries(PLATFORM_CONFIG)) {
    assert.ok(config.rateLimit.requests > 0, `${platform} rateLimit.requests <= 0`);
    assert.ok(config.rateLimit.windowMs > 0, `${platform} rateLimit.windowMs <= 0`);
  }
});

test("Platform Configuration - timeouts are platform-appropriate", () => {
  assert.ok(PLATFORM_CONFIG.youtube.timeout > PLATFORM_CONFIG.tiktok.timeout);
  assert.ok(PLATFORM_CONFIG.linkedin.timeout >= PLATFORM_CONFIG.twitter.timeout);
});
