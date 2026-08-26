// Comprehensive test suite for social media posters
// Shows expected API payloads, responses, and error handling

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
  const size = sizeInMB * 1024 * 1024;
  const buffer = Buffer.alloc(size);
  // Add MP4 magic bytes
  buffer.write("ftypiso2", 0);
  return buffer;
};

const SAMPLE_CAPTION =
  "Check out this amazing video! 🎬 #viral #trending #reels #shorts #content";

/**
 * PLATFORM-SPECIFIC MOCK API RESPONSES
 */
const MOCK_RESPONSES = {
  /**
   * Instagram Graph API Response
   * Endpoint: POST /v18.0/me/media
   */
  instagram: {
    upload: {
      id: "18345678901234567",
      status: "PROCESSING",
    },
    // Follow-up status check
    statusCheck: {
      id: "18345678901234567",
      status: "FINISHED",
      media_type: "REELS",
    },
    // Error response
    error: {
      error: {
        message: "Invalid OAuth access token.",
        type: "OAuthException",
        code: 190,
        fbtrace_id: "ABCD1234",
      },
    },
  },

  /**
   * TikTok Open API Response
   * Endpoint: POST /v1/video/upload
   */
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
    // Rate limit error
    rateLimitError: {
      error: {
        message: "You have exceeded the rate limit.",
        error_description: "429 Too Many Requests",
        error_code: 429,
      },
      status_code: 429,
      status_msg: "Rate limit exceeded",
    },
    // Invalid video error
    invalidVideoError: {
      error: {
        message: "Video format not supported.",
        error_description: "Only MP4 format is supported",
        error_code: 10001,
      },
    },
  },

  /**
   * YouTube Data API v3 Response
   * Endpoint: POST /youtube/v3/videos?uploadType=resumable
   */
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
    // Upload not complete error
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

  /**
   * Facebook Graph API Response
   * Endpoint: POST /v18.0/me/videos
   */
  facebook: {
    success: {
      id: "123456789012345",
      post_id: "100001234567890_123456789012345",
      video_data: {
        length: 1024000,
        image: "https://example.com/thumb.jpg",
      },
    },
    // Invalid access token
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
    // Video too large
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

  /**
   * Twitter API v2 Responses
   * Upload: POST /1.1/media/upload
   * Tweet: POST /2/tweets
   */
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
    // Media processing error
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

  /**
   * LinkedIn API v2 Responses
   * Upload init: POST /videos?action=initializeUpload
   * Binary upload: PUT to returned uploadUrl
   * Create post: POST /posts
   */
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
    // Service unavailable error
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

  /**
   * Snapchat Ads API Response
   * Endpoint: POST /v1/media/upload
   */
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
    // Invalid token
    invalidToken: {
      request_status: 401,
      request_id: "req_123456",
      display_message: "Unauthorized",
      debug_message: "Invalid access token",
    },
    // Creative not approved
    notApproved: {
      request_status: 400,
      request_id: "req_123456",
      display_message: "Invalid request",
      debug_message: "User not eligible for Spotlight uploads",
    },
  },

  /**
   * Pinterest API v1 Response
   * Endpoint: POST /pins
   */
  pinterest: {
    success: {
      id: "1234567890",
      url: "https://www.pinterest.com/pin/1234567890/",
      created_at: "2024-01-15T10:30:00Z",
      note: "Check out this amazing video! 🎬 #viral #trending #reels #shorts #content",
      link: "https://example.com",
      board: {
        url: "/my-board/",
        id: "12345678",
      },
      counts: {
        saves: 0,
        done: 0,
      },
    },
    // Daily limit reached
    rateLimitError: {
      message: "You have reached your daily pin limit.",
      code: 9001,
    },
    // Invalid board
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

describe("Video Validation", () => {
  test("validateVideo accepts valid buffer", () => {
    const buffer = createMockVideoBuffer(10);
    expect(() => validateVideo(buffer, "tiktok")).not.toThrow();
  });

  test("validateVideo rejects empty buffer", () => {
    expect(() => validateVideo(Buffer.alloc(0), "tiktok")).toThrow("empty");
  });

  test("validateVideo rejects oversized video", () => {
    // TikTok has 274MB limit
    const buffer = Buffer.alloc(300 * 1024 * 1024);
    expect(() => validateVideo(buffer, "tiktok")).toThrow("exceeds maximum");
  });

  test("validateVideo rejects non-buffer input", () => {
    expect(() => validateVideo("not a buffer", "tiktok")).toThrow("Invalid video buffer");
  });
});

describe("Caption Validation", () => {
  test("validateCaption truncates long captions", () => {
    const longCaption = "a".repeat(200);
    const result = validateCaption(longCaption, "tiktok"); // 150 char limit
    expect(result.length).toBeLessThanOrEqual(150);
  });

  test("validateCaption preserves valid captions", () => {
    const caption = "My awesome video #trending";
    expect(validateCaption(caption, "tiktok")).toBe(caption);
  });

  test("validateCaption removes control characters", () => {
    const caption = "My video\x00\x01\x02";
    const result = validateCaption(caption, "tiktok");
    expect(result).not.toContain("\x00");
  });

  test("validateCaption handles empty input", () => {
    expect(validateCaption("", "tiktok")).toBe("");
    expect(validateCaption(null, "tiktok")).toBe("");
  });
});

/**
 * ============================================================================
 * INTEGRATION TESTS (with mocked fetch)
 * ============================================================================
 */

describe("Instagram Poster", () => {
  beforeEach(() => {
    global.FormData = class FormData {
      constructor() {
        this.data = {};
      }
      append(key, value) {
        this.data[key] = value;
      }
    };
    global.Blob = class Blob {
      constructor(parts, options) {
        this.data = parts[0];
        this.type = options?.type;
      }
    };
  });

  test("successful Instagram upload payload", async () => {
    /**
     * Expected request:
     * POST https://graph.instagram.com/v18.0/me/media?access_token=...
     *
     * Form data:
     * - video_data: <binary mp4>
     * - description: <caption>
     * - media_type: REELS
     *
     * Expected response:
     * {
     *   "id": "18345678901234567",
     *   "status": "PROCESSING"
     * }
     */

    const videoBuffer = createMockVideoBuffer(5);
    const caption = "My awesome reel!";

    // Mock fetch
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(MOCK_RESPONSES.instagram.upload),
        text: () => Promise.resolve("{}"),
      })
    );

    const result = await POSTERS.instagram(videoBuffer, caption, "test_token");

    expect(result.platform).toBe("instagram");
    expect(result.mediaId).toBe("18345678901234567");
    expect(result.url).toContain("instagram.com/reel");
    expect(result.status).toBe("PROCESSING");
  });

  test("Instagram handles rate limit error", async () => {
    /**
     * Error response:
     * {
     *   "error": {
     *     "message": "Invalid OAuth access token.",
     *     "type": "OAuthException",
     *     "code": 190
     *   }
     * }
     */

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve(JSON.stringify(MOCK_RESPONSES.instagram.error)),
        json: () => Promise.reject(new Error("No JSON")),
      })
    );

    await expect(POSTERS.instagram(createMockVideoBuffer(5), "test", "bad_token")).rejects.toThrow(
      /OAuthException|Invalid OAuth/
    );
  });
});

