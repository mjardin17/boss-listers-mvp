const assert = require("node:assert/strict");
const { test, beforeEach, afterEach } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const { POSTERS, PLATFORM_CONFIG } = require("../lib/socialMediaPosters");
const { OAUTH_CONFIGS } = require("../lib/socialMediaAuth");

// Helper to create valid MP4 video buffer
const createMockVideoBuffer = (sizeInKB = 10) => {
  const buffer = Buffer.alloc(sizeInKB * 1024);
  buffer.write("ftypiso2", 4); // valid ftyp magic bytes at byte 4-8
  return buffer;
};

// Fast retries for tests
const originalRetryDelay = PLATFORM_CONFIG.pinterest.retryDelay;
PLATFORM_CONFIG.pinterest.retryDelay = 1;

test("1. Pinterest API v5: full 3-step successful video pin flow with correct URLs and payloads", async () => {
  const calls = [];
  const origFetch = global.fetch;

  global.fetch = async (url, options = {}) => {
    const urlStr = String(url);
    calls.push({ url: urlStr, method: options.method || "GET", headers: options.headers, body: options.body });

    // Step 1: Register media upload
    if (urlStr === "https://api.pinterest.com/v5/media/uploads" && options.method === "POST") {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          media_id: "media_test_123",
          upload_url: "https://s3.amazonaws.com/pinterest-upload-bucket/video.mp4",
          upload_parameters: {
            key: "uploads/video.mp4",
            AWSAccessKeyId: "TEST_AWS_KEY",
            signature: "test_sig_123",
          },
        }),
        text: async () => JSON.stringify({ media_id: "media_test_123" }),
      };
    }

    // Step 2: S3 upload
    if (urlStr.includes("s3.amazonaws.com") && options.method === "POST") {
      return {
        ok: true,
        status: 204,
        text: async () => "",
      };
    }

    // Step 2b: Media status check
    if (urlStr === "https://api.pinterest.com/v5/media/uploads/media_test_123" && options.method === "GET") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          media_id: "media_test_123",
          status: "succeeded",
        }),
        text: async () => JSON.stringify({ media_id: "media_test_123", status: "succeeded" }),
      };
    }

    // Step 3: Create pin
    if (urlStr === "https://api.pinterest.com/v5/pins" && options.method === "POST") {
      const parsedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: "pin_v5_98765",
          url: "https://www.pinterest.com/pin/pin_v5_98765/",
          title: parsedBody.title,
          description: parsedBody.description,
          board_id: parsedBody.board_id,
          created_at: new Date().toISOString(),
        }),
        text: async () => JSON.stringify({ id: "pin_v5_98765" }),
      };
    }

    throw new Error(`Unexpected fetch URL: ${urlStr}`);
  };

  try {
    const video = createMockVideoBuffer(50);
    const caption = "Exclusive Vintage Merch Drop\nCheck out this limited run before it sells out! #merch";
    const token = "pina_test_token_secret";
    const boardId = "board_fashion_2026";

    const result = await POSTERS.pinterest(video, caption, token, boardId);

    // Verify result shape
    assert.equal(result.platform, "pinterest");
    assert.equal(result.pinId, "pin_v5_98765");
    assert.equal(result.url, "https://www.pinterest.com/pin/pin_v5_98765/");
    assert.equal(result.boardId, "board_fashion_2026");
    assert.equal(result.status, "succeeded");
    assert.ok(result.timestamp);

    // Verify 3-step sequence in calls
    assert.equal(calls.length, 4); // Step 1, Step 2, Step 2b (status), Step 3

    // Step 1: POST /v5/media/uploads
    assert.equal(calls[0].url, "https://api.pinterest.com/v5/media/uploads");
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].headers.Authorization, "Bearer pina_test_token_secret");
    assert.deepEqual(JSON.parse(calls[0].body), { media_type: "video/mp4" });

    // Step 2: Upload to S3
    assert.equal(calls[1].url, "https://s3.amazonaws.com/pinterest-upload-bucket/video.mp4");
    assert.equal(calls[1].method, "POST");

    // Step 2b: GET /v5/media/uploads/media_test_123
    assert.equal(calls[2].url, "https://api.pinterest.com/v5/media/uploads/media_test_123");
    assert.equal(calls[2].method, "GET");
    assert.equal(calls[2].headers.Authorization, "Bearer pina_test_token_secret");

    // Step 3: POST /v5/pins
    assert.equal(calls[3].url, "https://api.pinterest.com/v5/pins");
    assert.equal(calls[3].method, "POST");
    assert.equal(calls[3].headers.Authorization, "Bearer pina_test_token_secret");
    const pinBody = JSON.parse(calls[3].body);
    assert.equal(pinBody.board_id, "board_fashion_2026");
    assert.equal(pinBody.title, "Exclusive Vintage Merch Drop");
    assert.equal(pinBody.description, caption);
    assert.deepEqual(pinBody.media_source, {
      source_type: "video_id",
      media_id: "media_test_123",
    });
  } finally {
    global.fetch = origFetch;
  }
});

