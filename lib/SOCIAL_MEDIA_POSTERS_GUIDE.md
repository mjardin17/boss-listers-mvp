# Social Media Video Posting Adapters

Production-grade, platform-specific video uploaders for 8 social media platforms with retry logic, rate limiting, validation, and comprehensive error handling.

## Supported Platforms

1. **Instagram Reels** - Graph API v18.0
2. **TikTok** - Open API v1
3. **YouTube Shorts** - YouTube API v3 (resumable upload)
4. **Facebook** - Graph API v18.0
5. **Twitter/X** - API v2 + Upload v1.1
6. **LinkedIn** - API v2
7. **Snapchat Spotlight** - Ads API v1
8. **Pinterest** - API v1

## Quick Start

```javascript
const { postToSocialMedia } = require("./socialMediaPosters");
const fs = require("fs");

// Read your video
const videoBuffer = fs.readFileSync("video.mp4");
const caption = "Check this out! #amazing #viral";

// Post to TikTok
try {
  const result = await postToSocialMedia("tiktok", videoBuffer, caption, accessToken);
  console.log(`Posted to TikTok: ${result.url}`);
  // Output: Posted to TikTok: https://www.tiktok.com/video/7123456789012345678
} catch (error) {
  console.error(`Failed: ${error.message}`);
}
```

## API Reference

### Main Function

```javascript
async postToSocialMedia(platform, videoBuffer, caption, accessToken, options)
```

**Parameters:**
- `platform` (string): One of `instagram`, `tiktok`, `youtube`, `facebook`, `twitter`, `linkedin`, `snapchat`, `pinterest`
- `videoBuffer` (Buffer): Video file data (binary)
- `caption` (string): Video description/caption
- `accessToken` (string): OAuth 2.0 access token for the platform
- `options` (object, optional):
  - `boardId` (string): Required for Pinterest only

**Returns:**
- Success: Object with `platform`, `url`, `videoId`, `timestamp`
- Failure: Object with `platform`, `error`, `success: false`, `timestamp`

**Example:**
```javascript
// Success response
{
  platform: "tiktok",
  videoId: "7123456789012345678",
  url: "https://www.tiktok.com/video/7123456789012345678",
  timestamp: "2024-01-15T10:30:00.000Z"
}

// Error response
{
  platform: "tiktok",
  error: "Video size 300MB exceeds maximum 274MB for tiktok",
  success: false,
  timestamp: "2024-01-15T10:30:00.000Z"
}
```

## Platform-Specific Details

### Instagram Reels

**Configuration:**
- Max size: 4GB
- Formats: MP4, QuickTime
- Caption length: 2200 chars
- Rate limit: 200 requests/hour

**API Flow:**
1. Upload video via `/me/media` endpoint
2. Wait for processing (status: PROCESSING → FINISHED)
3. Automatically publishes as reel

**Example:**
```javascript
const result = await postToSocialMedia(
  "instagram",
  videoBuffer,
  "My amazing reel! 🎬 #reels #trending",
  igAccessToken
);
// URL: https://instagram.com/reel/18345678901234567/
```

**Error Handling:**
- `OAuthException` (code 190): Invalid/expired access token
- Rate limit: Automatic retry with backoff
- Video processing errors: Detailed status in response

### TikTok

**Configuration:**
- Max size: 274MB
- Format: MP4 only
- Caption length: 150 chars
- Rate limit: 50 videos/hour

**API Flow:**
1. Upload video to `/video/upload` endpoint
2. Video is automatically published
3. Returns share URL immediately

**Example:**
```javascript
const result = await postToSocialMedia(
  "tiktok",
  videoBuffer,
  "#FYP #viral #trending", // 150 char limit
  tiktokAccessToken
);
// URL: https://www.tiktok.com/video/7123456789012345678
```

**Error Handling:**
- 429 Too Many Requests: Auto-retry with exponential backoff
- Invalid format: Detailed message about codec/container
- Rate limit errors: Will retry up to 3 times

**Important:** TikTok has strict rate limits. Implement request queuing in your application.

### YouTube Shorts

**Configuration:**
- Max size: 5GB
- Formats: MP4, QuickTime, MPEG
- Title: 100 chars max
- Description: 5000 chars max
- Rate limit: 100 requests/hour

**API Flow:**
1. Initialize resumable upload session
2. Upload video chunk(s)
3. Video is processed and made public
4. Automatically categorized as Shorts if <60 seconds

**Example:**
```javascript
const result = await postToSocialMedia(
  "youtube",
  videoBuffer,
  "My YouTube Short!\n\nCheck out this awesome content. Like and subscribe for more!",
  youtubeAccessToken
);
// URL: https://youtube.com/shorts/Rz7kCjhQsOQ
```

