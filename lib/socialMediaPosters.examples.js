/**
 * PRACTICAL EXAMPLES: Social Media Video Posting
 *
 * Real-world usage patterns for the social media poster adapters
 */

const fs = require("fs");
const { postToSocialMedia, PLATFORM_CONFIG } = require("./socialMediaPosters");

/**
 * ============================================================================
 * EXAMPLE 1: Simple Single Platform Post
 * ============================================================================
 */

async function example_simpleSinglePost() {
  console.log("\n=== Example 1: Simple Single Platform Post ===\n");

  const videoPath = "./video.mp4";
  const videoBuffer = fs.readFileSync(videoPath);
  const caption = "Check out this amazing video! #viral #trending";

  const tiktokToken = process.env.TIKTOK_ACCESS_TOKEN;

  try {
    console.log("📱 Posting to TikTok...");
    const result = await postToSocialMedia("tiktok", videoBuffer, caption, tiktokToken);

    console.log("✓ Success!");
    console.log(`   URL: ${result.url}`);
    console.log(`   Video ID: ${result.videoId}`);
    console.log(`   Posted at: ${result.timestamp}`);
  } catch (err) {
    console.error(`✗ Failed: ${err.message}`);
  }
}

/**
 * ============================================================================
 * EXAMPLE 2: Cross-Platform Posting (Sequential)
 * ============================================================================
 */

async function example_crossPlatformSequential() {
  console.log("\n=== Example 2: Cross-Platform Post (Sequential) ===\n");

  const videoBuffer = fs.readFileSync("./video.mp4");
  const captions = {
    instagram: "My awesome reel! 🎬 #reels #trending #viral",
    tiktok: "#FYP #viral #trending", // 150 char limit
    youtube: "Check out my YouTube Short! Like and subscribe for more content.",
  };

  const tokens = {
    instagram: process.env.INSTAGRAM_TOKEN,
    tiktok: process.env.TIKTOK_TOKEN,
    youtube: process.env.YOUTUBE_TOKEN,
  };

  const platforms = ["instagram", "tiktok", "youtube"];
  const results = {};

  for (const platform of platforms) {
    try {
      console.log(`📱 Posting to ${platform}...`);
      results[platform] = await postToSocialMedia(
        platform,
        videoBuffer,
        captions[platform],
        tokens[platform]
      );
      console.log(`✓ Posted: ${results[platform].url}`);
    } catch (err) {
      console.error(`✗ Failed on ${platform}: ${err.message}`);
      results[platform] = { error: err.message };
    }

    // Wait between posts to avoid rate limits
    if (platform !== platforms[platforms.length - 1]) {
      console.log("Waiting 5 seconds before next platform...\n");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  console.log("\n=== Summary ===");
  console.table(results);
}

/**
 * ============================================================================
 * EXAMPLE 3: Post Queue with Rate Limiting
 * ============================================================================
 */

class SocialMediaQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.stats = {
      posted: 0,
      failed: 0,
      queued: 0,
    };
  }

  /**
   * Add post to queue
   */
  add(platform, videoBuffer, caption, token, options = {}) {
    this.queue.push({
      platform,
      videoBuffer,
      caption,
      token,
      options,
      addedAt: new Date(),
    });
    this.stats.queued++;
    console.log(`[Queue] Added ${platform} post (${this.queue.length} in queue)`);
  }

  /**
   * Process queue with rate limiting
   */
  async process() {
    if (this.isProcessing) {
      console.log("[Queue] Already processing...");
      return;
    }

    this.isProcessing = true;
    console.log("[Queue] Starting to process queue...\n");

    while (this.queue.length > 0) {
      const { platform, videoBuffer, caption, token, options } = this.queue.shift();
      const config = PLATFORM_CONFIG[platform];

      try {
        console.log(`[${platform}] Uploading...`);
        const result = await postToSocialMedia(platform, videoBuffer, caption, token, options);

        console.log(`[${platform}] ✓ Success: ${result.url}\n`);
        this.stats.posted++;
      } catch (err) {
        console.error(`[${platform}] ✗ Failed: ${err.message}\n`);
        this.stats.failed++;
      }

      // Rate limit: wait before next request
      if (this.queue.length > 0) {
        const delayMs = (config.rateLimit.windowMs / config.rateLimit.requests) * 1.5;
        console.log(`Waiting ${(delayMs / 1000).toFixed(1)}s before next post...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    this.isProcessing = false;
    console.log("\n[Queue] Processing complete!");
    console.log("Stats:", this.stats);
  }
}

async function example_queueWithRateLimiting() {
  console.log("\n=== Example 3: Queue with Rate Limiting ===\n");

  const videoBuffer = fs.readFileSync("./video.mp4");
  const queue = new SocialMediaQueue();

  // Add multiple posts to queue
  queue.add("instagram", videoBuffer, "My reel!", process.env.INSTAGRAM_TOKEN);
  queue.add("tiktok", videoBuffer, "#FYP", process.env.TIKTOK_TOKEN);
  queue.add("youtube", videoBuffer, "My Short!", process.env.YOUTUBE_TOKEN);
  queue.add("facebook", videoBuffer, "Check this out!", process.env.FACEBOOK_TOKEN);

  // Process queue
  await queue.process();
}

/**
 * ============================================================================
 * EXAMPLE 4: Retry with Exponential Backoff
 * ============================================================================
 */

async function example_retryWithBackoff() {
  console.log("\n=== Example 4: Application-Level Retry ===\n");

  const videoBuffer = fs.readFileSync("./video.mp4");
  const maxRetries = 3;
  const baseDelayMs = 1000;

  async function uploadWithRetry(platform, caption, token) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[${platform}] Attempt ${attempt + 1}/${maxRetries + 1}...`);

        const result = await postToSocialMedia(platform, videoBuffer, caption, token);

        console.log(`[${platform}] ✓ Success on attempt ${attempt + 1}`);
        return result;
      } catch (err) {
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          console.log(
            `[${platform}] Failed: ${err.message}\n` +
              `[${platform}] Retrying in ${delay}ms...\n`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          console.error(`[${platform}] Failed after ${maxRetries + 1} attempts`);
          throw err;
        }
      }
    }
  }

  try {
    const result = await uploadWithRetry("tiktok", "#viral", process.env.TIKTOK_TOKEN);
    console.log(`\nFinal result: ${result.url}`);
  } catch (err) {
    console.error(`\nGave up: ${err.message}`);
  }
}