test("2. Pinterest API v5: async media processing state surfaces cleanly without failing", async () => {
  const origFetch = global.fetch;

  global.fetch = async (url, options = {}) => {
    const urlStr = String(url);

    if (urlStr === "https://api.pinterest.com/v5/media/uploads" && options.method === "POST") {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          media_id: "media_async_456",
          upload_url: "https://s3.amazonaws.com/upload/video.mp4",
          upload_parameters: {},
        }),
      };
    }
    if (urlStr.includes("s3.amazonaws.com")) {
      return { ok: true, status: 204, text: async () => "" };
    }
    if (urlStr.includes("/v5/media/uploads/media_async_456")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          media_id: "media_async_456",
          status: "processing", // still encoding on Pinterest side
        }),
      };
    }
    throw new Error(`Unexpected call: ${urlStr}`);
  };

  try {
    const video = createMockVideoBuffer(50);
    const result = await POSTERS.pinterest(video, "Processing video", "token", "board_123");

    assert.equal(result.platform, "pinterest");
    assert.equal(result.status, "processing");
    assert.equal(result.mediaId, "media_async_456");
    assert.equal(result.pinId, null);
    assert.ok(result.message.includes("processing"));
  } finally {
    global.fetch = origFetch;
  }
});

test("3. Confirmation: No v1 URLs appear anywhere in poster or auth config", () => {
  // Check PLATFORM_CONFIG
  assert.equal(PLATFORM_CONFIG.pinterest.apiVersion, "v5");
  assert.equal(PLATFORM_CONFIG.pinterest.baseUrl, "https://api.pinterest.com");

  // Check OAUTH_CONFIGS
  const oauth = OAUTH_CONFIGS.pinterest;
  assert.equal(oauth.authUrl, "https://www.pinterest.com/oauth/");
  assert.equal(oauth.tokenUrl, "https://api.pinterest.com/v5/oauth/token");
  assert.equal(oauth.apiBase, "https://api.pinterest.com/v5");

  // Static check on code files
  const postersCode = fs.readFileSync(path.join(__dirname, "../lib/socialMediaPosters.js"), "utf8");
  const authCode = fs.readFileSync(path.join(__dirname, "../lib/socialMediaAuth.js"), "utf8");
  const callbackCode = fs.readFileSync(path.join(__dirname, "../pages/api/oauth/[platform]/callback.js"), "utf8");

  assert.ok(!postersCode.includes("api.pinterest.com/v1"), "socialMediaPosters.js must not contain api.pinterest.com/v1");
  assert.ok(!postersCode.includes("/v1/pins"), "socialMediaPosters.js must not contain /v1/pins");
  assert.ok(!authCode.includes("api.pinterest.com/v1"), "socialMediaAuth.js must not contain api.pinterest.com/v1");
  assert.ok(!callbackCode.includes("api.pinterest.com/v1"), "callback.js must not contain api.pinterest.com/v1");
});

test("4. Validation: board_id is required", async () => {
  const video = createMockVideoBuffer(50);
  await assert.rejects(
    async () => {
      await POSTERS.pinterest(video, "Caption", "token", null);
    },
    {
      name: "Error",
      message: "Pinterest requires a board_id parameter",
    }
  );
});

test("5. Rate limiting: rejects when rate limit is exceeded", async () => {
  const origLimit = PLATFORM_CONFIG.pinterest.rateLimit;
  PLATFORM_CONFIG.pinterest.rateLimit = { requests: 0, windowMs: 60000 };

  try {
    const video = createMockVideoBuffer(50);
    await assert.rejects(
      async () => {
        await POSTERS.pinterest(video, "Caption", "token", "board_123");
      },
      {
        name: "Error",
        message: "Rate limit exceeded for Pinterest",
      }
    );
  } finally {
    PLATFORM_CONFIG.pinterest.rateLimit = origLimit;
  }
});

test("6. Retry behavior: transient network error retries and succeeds", async () => {
  const origFetch = global.fetch;
  let attempts = 0;

  global.fetch = async (url, options = {}) => {
    const urlStr = String(url);
    if (urlStr === "https://api.pinterest.com/v5/media/uploads") {
      attempts++;
      if (attempts === 1) {
        throw new Error("Temporary network glitch");
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({
          media_id: "m_retry_ok",
          upload_url: "https://s3.amazonaws.com/retry-ok",
          upload_parameters: {},
        }),
      };
    }
    if (urlStr.includes("s3.amazonaws.com")) {
      return { ok: true, status: 204, text: async () => "" };
    }
    if (urlStr.includes("/v5/media/uploads/m_retry_ok")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ media_id: "m_retry_ok", status: "succeeded" }),
      };
    }
    if (urlStr === "https://api.pinterest.com/v5/pins") {
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: "pin_after_retry", url: "https://pinterest.com/pin/retry" }),
      };
    }
    throw new Error(`Unexpected URL: ${urlStr}`);
  };

  try {
    const video = createMockVideoBuffer(50);
    const result = await POSTERS.pinterest(video, "Retry test", "token", "board_123");
    assert.equal(result.pinId, "pin_after_retry");
    assert.equal(attempts, 2, "Must have retried after the first attempt failed");
  } finally {
    global.fetch = origFetch;
  }
});