**Error Handling:**
- Resumable upload ensures large files upload reliably
- Automatic retry on connection loss
- Processing status tracking (uploadStatus: processed)

**Note:** YouTube has a significant upload delay. Video may not appear immediately.

### Facebook

**Configuration:**
- Max size: 2GB
- Formats: MP4, QuickTime
- Caption length: 63206 chars
- Rate limit: 200 requests/hour

**API Flow:**
1. Upload video with `published=false`
2. Auto-publishes after upload completes
3. Video appears in timeline

**Example:**
```javascript
const result = await postToSocialMedia(
  "facebook",
  videoBuffer,
  "Check out this amazing video! #trending #share",
  fbAccessToken
);
// URL: https://facebook.com/video.php?v=123456789012345
```

**Error Handling:**
- Requires page admin access
- Rate limit: Automatic retry
- Publishing failure: Logged as warning (video uploaded but not auto-published)

**Note:** Video processing takes time. Status may show as processing initially.

### Twitter/X

**Configuration:**
- Max size: 512MB
- Format: MP4 only
- Caption length: 280 chars
- Rate limit: 300 requests/15 minutes

**API Flow:**
1. Upload media to upload.twitter.com (base64 encoded)
2. Get media ID
3. Post tweet linking media
4. Media expires in 1 hour if not posted

**Example:**
```javascript
const result = await postToSocialMedia(
  "twitter",
  videoBuffer,
  "Check this out! #viral", // 280 char limit
  twitterAccessToken
);
// URL: https://twitter.com/user/status/1445765480
```

**Error Handling:**
- Media upload failure: Detailed reason for rejection
- Tweet posting failure: Separate error if media OK but tweet fails
- Expired media: Auto-retry handles this case

**Important:** Twitter's text limit is 280 characters. Captions will be truncated.

### LinkedIn

**Configuration:**
- Max size: 5GB
- Format: MP4 only
- Caption length: 3000 chars
- Rate limit: 100 requests/hour

**API Flow:**
1. Initialize upload session, get upload URL
2. Upload video binary via PUT request
3. Create post linking to video
4. Video is transcoded and published

**Example:**
```javascript
const result = await postToSocialMedia(
  "linkedin",
  videoBuffer,
  "Excited to share this amazing video with my network! #professional #video",
  linkedinAccessToken
);
// URL: https://linkedin.com/feed/update/urn:li:activity:6823456789012345678
```

**Error Handling:**
- Service unavailable (503): Will retry automatically
- Access denied: Check token and person/company permissions
- Transcoding delays: Video appears in feed after processing

**Note:** LinkedIn transcoding can take 5-30 minutes. Video will say "processing" initially.

### Snapchat Spotlight

**Configuration:**
- Max size: 512MB
- Format: MP4 only
- Caption length: 150 chars
- Rate limit: 100 requests/hour

**API Flow:**
1. Upload video with `creative_type: SPOTLIGHT_VIDEO`
2. Video undergoes content review
3. Published to Spotlight if approved

**Example:**
```javascript
const result = await postToSocialMedia(
  "snapchat",
  videoBuffer,
  "Check out my spotlight! #snapchat",
  snapchatAccessToken
);
// URL: https://snapchat.com/spotlight/spotlight_abc123def456
```

**Error Handling:**
- Not eligible for Spotlight: User account must be verified
- Content rejected: Video violates community guidelines
- Upload status: Returns processing status

**Important:** Requires Snapchat Business account and Spotlight partnership approval.

### Pinterest

**Configuration:**
- Max size: 2GB
- Format: MP4 only
- Caption length: 500 chars
- Rate limit: 100 requests/hour
- Daily limit: 15 pins/day (free accounts)

**API Flow:**
1. Video uploaded as base64 in request body
2. Pin created on specified board
3. Appears in feed and search

**Example:**
```javascript
const result = await postToSocialMedia(
  "pinterest",
  videoBuffer,
  "Check this out! #viral #trending",
  pinterestAccessToken,
  { boardId: "my-board-123" } // Required parameter
);
// URL: https://www.pinterest.com/pin/1234567890/
```

**Error Handling:**
- Invalid board: Check board_id and permissions
- Rate limit (15/day): Will throw error, implement request queuing
- Board not found: 3001 error code

**Important:** `boardId` is required for Pinterest. Obtain via Pinterest API.

## Retry Logic & Rate Limiting

All platforms implement automatic retry with exponential backoff:

```javascript
// Default retry configuration per platform
Instagram:   3 retries, 1000ms initial delay
TikTok:      3 retries, 2000ms initial delay
YouTube:     5 retries, 2000ms initial delay
Facebook:    3 retries, 1000ms initial delay
Twitter:     3 retries, 1000ms initial delay
LinkedIn:    3 retries, 2000ms initial delay
Snapchat:    3 retries, 1000ms initial delay
Pinterest:   3 retries, 1000ms initial delay
```

Backoff formula: `delay = initialDelay * 2^attemptNumber`

### Rate Limit Awareness

Your application should implement rate limiting to respect platform limits:

```javascript
// Example: TikTok rate limiter
const queue = [];
const MAX_PER_HOUR = 50;
let requestCount = 0;
let resetTime = Date.now() + 3600000;

async function queueTikTokPost(video, caption, token) {
  return new Promise((resolve) => {
    queue.push({ video, caption, token, resolve });
    processQueue();
  });
}

function processQueue() {
  if (Date.now() > resetTime) {
    requestCount = 0;
    resetTime = Date.now() + 3600000;
  }

  while (queue.length > 0 && requestCount < MAX_PER_HOUR) {
    const { video, caption, token, resolve } = queue.shift();
    requestCount++;
    postToSocialMedia("tiktok", video, caption, token).then(resolve);
  }

  if (queue.length > 0) {
    setTimeout(processQueue, 60000); // Check every minute
  }
}
```

## Video Validation

All uploads validate video before sending to API:

```javascript
const { validateVideo } = require("./socialMediaPosters");

try {
  validateVideo(videoBuffer, "tiktok");
  // Validates:
  // - Buffer is not empty
  // - Size is within platform limit
  // - Format magic bytes match expected video format
} catch (err) {
  console.error(`Video rejected: ${err.message}`);
}
```

## Caption Validation

Captions are automatically validated and sanitized:

```javascript
const { validateCaption } = require("./socialMediaPosters");

const original = "My video with\x00null bytes and special chars";
const sanitized = validateCaption(original, "tiktok");
// Result: Truncated to 150 chars, null bytes removed
```

Platform caption limits:
- Instagram: 2200 chars
- TikTok: 150 chars
- YouTube: 5000 chars (description)
- Facebook: 63206 chars
- Twitter: 280 chars
- LinkedIn: 3000 chars
- Snapchat: 150 chars
- Pinterest: 500 chars

## Logging & Debugging

All operations are logged for debugging:

```javascript
// Enable debug logging
const { log } = require("./socialMediaPosters");

// Logs are output with platform context:
// [tiktok] Starting upload { videoSize: '10.50' }
// [tiktok] Upload successful { videoId: '7123456789012345678' }
```

Check server logs for:
- Upload start/completion
- Retry attempts
- Platform-specific errors
- Rate limit warnings

## Error Handling

### Retry-able Errors
These errors trigger automatic retry:
- Network timeouts
- 429 (Too Many Requests)
- 503 (Service Unavailable)
- 5xx server errors

### Non-retry-able Errors
These are returned immediately:
- 400 (Bad Request) - invalid video format
- 401 (Unauthorized) - invalid access token
- 403 (Forbidden) - insufficient permissions
- 404 (Not Found) - resource not found

### Parsing Platform Errors
Each platform returns errors in different formats. The adapter normalizes them:

```javascript
// All platforms normalize error messages
try {
  const result = await postToSocialMedia("tiktok", buffer, caption, token);
} catch (err) {
  // Error always includes platform and specific reason
  console.error(err.message);
  // Example: "Upload failed: Video format not supported (HTTP 400)"
}
```

## Timeout Handling

Each platform has a configured timeout:

```javascript
const PLATFORM_CONFIG = {
  instagram: { timeout: 30000 },   // 30 seconds
  tiktok: { timeout: 60000 },       // 60 seconds
  youtube: { timeout: 120000 },     // 120 seconds (resumable)
  facebook: { timeout: 30000 },
  twitter: { timeout: 30000 },
  linkedin: { timeout: 60000 },
  snapchat: { timeout: 30000 },
  pinterest: { timeout: 30000 },
};
```

Timeouts automatically trigger retry (up to max retries).

## Production Best Practices

### 1. Implement Request Queuing

```javascript
// Queue posts to respect rate limits
const queue = [];
let isProcessing = false;

async function addToQueue(platform, video, caption, token) {
  queue.push({ platform, video, caption, token });
  if (!isProcessing) {
    await processQueue();
  }
}

async function processQueue() {
  isProcessing = true;
  while (queue.length > 0) {
    const { platform, video, caption, token } = queue.shift();
    const config = PLATFORM_CONFIG[platform];
    
    try {
      const result = await postToSocialMedia(platform, video, caption, token);
      console.log(`✓ Posted to ${platform}: ${result.url}`);
    } catch (err) {
      console.error(`✗ Failed on ${platform}: ${err.message}`);
      // Decide: re-queue or skip
    }

    // Wait before next request (rate limiting)
    if (queue.length > 0) {
      await new Promise(resolve => 
        setTimeout(resolve, config.rateLimit.windowMs / config.rateLimit.requests)
      );
    }
  }
  isProcessing = false;
}
```