/**
 * ============================================================================
 * EXAMPLE 5: Database Integration
 * ============================================================================
 */

/**
 * Mock database for demonstration
 */
const MockDatabase = {
  posts: [],

  async savePost(postData) {
    this.posts.push({
      ...postData,
      savedAt: new Date(),
    });
    return postData;
  },

  async getPosts(platform) {
    return this.posts.filter((p) => p.platform === platform);
  },

  async updatePostStatus(videoId, status) {
    const post = this.posts.find((p) => p.videoId === videoId);
    if (post) {
      post.status = status;
    }
    return post;
  },
};

async function example_databaseIntegration() {
  console.log("\n=== Example 5: Database Integration ===\n");

  const videoBuffer = fs.readFileSync("./video.mp4");
  const caption = "My awesome video!";
  const token = process.env.TIKTOK_TOKEN;

  try {
    console.log("Uploading video...");
    const result = await postToSocialMedia("tiktok", videoBuffer, caption, token);

    console.log("Saving to database...");
    await MockDatabase.savePost({
      platform: "tiktok",
      videoId: result.videoId,
      url: result.url,
      caption,
      postedAt: result.timestamp,
      status: "published",
    });

    console.log("✓ Saved!");

    // Retrieve posts
    const posts = await MockDatabase.getPosts("tiktok");
    console.log("\nAll TikTok posts:");
    console.table(posts);
  } catch (err) {
    console.error(`Failed: ${err.message}`);
  }
}

/**
 * ============================================================================
 * EXAMPLE 6: Pinterest with Board ID
 * ============================================================================
 */

async function example_pinterestWithBoard() {
  console.log("\n=== Example 6: Pinterest (Requires Board ID) ===\n");

  const videoBuffer = fs.readFileSync("./video.mp4");
  const caption = "Check out this amazing video! #viral";

  // You need to get your board ID from Pinterest API first
  const boardId = process.env.PINTEREST_BOARD_ID || "my-board";

  try {
    console.log(`📌 Creating pin on board "${boardId}"...`);

    const result = await postToSocialMedia("pinterest", videoBuffer, caption, process.env.PINTEREST_TOKEN, {
      boardId,
    });

    console.log("✓ Pin created!");
    console.log(`   URL: ${result.url}`);
    console.log(`   Pin ID: ${result.pinId}`);
  } catch (err) {
    console.error(`✗ Failed: ${err.message}`);
  }
}