describe("TikTok Poster", () => {
  test("successful TikTok upload payload", async () => {
    /**
     * Expected request:
     * POST https://open.tiktokapi.com/v1/video/upload
     * Authorization: Bearer <token>
     *
     * Form data:
     * - video: <binary mp4>
     * - description: <caption>
     * - video_title: <first line of caption>
     *
     * Expected response:
     * {
     *   "data": {
     *     "video_id": "7123456789012345678",
     *     "share_url": "https://www.tiktok.com/@username/video/7123456789012345678"
     *   }
     * }
     */

    const videoBuffer = createMockVideoBuffer(50); // 50MB < 274MB limit
    const caption = "Check out this trending video #FYP";

    global.FormData = class FormData {
      constructor() {
        this.data = {};
      }
      append(key, value) {
        this.data[key] = value;
      }
    };
    global.Blob = class Blob {
      constructor(parts, options) {
        this.data = parts[0];
        this.type = options?.type;
      }
    };

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(MOCK_RESPONSES.tiktok.success),
        text: () => Promise.resolve("{}"),
      })
    );

    const result = await POSTERS.tiktok(videoBuffer, caption, "test_token");

    expect(result.platform).toBe("tiktok");
    expect(result.videoId).toBe("7123456789012345678");
    expect(result.url).toContain("tiktok.com");
  });

  test("TikTok handles rate limit (429)", async () => {
    /**
     * Error response:
     * {
     *   "error": {
     *     "message": "You have exceeded the rate limit.",
     *     "error_description": "429 Too Many Requests"
     *   }
     * }
     */

    global.fetch = jest.fn()
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          text: () => Promise.resolve(JSON.stringify(MOCK_RESPONSES.tiktok.rateLimitError)),
          json: () => Promise.reject(new Error("No JSON")),
        })
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 429,
          text: () => Promise.resolve(JSON.stringify(MOCK_RESPONSES.tiktok.rateLimitError)),
          json: () => Promise.reject(new Error("No JSON")),
        })
      );

    await expect(POSTERS.tiktok(createMockVideoBuffer(50), "test", "token")).rejects.toThrow(
      /rate limit|429/i
    );
  });
});