### 2. Store Posted URLs

```javascript
const db = require("./database");

const result = await postToSocialMedia(platform, video, caption, token);
if (result.url) {
  await db.savePost({
    platform,
    videoId: result.videoId,
    url: result.url,
    caption,
    postedAt: result.timestamp,
    status: "published"
  });
}
```

### 3. Implement Retry Backoff in Application

```javascript
async function uploadWithRetry(platform, video, caption, token, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await postToSocialMedia(platform, video, caption, token);
    } catch (err) {
      lastError = err;
      const delay = Math.pow(2, attempt) * 5000; // 5s, 10s, 20s
      console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}
```

### 4. Monitor and Alert

```javascript
const result = await postToSocialMedia(platform, video, caption, token);

if (result.success === false) {
  // Send to monitoring/alert system
  await monitoring.alert({
    service: "social_media_poster",
    platform,
    error: result.error,
    severity: "warning"
  });
}
```

### 5. Validate Access Tokens

```javascript
// Validate token before posting
async function isTokenValid(platform, token) {
  try {
    const response = await fetch(
      `${PLATFORM_CONFIG[platform].baseUrl}/me`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.ok;
  } catch {
    return false;
  }
}

// Use in application
if (!await isTokenValid(platform, token)) {
  throw new Error(`Invalid token for ${platform}`);
}
```

## Testing

### Unit Tests
```bash
npm test -- socialMediaPosters.test.js
```

### Manual Testing

```javascript
const fs = require("fs");
const { postToSocialMedia } = require("./socialMediaPosters");

// Create 10MB test video
const testVideo = Buffer.alloc(10 * 1024 * 1024);
testVideo.write("ftypiso2", 0); // Add MP4 signature

(async () => {
  try {
    const result = await postToSocialMedia(
      "tiktok",
      testVideo,
      "#test #video",
      process.env.TIKTOK_TOKEN
    );
    console.log("Success:", result);
  } catch (err) {
    console.error("Failed:", err.message);
  }
})();
```

## Troubleshooting

### Issue: "Invalid video buffer"
**Cause:** Buffer is not a Node.js Buffer object
**Solution:** Ensure you're reading file correctly: `const buf = fs.readFileSync("video.mp4")`

### Issue: "Video size exceeds maximum"
**Cause:** Video file is too large for platform
**Solution:** Compress video or use smaller file. Check `PLATFORM_CONFIG[platform].maxVideoSize`

### Issue: "Invalid OAuth access token"
**Cause:** Token is expired or invalid
**Solution:** Refresh token via OAuth flow for the platform

### Issue: "Rate limit exceeded"
**Cause:** Too many requests in time window
**Solution:** Implement request queuing and rate limiting in your application

### Issue: Video uploaded but doesn't appear
**Cause:** Platform still processing
**Solution:** This is normal. YouTube and LinkedIn can take 5-30 minutes. Check back later.

### Issue: "Timeout" errors frequently
**Cause:** Slow network or platform is overloaded
**Solution:** Increase timeout in PLATFORM_CONFIG or implement circuit breaker pattern

## API Compatibility

| Platform | API Version | Status | Notes |
|----------|-------------|--------|-------|
| Instagram | Graph API v18.0 | ✓ | Regularly updated by Meta |
| TikTok | Open API v1 | ✓ | Requires business account |
| YouTube | API v3 | ✓ | Standard Google API |
| Facebook | Graph API v18.0 | ✓ | Regularly updated by Meta |
| Twitter/X | API v2 + Upload v1.1 | ✓ | v1.1 for media, v2 for tweets |
| LinkedIn | API v2 | ✓ | Stable API |
| Snapchat | Ads API v1 | ✓ | Requires business account |
| Pinterest | API v1 | ✓ | Stable API |

## Future Improvements

- [ ] Support for scheduling (post at specific time)
- [ ] Analytics tracking (views, engagements)
- [ ] Batch upload support
- [ ] Video transcoding/format conversion
- [ ] Thumbnail extraction
- [ ] Automatic caption translation
- [ ] Platform-specific hashtag suggestions
- [ ] Cross-posting to multiple platforms

## License

Copyright 2024. All rights reserved.