test("7. Descriptive Errors: registration rejected naming the step", async () => {
  const origFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes("/v5/media/uploads")) {
      return {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => JSON.stringify({ message: "Invalid media_type requested" }),
      };
    }
    throw new Error("Unexpected URL");
  };

  try {
    const video = createMockVideoBuffer(50);
    await assert.rejects(
      async () => {
        await POSTERS.pinterest(video, "Caption", "token", "board_123");
      },
      (err) => {
        assert.ok(
          err.message.includes("Pinterest media registration rejected:"),
          `Expected 'registration rejected' in error, got: ${err.message}`
        );
        return true;
      }
    );
  } finally {
    global.fetch = origFetch;
  }
});

test("8. Descriptive Errors: video upload failed naming the step", async () => {
  const origFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (String(url) === "https://api.pinterest.com/v5/media/uploads") {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          media_id: "m_fail_up",
          upload_url: "https://s3.amazonaws.com/fail-upload",
          upload_parameters: {},
        }),
      };
    }
    if (String(url).includes("s3.amazonaws.com")) {
      return {
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => "Access Denied: S3 policy expired",
      };
    }
    throw new Error("Unexpected URL");
  };

  try {
    const video = createMockVideoBuffer(50);
    await assert.rejects(
      async () => {
        await POSTERS.pinterest(video, "Caption", "token", "board_123");
      },
      (err) => {
        assert.ok(
          err.message.includes("Pinterest video upload failed:"),
          `Expected 'video upload failed' in error, got: ${err.message}`
        );
        return true;
      }
    );
  } finally {
    global.fetch = origFetch;
  }
});

test("9. Descriptive Errors: media processing failed naming the step", async () => {
  const origFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (String(url) === "https://api.pinterest.com/v5/media/uploads") {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          media_id: "m_proc_fail",
          upload_url: "https://s3.amazonaws.com/proc-fail",
          upload_parameters: {},
        }),
      };
    }
    if (String(url).includes("s3.amazonaws.com")) {
      return { ok: true, status: 204, text: async () => "" };
    }
    if (String(url).includes("/v5/media/uploads/m_proc_fail")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          media_id: "m_proc_fail",
          status: "failed",
          failure_code: "UNSUPPORTED_AUDIO_CODEC",
        }),
      };
    }
    throw new Error("Unexpected URL");
  };

  try {
    const video = createMockVideoBuffer(50);
    await assert.rejects(
      async () => {
        await POSTERS.pinterest(video, "Caption", "token", "board_123");
      },
      (err) => {
        assert.ok(
          err.message.includes("Pinterest media processing failed: UNSUPPORTED_AUDIO_CODEC"),
          `Expected 'media processing failed' in error, got: ${err.message}`
        );
        return true;
      }
    );
  } finally {
    global.fetch = origFetch;
  }
});

test("10. Descriptive Errors: pin creation rejected naming the step", async () => {
  const origFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (String(url) === "https://api.pinterest.com/v5/media/uploads") {
      return {
        ok: true,
        status: 201,
        json: async () => ({
          media_id: "m_pin_fail",
          upload_url: "https://s3.amazonaws.com/pin-fail",
          upload_parameters: {},
        }),
      };
    }
    if (String(url).includes("s3.amazonaws.com")) {
      return { ok: true, status: 204, text: async () => "" };
    }
    if (String(url).includes("/v5/media/uploads/m_pin_fail")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          media_id: "m_pin_fail",
          status: "succeeded",
        }),
      };
    }
    if (String(url) === "https://api.pinterest.com/v5/pins") {
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => JSON.stringify({ message: "Board board_bad does not exist for this user" }),
      };
    }
    throw new Error("Unexpected URL");
  };

  try {
    const video = createMockVideoBuffer(50);
    await assert.rejects(
      async () => {
        await POSTERS.pinterest(video, "Caption", "token", "board_bad");
      },
      (err) => {
        assert.ok(
          err.message.includes("Pinterest pin creation rejected:"),
          `Expected 'pin creation rejected' in error, got: ${err.message}`
        );
        return true;
      }
    );
  } finally {
    global.fetch = origFetch;
  }
});