describe("YouTube Poster", () => {
  test("YouTube resumable upload flow", async () => {
    /**
     * Step 1: Get resumable session
     * POST https://www.googleapis.com/youtube/v3/videos?uploadType=resumable
     * Authorization: Bearer <token>
     * Content-Type: application/json
     *
     * Body:
     * {
     *   "snippet": {
     *     "title": "My Awesome Short Video",
     *     "description": "...",
     *     "tags": ["#viral", "#trending"],
     *     "categoryId": "22"  // Shorts category
     *   },
     *   "status": { "privacyStatus": "public" }
     * }
     *
     * Response: Location header with upload URL
     *
     * Step 2: Upload binary video
     * PUT <uploadUrl>
     * Content-Type: video/mp4
     * Content-Length: <size>
     *
     * Body: <video binary>
     *
     * Response: { "id": "Rz7kCjhQsOQ", ... }
     */

    let callCount = 0;
    global.fetch = jest.fn(() => {
      callCount++;
      if (callCount === 1) {
        // Session initialization
        return Promise.resolve({
          ok: true,
          headers: new Map([["location", "https://www.googleapis.com/upload/youtube/v3/videos"]]),
          json: () => Promise.reject(new Error("No JSON")),
        });
      } else {
        // Video upload
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_RESPONSES.youtube.success),
          text: () => Promise.resolve("{}"),
        });
      }
    });

    const result = await POSTERS.youtube(createMockVideoBuffer(100), "My short", "token");

    expect(result.platform).toBe("youtube");
    expect(result.videoId).toBe("Rz7kCjhQsOQ");
    expect(result.url).toContain("youtube.com/shorts");
  });
});

describe("Facebook Poster", () => {
  test("Facebook video upload with auto-publish", async () => {
    /**
     * Expected request:
     * POST https://graph.facebook.com/v18.0/me/videos?access_token=...
     *
     * Form data:
     * - source: <binary video>
     * - description: <caption>
     * - title: <caption first line>
     * - published: false
     *
     * Expected response:
     * {
     *   "id": "123456789012345",
     *   "post_id": "page_id_123456789012345"
     * }
     */

    let uploadCall = 0;
    global.fetch = jest.fn(() => {
      uploadCall++;
      if (uploadCall === 1) {
        // Upload
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_RESPONSES.facebook.success),
          text: () => Promise.resolve("{}"),
        });
      } else {
        // Publish
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
          text: () => Promise.resolve("{}"),
        });
      }
    });

    const result = await POSTERS.facebook(createMockVideoBuffer(100), "My video", "token");

    expect(result.platform).toBe("facebook");
    expect(result.videoId).toBe("123456789012345");
    expect(result.url).toContain("facebook.com/video.php");
  });
});