/**
 * ============================================================================
 * EXAMPLE 7: Error Handling & Graceful Degradation
 * ============================================================================
 */

async function example_errorHandling() {
  console.log("\n=== Example 7: Error Handling ===\n");

  const videoBuffer = fs.readFileSync("./video.mp4");
  const platforms = ["tiktok", "instagram", "youtube", "facebook"];

  const results = {
    successful: [],
    failed: [],
  };

  for (const platform of platforms) {
    try {
      const result = await postToSocialMedia(
        platform,
        videoBuffer,
        `My video on ${platform}!`,
        process.env[`${platform.toUpperCase()}_TOKEN`]
      );

      results.successful.push({
        platform,
        url: result.url,
        timestamp: result.timestamp,
      });

      console.log(`✓ ${platform}: ${result.url}`);
    } catch (err) {
      results.failed.push({
        platform,
        error: err.message,
        timestamp: new Date().toISOString(),
      });

      console.error(`✗ ${platform}: ${err.message}`);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Posted to ${results.successful.length}/${platforms.length} platforms`);
  console.log(`Failed on ${results.failed.length} platforms`);

  if (results.failed.length > 0) {
    console.log("\nFailed platforms:");
    results.failed.forEach(({ platform, error }) => {
      console.log(`  - ${platform}: ${error}`);
    });
  }

  return results;
}

/**
 * ============================================================================
 * EXAMPLE 8: Batch Processing Multiple Videos
 * ============================================================================
 */

async function example_batchProcessing() {
  console.log("\n=== Example 8: Batch Processing Multiple Videos ===\n");

  const videoFiles = [
    { path: "./video1.mp4", caption: "First video! #viral" },
    { path: "./video2.mp4", caption: "Second video! #trending" },
    { path: "./video3.mp4", caption: "Third video! #amazing" },
  ];

  const platform = "tiktok";
  const token = process.env.TIKTOK_TOKEN;

  const results = [];

  for (const [index, { path, caption }] of videoFiles.entries()) {
    try {
      if (!fs.existsSync(path)) {
        console.log(`⊘ Skipping ${path} (file not found)`);
        continue;
      }

      console.log(`Processing ${index + 1}/${videoFiles.length}: ${path}...`);

      const videoBuffer = fs.readFileSync(path);
      const result = await postToSocialMedia(platform, videoBuffer, caption, token);

      results.push({ file: path, status: "success", url: result.url });
      console.log(`✓ Posted: ${result.url}\n`);

      // Wait between uploads
      if (index < videoFiles.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    } catch (err) {
      results.push({ file: path, status: "failed", error: err.message });
      console.error(`✗ Failed: ${err.message}\n`);
    }
  }

  console.log("\n=== Batch Results ===");
  console.table(results);

  const successCount = results.filter((r) => r.status === "success").length;
  console.log(`\nPosted ${successCount}/${results.length} videos successfully`);
}

/**
 * ============================================================================
 * EXAMPLE 9: Real-Time Monitoring & Logging
 * ============================================================================
 */

class PostingMonitor {
  constructor() {
    this.events = [];
    this.stats = {
      totalAttempts: 0,
      successCount: 0,
      failureCount: 0,
      totalSize: 0,
      platforms: {},
    };
  }

  logEvent(type, platform, data) {
    const event = {
      timestamp: new Date().toISOString(),
      type,
      platform,
      ...data,
    };
    this.events.push(event);
    console.log(`[${type.toUpperCase()}] ${platform}: ${JSON.stringify(data)}`);
  }

  async uploadWithMonitoring(platform, videoBuffer, caption, token) {
    this.stats.totalAttempts++;
    this.stats.platforms[platform] = (this.stats.platforms[platform] || 0) + 1;
    this.stats.totalSize += videoBuffer.length;

    this.logEvent("upload_start", platform, {
      videoSize: (videoBuffer.length / 1024 / 1024).toFixed(2),
      captionLength: caption.length,
    });

    try {
      const startTime = Date.now();
      const result = await postToSocialMedia(platform, videoBuffer, caption, token);
      const duration = Date.now() - startTime;

      this.stats.successCount++;
      this.logEvent("upload_success", platform, {
        videoId: result.videoId,
        url: result.url,
        durationMs: duration,
      });

      return result;
    } catch (err) {
      this.stats.failureCount++;
      this.logEvent("upload_failure", platform, {
        error: err.message,
      });

      throw err;
    }
  }

  getReport() {
    return {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      successRate: ((this.stats.successCount / this.stats.totalAttempts) * 100).toFixed(1),
      totalDataProcessed: (this.stats.totalSize / 1024 / 1024 / 1024).toFixed(2),
    };
  }
}

async function example_monitoring() {
  console.log("\n=== Example 9: Real-Time Monitoring ===\n");

  const monitor = new PostingMonitor();
  const videoBuffer = fs.readFileSync("./video.mp4");

  const platforms = ["tiktok", "instagram", "youtube"];

  for (const platform of platforms) {
    try {
      await monitor.uploadWithMonitoring(
        platform,
        videoBuffer,
        `My video on ${platform}!`,
        process.env[`${platform.toUpperCase()}_TOKEN`]
      );
    } catch (err) {
      // Error already logged
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log("\n=== Monitoring Report ===");
  console.table(monitor.getReport());

  console.log("\nDetailed Events:");
  monitor.events.forEach((event) => {
    console.log(`${event.timestamp} - ${event.type} - ${event.platform}`);
  });
}

/**
 * ============================================================================
 * EXAMPLE 10: Token Refresh & Validation
 * ============================================================================
 */

async function example_tokenValidation() {
  console.log("\n=== Example 10: Token Validation ===\n");

  /**
   * Mock token validation for each platform
   */
  async function validateToken(platform, token) {
    // In production, make actual API call to validate
    console.log(`Validating ${platform} token...`);

    if (!token) {
      return { valid: false, reason: "Token not provided" };
    }

    if (token.length < 10) {
      return { valid: false, reason: "Token too short" };
    }

    // Simulate API validation
    const isValid = Math.random() > 0.2; // 80% valid
    return {
      valid: isValid,
      reason: isValid ? "Token is valid" : "Token expired or invalid",
    };
  }

  const platforms = ["tiktok", "instagram", "youtube"];

  for (const platform of platforms) {
    const token = process.env[`${platform.toUpperCase()}_TOKEN`];
    const validation = await validateToken(platform, token);

    if (validation.valid) {
      console.log(`✓ ${platform}: ${validation.reason}`);
    } else {
      console.log(`✗ ${platform}: ${validation.reason}`);
    }
  }
}

/**
 * ============================================================================
 * RUNNER: Execute Examples
 * ============================================================================
 */

async function runExamples() {
  const examples = [
    // { name: "Simple Post", fn: example_simpleSinglePost },
    // { name: "Cross-Platform Sequential", fn: example_crossPlatformSequential },
    // { name: "Queue with Rate Limiting", fn: example_queueWithRateLimiting },
    // { name: "Retry with Backoff", fn: example_retryWithBackoff },
    // { name: "Database Integration", fn: example_databaseIntegration },
    // { name: "Pinterest with Board", fn: example_pinterestWithBoard },
    // { name: "Error Handling", fn: example_errorHandling },
    // { name: "Batch Processing", fn: example_batchProcessing },
    // { name: "Real-Time Monitoring", fn: example_monitoring },
    { name: "Token Validation", fn: example_tokenValidation },
  ];

  console.log("Social Media Poster Examples\n");
  console.log("To run an example, uncomment it in runExamples() at the bottom of this file.\n");

  for (const { name, fn } of examples) {
    try {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Running: ${name}`);
      console.log("=".repeat(60));

      await fn();
    } catch (err) {
      console.error(`\nExample failed: ${err.message}`);
    }
  }
}

// Uncomment to run examples:
// runExamples().catch(console.error);

module.exports = {
  SocialMediaQueue,
  PostingMonitor,
  example_simpleSinglePost,
  example_crossPlatformSequential,
  example_queueWithRateLimiting,
  example_retryWithBackoff,
  example_databaseIntegration,
  example_pinterestWithBoard,
  example_errorHandling,
  example_batchProcessing,
  example_monitoring,
  example_tokenValidation,
};