describe("Twitter Poster", () => {
  test("Twitter two-step upload: media then tweet", async () => {
    /**
     * Step 1: Upload media
     * POST https://upload.twitter.com/1.1/media/upload.json
     * Authorization: Bearer <token>
     *
     * Form data:
     * - media_data: <base64 video>
     * - media_type: video/mp4
     *
     * Response:
     * {
     *   "media_id": 1445764480,
     *   "media_id_string": "1445764480"
     * }
     *
     * Step 2: Post tweet
     * POST https://api.twitter.com/2/tweets
     * Authorization: Bearer <token>
     * Content-Type: application/json
     *
     * Body:
     * {
     *   "text": <caption>,
     *   "media": { "media_ids": ["1445764480"] }
     * }
     *
     * Response: { "data": { "id": "1445765480", "text": "..." } }
     */

    let callCount = 0;
    global.fetch = jest.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_RESPONSES.twitter.mediaUpload),
          text: () => Promise.resolve("{}"),
        });
      } else {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_RESPONSES.twitter.tweetResponse),
          text: () => Promise.resolve("{}"),
        });
      }
    });

    const result = await POSTERS.twitter(createMockVideoBuffer(100), "Check this out!", "token");

    expect(result.platform).toBe("twitter");
    expect(result.tweetId).toBe("1445765480");
    expect(result.mediaId).toBe("1445764480");
  });
});

describe("LinkedIn Poster", () => {
  test("LinkedIn three-step process: init, upload binary, create post", async () => {
    /**
     * Step 1: Initialize upload
     * POST https://api.linkedin.com/v2/videos?action=initializeUpload
     * Authorization: Bearer <token>
     * Content-Type: application/json
     *
     * Body:
     * {
     *   "uploadMechanism": {
     *     "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {}
     *   },
     *   "owner": "urn:li:person:me",
     *   "fileSizeBytes": <size>
     * }
     *
     * Response:
     * {
     *   "value": "urn:li:video:C5622AQEBSa5ZLh3BT2g",
     *   "uploadUrl": "https://media-upload.linkedin.com/upload-video"
     * }
     *
     * Step 2: Upload binary
     * PUT <uploadUrl>
     * Content-Type: video/mp4
     *
     * Step 3: Create post
     * POST https://api.linkedin.com/v2/posts
     * Authorization: Bearer <token>
     *
     * Body:
     * {
     *   "author": "urn:li:person:me",
     *   "lifecycleState": "PUBLISHED",
     *   "specificContent": {
     *     "com.linkedin.ugc.ShareContent": {
     *       "shareCommentary": { "text": <caption> },
     *       "media": [{ "status": "READY", "media": "urn:li:video:..." }]
     *     }
     *   }
     * }
     */

    let callCount = 0;
    global.fetch = jest.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_RESPONSES.linkedin.uploadInit),
          text: () => Promise.resolve("{}"),
        });
      } else if (callCount === 2) {
        // Binary upload
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve("Upload successful"),
        });
      } else {
        // Create post
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(MOCK_RESPONSES.linkedin.postCreation),
          text: () => Promise.resolve("{}"),
        });
      }
    });

    const result = await POSTERS.linkedin(createMockVideoBuffer(200), "My LinkedIn video", "token");

    expect(result.platform).toBe("linkedin");
    expect(result.videoUrn).toContain("urn:li:video:");
    expect(result.postId).toContain("urn:li:activity:");
  });
});

describe("Snapchat Poster", () => {
  test("Snapchat Spotlight upload", async () => {
    /**
     * Expected request:
     * POST https://adsapi.snapchat.com/v1/media/upload
     * Authorization: Bearer <token>
     *
     * Form data:
     * - file: <binary video>
     * - creative_type: SPOTLIGHT_VIDEO
     * - description: <caption>
     *
     * Expected response:
     * {
     *   "request_status": 200,
     *   "data": {
     *     "id": "spotlight_abc123",
     *     "url": "https://snapchat.com/spotlight/abc123",
     *     "status": "PROCESSING"
     *   }
     * }
     */

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(MOCK_RESPONSES.snapchat.success),
        text: () => Promise.resolve("{}"),
      })
    );

    const result = await POSTERS.snapchat(createMockVideoBuffer(100), "My spotlight", "token");

    expect(result.platform).toBe("snapchat");
    expect(result.mediaId).toContain("spotlight");
    expect(result.status).toBe("PROCESSING");
  });
});

describe("Pinterest Poster", () => {
  test("Pinterest pin creation with video", async () => {
    /**
     * Expected request:
     * POST https://api.pinterest.com/v1/pins?access_token=...
     * Content-Type: application/json
     *
     * Body:
     * {
     *   "board_id": "12345678",
     *   "description": <caption>,
     *   "title": <caption first line>,
     *   "media_source": {
     *     "source_type": "video_base64",
     *     "content_type": "video/mp4",
     *     "data": <base64 video>
     *   }
     * }
     *
     * Expected response:
     * {
     *   "id": "1234567890",
     *   "url": "https://www.pinterest.com/pin/1234567890/",
     *   "created_at": "2024-01-15T10:30:00Z"
     * }
     *
     * Rate limit: 15 pins/day for free accounts
     */

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(MOCK_RESPONSES.pinterest.success),
        text: () => Promise.resolve("{}"),
      })
    );

    const result = await POSTERS.pinterest(createMockVideoBuffer(100), "My pin", "token", "board_12345");

    expect(result.platform).toBe("pinterest");
    expect(result.pinId).toBe("1234567890");
    expect(result.boardId).toBe("board_12345");
  });

  test("Pinterest requires boardId", async () => {
    await expect(POSTERS.pinterest(createMockVideoBuffer(100), "test", "token")).rejects.toThrow(
      /board_id/
    );
  });
});

/**
 * ============================================================================
 * END-TO-END TESTS
 * ============================================================================
 */

describe("postToSocialMedia main function", () => {
  test("dispatches to correct platform", async () => {
    const platforms = ["instagram", "tiktok", "youtube", "facebook", "twitter", "linkedin", "snapchat"];

    for (const platform of platforms) {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          headers: new Map([["location", "https://upload-url.com"]]),
          json: () => Promise.resolve({ id: "test_id", data: { video_id: "test" } }),
          text: () => Promise.resolve("{}"),
        })
      );

      const result = await postToSocialMedia(platform, createMockVideoBuffer(10), "test caption", "token");

      expect(result.platform).toBe(platform);
      expect(result.timestamp).toBeDefined();
    }
  });

  test("returns error object on failure", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("Network error")));

    const result = await postToSocialMedia("tiktok", createMockVideoBuffer(10), "test", "token");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
    expect(result.timestamp).toBeDefined();
  });

  test("rejects unsupported platform", async () => {
    await expect(postToSocialMedia("snapschat", createMockVideoBuffer(10), "test", "token")).rejects.toThrow(
      /Unsupported platform/
    );
  });

  test("passes options to Pinterest", async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(MOCK_RESPONSES.pinterest.success),
      })
    );

    const result = await postToSocialMedia("pinterest", createMockVideoBuffer(10), "test", "token", {
      boardId: "my_board",
    });

    expect(result.boardId).toBe("my_board");
  });
});

/**
 * ============================================================================
 * PLATFORM CONFIGURATION VALIDATION
 * ============================================================================
 */

describe("Platform Configuration", () => {
  test("all platforms have required config", () => {
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
      expect(PLATFORM_CONFIG[platform]).toBeDefined();
      for (const field of requiredFields) {
        expect(PLATFORM_CONFIG[platform][field]).toBeDefined();
      }
    }
  });

  test("rate limits are reasonable", () => {
    for (const [platform, config] of Object.entries(PLATFORM_CONFIG)) {
      expect(config.rateLimit.requests).toBeGreaterThan(0);
      expect(config.rateLimit.windowMs).toBeGreaterThan(0);
    }
  });

  test("timeouts are platform-appropriate", () => {
    expect(PLATFORM_CONFIG.youtube.timeout).toBeGreaterThan(PLATFORM_CONFIG.tiktok.timeout);
    expect(PLATFORM_CONFIG.linkedin.timeout).toBeGreaterThanOrEqual(PLATFORM_CONFIG.twitter.timeout);
  });
});
