# Boss Listers Photo→Everywhere Automation: Complete Architecture
**Status:** Proposed  
**Date:** 2026-08-26  
**Decision Drivers:** Security, scalability, reliability, user experience  
**Context:** Completing 6 missing architectural layers for a photo-to-27-marketplaces + social video automation system

---

## Executive Summary

This document defines the complete architecture for the remaining 6 layers of the Boss Listers photo→everywhere automation system:

1. **OAuth Architecture** — Secure multi-platform credential flow
2. **Credential Management** — Encrypted token storage & refresh
3. **Upload UI Architecture** — Real-time progress, error handling
4. **Social Media Posting** — Adapter pattern for 8 platforms
5. **Workflow Orchestration** — End-to-end async pipeline
6. **Data Models** — Supabase schema & API contracts

**Tech Stack:** Next.js 14.2 + Supabase + React 18.3 + Remotion (video) + OpenAI Vision

---

## 1. OAuth Architecture

### 1.1 OAuth Flow Design

#### Decision: Per-Platform OAuth with Embedded Server-Side State

Each of the 8 social platforms (Instagram, TikTok, YouTube, Facebook, Twitter/X, LinkedIn, Snapchat, Pinterest) has distinct OAuth requirements and scopes. We implement a **standardized OAuth proxy** that normalizes across variants.

**Flow:**

```
┌─────────────────────────────────────────────────────────────┐
│ User clicks "Connect Instagram" on React component          │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ POST /api/oauth/initiate                                    │
│  body: { platform: 'instagram', userId: '...' }             │
│  Returns: { authUrl, state, platform }                      │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ User authorizes at platform (Instagram login + grant)       │
│ Platform redirects to: /api/oauth/callback                  │
│  query: { code, state, platform }                           │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ /api/oauth/callback                                         │
│  1. Validate state (CSRF protection)                        │
│  2. Exchange code for access_token + refresh_token          │
│  3. Validate token with API test call                       │
│  4. Encrypt & store in oauth_credentials table              │
│  5. Update social_media_auth.status = 'connected'           │
│  6. Redirect to /social-setup?success=true                  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Per-Platform OAuth Details

| Platform | OAuth 2.0 Type | Scope | Token Lifetime | Refresh | Test Endpoint |
|----------|---|---|---|---|---|
| **Instagram** | Authorization Code | `instagram_basic,instagram_graph_user_media` | 60 days | Yes | `GET /me` |
| **TikTok** | Authorization Code | `user.info.basic,video.upload` | 1 year | No (expires, retry login) | `GET /user/info` |
| **YouTube** | Authorization Code | `https://www.googleapis.com/auth/youtube` | 1 hour | Yes | `GET /youtube/v3/channels?part=snippet` |
| **Facebook** | Authorization Code | `pages_read_engagement,pages_manage_posts,pages_read_user_profile` | 60 days | Yes | `GET /me/pages` |
| **Twitter/X** | OAuth 2.0 PKCE | `tweet.write,users.read` | 2 hours | Yes (refresh) | `GET /2/users/me` |
| **LinkedIn** | Authorization Code | `w_member_social` | 2 months | Yes | `GET /v2/me` |
| **Snapchat** | Authorization Code | `snapchat-marketing-api` | varies | Yes | `GET /me` |
| **Pinterest** | Authorization Code | `pins:read,pins:create` | 1 year | No | `GET /v5/user/account` |

**Key Decision:** Refresh tokens stored encrypted in Supabase. Access tokens cached in Redis (1 hour TTL) for performance, bypassing repeated refresh calls.

### 1.3 State Management & CSRF Protection

```typescript
// server-side state generation (5-minute TTL)
POST /api/oauth/initiate
  body: { platform, userId, retryCount? }

// Generate & store state
const state = crypto.randomUUID();
const nonce = crypto.randomBytes(32).toString('hex');

await supabase
  .from('oauth_pending_states')
  .insert({
    state,
    nonce,
    platform,
    user_id: userId,
    created_at: new Date(),
    expires_at: new Date(Date.now() + 5 * 60_000),
    redirect_uri: `${BASE_URL}/api/oauth/callback`,
  });

// Return auth URL with platform-specific params
return {
  authUrl: buildPlatformAuthUrl(platform, state),
  state,
  platform,
  expiresIn: 300,
};
```

**Why server-side state?** Prevents replay attacks. State expires after 5 minutes. Used exactly once during callback.

---

## 2. Credential Management

### 2.1 Encryption Strategy

**Decision: Per-User Encryption Keys + Field-Level Encryption**

```sql
-- oauth_credentials table (encrypted storage)
CREATE TABLE oauth_credentials (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  platform varchar NOT NULL,
  access_token text NOT NULL, -- encrypted with user's key
  refresh_token text, -- encrypted (nullable for non-refresh platforms)
  expires_at timestamp,
  scope text NOT NULL,
  platform_user_id varchar, -- e.g., Instagram account ID
  platform_username varchar,
  status 'connected' | 'expired' | 'revoked' | 'error',
  error_message text,
  last_test_at timestamp,
  created_at timestamp,
  updated_at timestamp,
  UNIQUE(user_id, platform)
);
```

**Encryption Implementation:**

```typescript
// lib/crypto/credentialEncryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_ALGO = 'aes-256-gcm';

export async function encryptCredential(
  credential: string,
  userEncryptionKey: Buffer // derived from user's Supabase key
): Promise<{ ciphertext: string; iv: string; authTag: string }> {
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv(ENCRYPTION_ALGO, userEncryptionKey, iv);
  
  let encrypted = cipher.update(credential, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

export async function decryptCredential(
  encrypted: { ciphertext: string; iv: string; authTag: string },
  userEncryptionKey: Buffer
): Promise<string> {
  const decipher = createDecipheriv(
    ENCRYPTION_ALGO,
    userEncryptionKey,
    Buffer.from(encrypted.iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

**Why user-specific keys?** If database is breached, attacker cannot decrypt credentials without also compromising individual user keys (stored separately in Supabase Auth secrets).

### 2.2 Token Refresh Management

```typescript
// server-side token refresh orchestrator
// lib/oauth/refreshManager.ts

class TokenRefreshManager {
  private redisCache: RedisClient; // 1-hour TTL
  
  async getValidAccessToken(
    userId: string,
    platform: string
  ): Promise<string> {
    // 1. Check Redis cache
    const cached = await this.redisCache.get(
      `oauth:token:${userId}:${platform}`
    );
    if (cached) return cached;
    
    // 2. Fetch from DB
    const cred = await supabase
      .from('oauth_credentials')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();
    
    if (!cred.data) throw new Error(`${platform} not connected`);
    
    // 3. Check if token expired
    const expiresAt = new Date(cred.data.expires_at);
    const now = new Date();
    const refreshWindow = 5 * 60_000; // 5-minute safety margin
    
    if (expiresAt.getTime() - now.getTime() > refreshWindow) {
      // Token still valid; cache it
      await this.redisCache.set(
        `oauth:token:${userId}:${platform}`,
        cred.data.access_token,
        'EX', 3600
      );
      return cred.data.access_token;
    }
    
    // 4. Refresh token if platform supports it
    if (!cred.data.refresh_token) {
      return this.handleTokenExpiredNoRefresh(userId, platform);
    }
    
    const newTokens = await this.exchangeRefreshToken(
      platform,
      cred.data.refresh_token
    );
    
    // 5. Update DB with new tokens
    await this.updateStoredCredentials(userId, platform, newTokens);
    
    // 6. Cache new token
    await this.redisCache.set(
      `oauth:token:${userId}:${platform}`,
      newTokens.access_token,
      'EX', 3600
    );
    
    return newTokens.access_token;
  }
  
  private async handleTokenExpiredNoRefresh(
    userId: string,
    platform: string
  ) {
    // For platforms like TikTok that don't support refresh:
    // Mark as expired and return error prompting re-login
    await supabase
      .from('oauth_credentials')
      .update({ status: 'expired' })
      .eq('user_id', userId)
      .eq('platform', platform);
    
    throw new Error(
      `${platform} authentication expired. Please reconnect.`
    );
  }
  
  private async exchangeRefreshToken(
    platform: string,
    refreshToken: string
  ): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
    // Platform-specific logic
    const handlers = {
      instagram: exchangeInstagramRefreshToken,
      youtube: exchangeYoutubeRefreshToken,
      // ... etc
    };
    return handlers[platform](refreshToken);
  }
}
```

### 2.3 Credential Rotation & Revocation

```sql
-- audit_log table tracks all credential access
CREATE TABLE oauth_audit_log (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  platform varchar,
  action 'token_used' | 'token_refreshed' | 'revoked' | 'test_failed' | 'access_requested',
  status 'success' | 'failure',
  error_message text,
  ip_address inet,
  user_agent text,
  created_at timestamp DEFAULT now()
);

-- scheduled: daily credential test
-- Catches revoked/expired credentials early
CREATE FUNCTION test_all_oauth_credentials() RETURNS void AS $$
BEGIN
  FOR cred IN 
    SELECT id, user_id, platform FROM oauth_credentials 
    WHERE status = 'connected' 
      AND (last_test_at IS NULL OR last_test_at < NOW() - INTERVAL '24 hours')
  LOOP
    PERFORM test_platform_credential(cred.user_id, cred.platform);
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

---

## 3. Upload UI Architecture

### 3.1 Photo Upload Component Structure

```typescript
// components/PhotoUpload/PhotoUpload.tsx
interface PhotoUploadProps {
  userId: string;
  onPhotoExtracted?: (data: PhotoExtractionResult) => void;
  onError?: (error: Error) => void;
  maxFileSize?: number; // 50MB default
}

// Multi-step upload flow:
// 1. Photo Capture/Selection
// 2. Upload Progress (streaming)
// 3. Claude Vision Extraction (real-time progress)
// 4. Marketplace Auto-post (orchestration)
// 5. Social Media Video Generation & Posting
```

**Component hierarchy:**

```
PhotoUpload (container)
├── CameraCapture (camera input)
│   └── VideoPreview
├── FileUpload (drag-drop)
│   └── ProgressBar (real-time)
├── ExtractionProgress (Vision API streaming)
│   └── ExtractedDataPreview
├── WorkflowOrchestration
│   ├── MarketplacePosting (27 targets)
│   ├── VideoGeneration (Remotion + Studio)
│   └── SocialMediaPosting (8 platforms)
└── CompletionSummary (results)
```

### 3.2 Real-Time Progress Tracking

**Decision: Server-Sent Events (SSE) for live updates**

```typescript
// app/api/upload/route.ts (streaming)
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const file = await req.formData().then(f => f.get('photo'));
  const userId = req.headers.get('x-user-id');
  
  // Return readable stream for real-time progress
  const encoder = new TextEncoder();
  let responseStream = new ReadableStream({
    async start(controller) {
      try {
        // 1. Upload to Supabase Storage
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ 
            step: 'uploading', 
            progress: 0 
          })}\n\n`
        ));
        
        const { data: uploaded, error: uploadErr } = await supabase.storage
          .from('product-photos')
          .upload(`${userId}/${Date.now()}.jpg`, file, {
            onUploadProgress: (progress) => {
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ 
                  step: 'uploading', 
                  progress: Math.round((progress.loaded / progress.total) * 100) 
                })}\n\n`
              ));
            },
          });
        
        // 2. Extract via Claude Vision
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ 
            step: 'extracting', 
            progress: 0 
          })}\n\n`
        ));
        
        const extraction = await extractProductData(
          uploaded.path,
          (progress) => {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ 
                step: 'extracting', 
                progress, 
                intermediate: true 
              })}\n\n`
            ));
          }
        );
        
        // 3. Publish to marketplaces
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ 
            step: 'publishing_marketplaces', 
            total: 27, 
            completed: 0 
          })}\n\n`
        ));
        
        const marketplaceResults = await publishToMarketplaces(
          extraction,
          userId,
          (completed, total) => {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ 
                step: 'publishing_marketplaces', 
                completed, 
                total 
              })}\n\n`
            ));
          }
        );
        
        // 4. Generate & post commercial
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ 
            step: 'generating_commercial', 
            progress: 0 
          })}\n\n`
        ));
        
        const commercial = await generateCommercial(
          extraction,
          (progress) => {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ 
                step: 'generating_commercial', 
                progress 
              })}\n\n`
            ));
          }
        );
        
        // 5. Post to social media
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ 
            step: 'posting_social', 
            platforms: ['instagram', 'tiktok', 'youtube', ...], 
            completed: 0 
          })}\n\n`
        ));
        
        const socialResults = await postToSocial(
          commercial,
          userId,
          (platform, status) => {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ 
                step: 'posting_social', 
                platform, 
                status 
              })}\n\n`
            ));
          }
        );
        
        // Final summary
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ 
            step: 'complete', 
            marketplaces: marketplaceResults, 
            social: socialResults, 
            videoUrl: commercial.url 
          })}\n\n`
        ));
        
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ 
            step: 'error', 
            error: err.message 
          })}\n\n`
        ));
        controller.close();
      }
    },
  });
  
  return new NextResponse(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

**React SSE consumer:**

```typescript
// hooks/usePhotoUpload.ts
export function usePhotoUpload(userId: string) {
  const [progress, setProgress] = useState<UploadProgress>({
    step: 'idle',
    overallProgress: 0,
  });
  
  const uploadPhoto = async (file: File) => {
    const formData = new FormData();
    formData.append('photo', file);
    
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      headers: { 'x-user-id': userId },
    });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          setProgress(prev => ({
            ...prev,
            [data.step]: data,
            overallProgress: calculateOverallProgress(data),
          }));
        }
      }
    }
  };
  
  return { progress, uploadPhoto };
}
```

### 3.3 Error Handling & Retry Logic

```typescript
// lib/upload/retryStrategy.ts

interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
  maxBackoffMs: number;
  retryableErrors: Set<string>;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
  maxBackoffMs: 30_000,
  retryableErrors: new Set([
    'NETWORK_ERROR',
    'TIMEOUT',
    'RATE_LIMITED',
    'SERVICE_UNAVAILABLE',
  ]),
};

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  stepName: string,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      
      // Check if error is retryable
      if (!cfg.retryableErrors.has(err.code)) {
        throw err; // Fail fast for non-retryable errors
      }
      
      // Exponential backoff
      if (attempt < cfg.maxAttempts - 1) {
        const backoff = Math.min(
          cfg.backoffMs * Math.pow(cfg.backoffMultiplier, attempt),
          cfg.maxBackoffMs
        );
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }
  }
  
  throw new Error(
    `${stepName} failed after ${cfg.maxAttempts} attempts: ${lastError?.message}`
  );
}
```

**Photo Validation:**

```typescript
// lib/upload/photoValidation.ts
export async function validatePhoto(file: File): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 1. File size check (50MB max)
  if (file.size > 50 * 1024 * 1024) {
    errors.push('File exceeds 50MB limit');
  }
  
  // 2. File type check
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  if (!ALLOWED_TYPES.includes(file.type)) {
    errors.push(`Invalid format. Allowed: ${ALLOWED_TYPES.join(', ')}`);
  }
  
  // 3. Image dimensions check (via ImageData API)
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
  
  if (img.width < 400 || img.height < 400) {
    warnings.push('Image is smaller than recommended 400x400px');
  }
  
  if (img.width > 4000 || img.height > 4000) {
    warnings.push('Very large image; compression recommended');
  }
  
  // 4. Blur detection (basic OpenCV if available)
  const isBlurry = await detectBlur(img);
  if (isBlurry) {
    warnings.push('Image may be blurry; consider retaking');
  }
  
  return { valid: errors.length === 0, errors, warnings };
}
```

---

## 4. Social Media Posting Architecture

### 4.1 Adapter Pattern for 8 Platforms

```typescript
// lib/social/adapters/base.ts
export interface SocialMediaAdapter {
  platform: string;
  
  // Validate video meets platform specs
  validateVideo(video: VideoSpec): Promise<ValidationResult>;
  
  // Post video with caption
  post(opts: PostOptions): Promise<PostResult>;
  
  // Get analytics for a post
  getAnalytics(postId: string): Promise<Analytics>;
  
  // Delete a post
  delete(postId: string): Promise<void>;
}

export interface PostOptions {
  videoUrl: string; // URL to MP4 file
  caption: string;
  hashtags: string[];
  userId: string; // For token lookup
  metadata?: {
    productTitle?: string;
    productPrice?: string;
    affiliateUrl?: string;
  };
}

export interface PostResult {
  platform: string;
  postId: string;
  url: string;
  status: 'pending' | 'published' | 'failed';
  error?: string;
  createdAt: Date;
}

// lib/social/adapters/instagram.ts
import { SocialMediaAdapter, PostOptions, PostResult } from './base';

export class InstagramAdapter implements SocialMediaAdapter {
  platform = 'instagram';
  
  async validateVideo(video: VideoSpec): Promise<ValidationResult> {
    const errors: string[] = [];
    
    // Duration: 15-90s
    if (video.durationSeconds < 15 || video.durationSeconds > 90) {
      errors.push(`Instagram Reels require 15-90s (got ${video.durationSeconds}s)`);
    }
    
    // Aspect ratio: 9:16 (vertical)
    const ratio = video.width / video.height;
    if (Math.abs(ratio - (9 / 16)) > 0.05) {
      errors.push(`Instagram requires 9:16 aspect ratio (got ${ratio.toFixed(2)})`);
    }
    
    // Format: MP4
    if (video.codec !== 'h264') {
      errors.push('Instagram requires H.264 codec');
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  async post(opts: PostOptions): Promise<PostResult> {
    const { userId, caption, hashtags, videoUrl } = opts;
    
    // Get valid access token
    const accessToken = await getValidAccessToken(userId, 'instagram');
    
    try {
      // Step 1: Upload media
      const uploadRes = await fetch(
        'https://graph.instagram.com/v18.0/me/media',
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          body: JSON.stringify({
            media_type: 'VIDEO',
            video_url: videoUrl,
            caption: `${caption}\n\n${hashtags.join(' ')}`,
          }),
        }
      );
      
      if (!uploadRes.ok) {
        const error = await uploadRes.json();
        throw new Error(
          `Instagram upload failed: ${error.error?.message || 'unknown error'}`
        );
      }
      
      const { id: mediaId } = await uploadRes.json();
      
      // Step 2: Publish media
      const publishRes = await fetch(
        `https://graph.instagram.com/v18.0/${mediaId}/publish`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );
      
      if (!publishRes.ok) {
        throw new Error('Instagram publish failed');
      }
      
      const { id: postId } = await publishRes.json();
      
      return {
        platform: 'instagram',
        postId,
        url: `https://instagram.com/p/${postId}`,
        status: 'published',
        createdAt: new Date(),
      };
    } catch (err) {
      return {
        platform: 'instagram',
        postId: '',
        url: '',
        status: 'failed',
        error: err.message,
        createdAt: new Date(),
      };
    }
  }
  
  async getAnalytics(postId: string): Promise<Analytics> {
    // Insights API: GET /postId/insights?metric=engagement,impressions
    // Returns: { data: [{ name, values }] }
    return { /* ... */ };
  }
  
  async delete(postId: string): Promise<void> {
    // DELETE /postId
  }
}

// Similar adapters for TikTok, YouTube, Facebook, etc.
// lib/social/adapters/{tiktok,youtube,facebook,twitter,linkedin,snapchat,pinterest}.ts
```

### 4.2 Rate Limiting per Platform

```typescript
// lib/social/rateLimiter.ts

interface PlatformRateLimit {
  requestsPerHour: number;
  requestsPerDay: number;
  postsPerDay?: number;
  videoUploadConcurrency: number;
}

const PLATFORM_LIMITS: Record<string, PlatformRateLimit> = {
  instagram: {
    requestsPerHour: 200,
    requestsPerDay: 200, // Undocumented; conservative
    postsPerDay: 10,
    videoUploadConcurrency: 3,
  },
  tiktok: {
    requestsPerHour: 1000,
    requestsPerDay: 10_000,
    postsPerDay: 20,
    videoUploadConcurrency: 5,
  },
  youtube: {
    requestsPerHour: 10_000, // Quota-based; units per request
    requestsPerDay: 1_000_000,
    postsPerDay: 50,
    videoUploadConcurrency: 10,
  },
  facebook: {
    requestsPerHour: 600,
    requestsPerDay: 14_400,
    videoUploadConcurrency: 5,
  },
  twitter: {
    requestsPerHour: 450,
    requestsPerDay: 10_800,
    postsPerDay: 100,
    videoUploadConcurrency: 3,
  },
  linkedin: {
    requestsPerHour: 100,
    requestsPerDay: 2400,
    postsPerDay: 20,
    videoUploadConcurrency: 3,
  },
  snapchat: {
    requestsPerHour: 500,
    requestsPerDay: 12_000,
    videoUploadConcurrency: 2,
  },
  pinterest: {
    requestsPerHour: 600,
    requestsPerDay: 1440,
    videoUploadConcurrency: 2,
  },
};

export class RateLimiter {
  private redis: RedisClient;
  
  async checkLimit(
    userId: string,
    platform: string
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    const limit = PLATFORM_LIMITS[platform];
    if (!limit) return { allowed: true };
    
    const key = `rate:${userId}:${platform}`;
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      // First request this hour; set expiry
      await this.redis.expire(key, 3600);
    }
    
    if (current > limit.requestsPerHour) {
      const ttl = await this.redis.ttl(key);
      return {
        allowed: false,
        retryAfter: ttl,
      };
    }
    
    return { allowed: true };
  }
  
  async getStats(userId: string, platform: string) {
    const key = `rate:${userId}:${platform}`;
    const current = await this.redis.get(key);
    const limit = PLATFORM_LIMITS[platform];
    
    return {
      used: parseInt(current || '0', 10),
      limit: limit?.requestsPerHour || Infinity,
      remaining: Math.max(0, (limit?.requestsPerHour || Infinity) - (parseInt(current || '0', 10))),
    };
  }
}
```

### 4.3 Error Recovery & Dead-Letter Queue

```typescript
// lib/social/deadLetterQueue.ts

interface DeadLetterRecord {
  id: uuid;
  user_id: uuid;
  platform: string;
  video_url: string;
  caption: string;
  metadata: Record<string, any>;
  error: string;
  error_code: string;
  attempt_count: number;
  max_attempts: number;
  last_attempted_at: timestamp;
  next_retry_at: timestamp;
  status: 'pending' | 'retrying' | 'abandoned' | 'resolved';
  created_at: timestamp;
}

export class DeadLetterQueue {
  private supabase: SupabaseClient;
  
  async add(
    userId: string,
    platform: string,
    opts: PostOptions,
    error: Error,
    errorCode: string
  ): Promise<void> {
    await this.supabase.from('dead_letter_queue').insert({
      user_id: userId,
      platform,
      video_url: opts.videoUrl,
      caption: opts.caption,
      metadata: opts.metadata,
      error: error.message,
      error_code: errorCode,
      attempt_count: 1,
      max_attempts: 5,
      last_attempted_at: new Date(),
      next_retry_at: this.calculateBackoff(1),
      status: 'pending',
    });
  }
  
  async processQueue(): Promise<void> {
    // Scheduled job: runs every 30 minutes
    // Picks up pending/retrying items and attempts post again
    
    const due = await this.supabase
      .from('dead_letter_queue')
      .select('*')
      .in('status', ['pending', 'retrying'])
      .lte('next_retry_at', new Date());
    
    for (const record of due.data || []) {
      try {
        const adapter = this.getAdapter(record.platform);
        const result = await adapter.post({
          userId: record.user_id,
          videoUrl: record.video_url,
          caption: record.caption,
          hashtags: [], // Parse from metadata if needed
          metadata: record.metadata,
        });
        
        if (result.status === 'published') {
          // Success! Mark resolved
          await this.supabase
            .from('dead_letter_queue')
            .update({ status: 'resolved' })
            .eq('id', record.id);
        } else {
          // Still failing; retry with backoff
          const nextAttempt = record.attempt_count + 1;
          if (nextAttempt >= record.max_attempts) {
            await this.supabase
              .from('dead_letter_queue')
              .update({ 
                status: 'abandoned',
                error: `Failed after ${record.max_attempts} attempts: ${result.error}`,
              })
              .eq('id', record.id);
          } else {
            await this.supabase
              .from('dead_letter_queue')
              .update({
                status: 'retrying',
                attempt_count: nextAttempt,
                last_attempted_at: new Date(),
                next_retry_at: this.calculateBackoff(nextAttempt),
                error: result.error,
              })
              .eq('id', record.id);
          }
        }
      } catch (err) {
        // Catastrophic error; increment and backoff
        await this.supabase
          .from('dead_letter_queue')
          .update({
            attempt_count: record.attempt_count + 1,
            last_attempted_at: new Date(),
            next_retry_at: this.calculateBackoff(record.attempt_count + 1),
            error: err.message,
          })
          .eq('id', record.id);
      }
    }
  }
  
  private calculateBackoff(attemptNumber: number): Date {
    // Exponential backoff: 1min, 5min, 30min, 2hrs, 8hrs
    const backoffMs = [60, 300, 1800, 7200, 28800][attemptNumber - 1] || 28800;
    return new Date(Date.now() + backoffMs * 1000);
  }
}
```

---

## 5. Workflow Orchestration

### 5.1 End-to-End Flow Architecture

```
Photo Upload
    ↓
+─────────────────────────────────────┐
│ 1. EXTRACT (Claude Vision)          │ ← PhotoExtractionJob
│    - Product title/description      │   status: queued → processing → completed
│    - Price & condition              │   extracts stored in DB
│    - Category & dimensions          │
└─────────┬───────────────────────────┘
          ↓
+─────────────────────────────────────┐
│ 2. PUBLISH MARKETPLACES (parallel)  │ ← MarketplacePublishJob (27 concurrent)
│    - Amazon, eBay, Facebook, etc    │   status per platform
│    - Cross-listing engine           │   rate-limited by platform
│    - Adapt listings per platform    │   results: listing_urls, errors
└─────────┬───────────────────────────┘
          ↓
+─────────────────────────────────────┐
│ 3. GENERATE COMMERCIAL (Remotion)   │ ← CommercialGenerationJob
│    - Video Studio render            │   status: queued → rendering → completed
│    - MP4 (9:16 vertical)            │   video_url: s3://...
│    - Music + captions               │
└─────────┬───────────────────────────┘
          ↓
+─────────────────────────────────────┐
│ 4. POST TO SOCIAL (parallel)        │ ← SocialMediaPostJob (8 platforms)
│    - Instagram, TikTok, YouTube...  │   status per platform
│    - Platform-specific captions     │   rate-limited, retried on failure
│    - Links back to marketplaces     │   DLQ for failed posts
└─────────────────────────────────────┘
```

### 5.2 Job Queue & State Machine

```typescript
// lib/workflow/jobQueue.ts

export type JobType = 
  | 'photo_extraction'
  | 'marketplace_publish'
  | 'commercial_generation'
  | 'social_media_post';

export type JobStatus = 
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'retrying';

export interface WorkflowJob {
  id: uuid;
  user_id: uuid;
  workflow_id: uuid; // Groups all jobs from one photo upload
  type: JobType;
  status: JobStatus;
  priority: 'high' | 'normal' | 'low';
  payload: Record<string, any>;
  result: Record<string, any>;
  error: string;
  attempt_count: number;
  max_attempts: number;
  created_at: timestamp;
  started_at?: timestamp;
  completed_at?: timestamp;
  next_retry_at?: timestamp;
  depends_on?: uuid; // Job ID of dependency (e.g., extraction job)
}

export interface WorkflowExecution {
  id: uuid;
  user_id: uuid;
  photo_id: uuid;
  status: 'in_progress' | 'completed' | 'failed' | 'partial';
  extraction_job_id?: uuid;
  marketplace_jobs: uuid[]; // 27 job IDs
  commercial_job_id?: uuid;
  social_jobs: uuid[]; // 8 job IDs
  summary: {
    marketplaces_published: number;
    marketplaces_failed: number;
    social_posted: number;
    social_failed: number;
    video_url?: string;
  };
  created_at: timestamp;
  completed_at?: timestamp;
}

// Postgres-based queue (simpler than Redis for this workload)
export class WorkflowJobQueue {
  async enqueueExtraction(
    userId: string,
    photoId: string,
    workflowId: string
  ): Promise<string> {
    const { data } = await supabase
      .from('workflow_jobs')
      .insert({
        user_id: userId,
        workflow_id: workflowId,
        type: 'photo_extraction',
        status: 'queued',
        priority: 'high',
        payload: { photo_id: photoId },
      })
      .select('id');
    
    return data[0].id;
  }
  
  async enqueueDependents(
    extractionJobId: string,
    extractionResult: Record<string, any>
  ): Promise<void> {
    // Once extraction completes, enqueue marketplace jobs (27 parallel)
    // and commercial generation job
    
    const { data: job } = await supabase
      .from('workflow_jobs')
      .select('user_id, workflow_id')
      .eq('id', extractionJobId)
      .single();
    
    const marketplaceJobs = MARKETPLACES.map(platform => ({
      user_id: job.user_id,
      workflow_id: job.workflow_id,
      type: 'marketplace_publish',
      status: 'queued',
      priority: 'normal',
      payload: {
        platform,
        extraction_data: extractionResult,
      },
      depends_on: extractionJobId,
    }));
    
    const commercialJob = {
      user_id: job.user_id,
      workflow_id: job.workflow_id,
      type: 'commercial_generation',
      status: 'queued',
      priority: 'normal',
      payload: { extraction_data: extractionResult },
      depends_on: extractionJobId,
    };
    
    await supabase.from('workflow_jobs').insert([
      ...marketplaceJobs,
      commercialJob,
    ]);
  }
  
  async enqueueSocialJobs(
    commercialJobId: string,
    videoUrl: string
  ): Promise<void> {
    // Once commercial is done, enqueue social media jobs (8 parallel)
    
    const { data: job } = await supabase
      .from('workflow_jobs')
      .select('user_id, workflow_id, payload')
      .eq('id', commercialJobId)
      .single();
    
    const socialJobs = SOCIAL_PLATFORMS.map(platform => ({
      user_id: job.user_id,
      workflow_id: job.workflow_id,
      type: 'social_media_post',
      status: 'queued',
      priority: 'normal',
      payload: {
        platform,
        video_url: videoUrl,
        product_data: job.payload.extraction_data,
      },
      depends_on: commercialJobId,
    }));
    
    await supabase.from('workflow_jobs').insert(socialJobs);
  }
  
  async pollQueue(): Promise<WorkflowJob[]> {
    // Called every 5 seconds by Supabase Edge Function or cron job
    // Returns next batch of jobs ready to process
    
    return supabase
      .from('workflow_jobs')
      .select('*')
      .in('status', ['queued', 'retrying'])
      .or('depends_on.is.null,depends_on_completed:workflow_jobs!inner(id,status).eq(status,"completed")')
      .order('priority desc, created_at asc')
      .limit(10);
  }
  
  async markCompleted(jobId: string, result: Record<string, any>): Promise<void> {
    await supabase
      .from('workflow_jobs')
      .update({
        status: 'completed',
        result,
        completed_at: new Date(),
      })
      .eq('id', jobId);
    
    // Trigger dependent jobs
    const { data: dependents } = await supabase
      .from('workflow_jobs')
      .select('*')
      .eq('depends_on', jobId)
      .eq('status', 'queued');
    
    // All dependents are now ready (dependency is complete)
    if (dependents.length > 0) {
      // Notify worker to re-poll
      await this.notifyWorkers();
    }
  }
  
  async markFailed(
    jobId: string,
    error: string,
    shouldRetry: boolean
  ): Promise<void> {
    const { data } = await supabase
      .from('workflow_jobs')
      .select('attempt_count, max_attempts')
      .eq('id', jobId)
      .single();
    
    if (shouldRetry && data.attempt_count < data.max_attempts) {
      const nextRetry = new Date(Date.now() + 5 * 60 * 1000); // 5 min
      await supabase
        .from('workflow_jobs')
        .update({
          status: 'retrying',
          error,
          attempt_count: data.attempt_count + 1,
          next_retry_at: nextRetry,
        })
        .eq('id', jobId);
    } else {
      await supabase
        .from('workflow_jobs')
        .update({
          status: 'failed',
          error,
          completed_at: new Date(),
        })
        .eq('id', jobId);
    }
  }
}
```

### 5.3 Workflow Execution Engine

```typescript
// app/api/workflow/execute/route.ts

export async function POST(req: NextRequest) {
  const { workflowId, jobId } = await req.json();
  
  // Fetch job
  const { data: job } = await supabase
    .from('workflow_jobs')
    .select('*')
    .eq('id', jobId)
    .single();
  
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  
  // Mark as processing
  await supabase
    .from('workflow_jobs')
    .update({ status: 'processing', started_at: new Date() })
    .eq('id', jobId);
  
  try {
    let result;
    
    switch (job.type) {
      case 'photo_extraction':
        result = await executeExtraction(job);
        break;
      case 'marketplace_publish':
        result = await executeMarketplacePublish(job);
        break;
      case 'commercial_generation':
        result = await executeCommercialGeneration(job);
        break;
      case 'social_media_post':
        result = await executeSocialMediaPost(job);
        break;
    }
    
    // Mark completed
    await jobQueue.markCompleted(jobId, result);
    
    // Check if workflow is done
    const { data: allJobs } = await supabase
      .from('workflow_jobs')
      .select('status')
      .eq('workflow_id', workflowId);
    
    const completed = allJobs.filter(j => j.status === 'completed').length;
    const failed = allJobs.filter(j => j.status === 'failed').length;
    
    if (completed + failed === allJobs.length) {
      // Workflow complete; update execution record
      await updateWorkflowExecution(workflowId);
    }
    
    return NextResponse.json({ status: 'completed', result });
  } catch (err) {
    const shouldRetry = isRetryableError(err);
    await jobQueue.markFailed(jobId, err.message, shouldRetry);
    
    return NextResponse.json(
      { status: 'failed', error: err.message, retryable: shouldRetry },
      { status: shouldRetry ? 202 : 400 }
    );
  }
}
```

---

## 6. Data Models & API Contracts

### 6.1 Supabase Schema

```sql
-- OAuth & Credentials
CREATE TABLE oauth_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform varchar NOT NULL,
  access_token_encrypted text NOT NULL,
  access_token_iv text NOT NULL,
  access_token_auth_tag text NOT NULL,
  refresh_token_encrypted text,
  refresh_token_iv text,
  refresh_token_auth_tag text,
  expires_at timestamp,
  scope text,
  platform_user_id varchar,
  platform_username varchar,
  status varchar CHECK (status IN ('connected', 'expired', 'revoked', 'error')),
  error_message text,
  last_test_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE(user_id, platform),
  INDEX idx_user_status (user_id, status)
);

CREATE TABLE oauth_pending_states (
  state varchar PRIMARY KEY,
  nonce text NOT NULL,
  platform varchar NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamp DEFAULT now(),
  expires_at timestamp,
  redirect_uri text,
  INDEX idx_expires (expires_at)
);

-- Workflow Execution
CREATE TABLE workflow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_id uuid,
  photo_url text,
  photo_size_bytes int,
  status varchar CHECK (status IN ('in_progress', 'completed', 'failed', 'partial')),
  extraction_job_id uuid,
  summary jsonb,
  created_at timestamp DEFAULT now(),
  completed_at timestamp,
  INDEX idx_user_created (user_id, created_at DESC)
);

-- Jobs
CREATE TABLE workflow_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  type varchar CHECK (type IN ('photo_extraction', 'marketplace_publish', 'commercial_generation', 'social_media_post')),
  status varchar CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'retrying')),
  priority varchar CHECK (priority IN ('high', 'normal', 'low')),
  payload jsonb NOT NULL,
  result jsonb,
  error text,
  attempt_count int DEFAULT 0,
  max_attempts int DEFAULT 3,
  created_at timestamp DEFAULT now(),
  started_at timestamp,
  completed_at timestamp,
  next_retry_at timestamp,
  depends_on uuid REFERENCES workflow_jobs(id),
  INDEX idx_status_priority (status, priority, created_at),
  INDEX idx_depends_on (depends_on),
  INDEX idx_workflow (workflow_id)
);

-- Social Media Posts
CREATE TABLE social_media_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES workflow_jobs(id),
  platform varchar NOT NULL,
  post_id varchar,
  post_url text,
  video_url text,
  caption text,
  status varchar CHECK (status IN ('pending', 'published', 'failed')),
  error_message text,
  published_at timestamp,
  created_at timestamp DEFAULT now(),
  INDEX idx_user_platform (user_id, platform),
  INDEX idx_published (published_at DESC)
);

-- Dead-Letter Queue
CREATE TABLE dead_letter_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform varchar NOT NULL,
  video_url text NOT NULL,
  caption text,
  metadata jsonb,
  error text,
  error_code varchar,
  attempt_count int DEFAULT 1,
  max_attempts int DEFAULT 5,
  last_attempted_at timestamp,
  next_retry_at timestamp,
  status varchar CHECK (status IN ('pending', 'retrying', 'abandoned', 'resolved')),
  created_at timestamp DEFAULT now(),
  INDEX idx_status_next_retry (status, next_retry_at),
  INDEX idx_user_created (user_id, created_at DESC)
);

-- Marketplace Listings
CREATE TABLE marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES workflow_jobs(id),
  platform varchar NOT NULL,
  listing_id varchar,
  listing_url text,
  sku text,
  title text,
  description text,
  price_cents int,
  quantity int,
  status varchar CHECK (status IN ('draft', 'published', 'delisted', 'failed')),
  error_message text,
  published_at timestamp,
  created_at timestamp DEFAULT now(),
  INDEX idx_user_platform_status (user_id, platform, status),
  UNIQUE(platform, listing_id)
);

-- Commercial Videos
CREATE TABLE commercial_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES workflow_jobs(id),
  remotion_project_id varchar,
  video_url text,
  duration_seconds int,
  format varchar CHECK (format IN ('9:16', '16:9', '1:1')),
  file_size_bytes int,
  created_at timestamp DEFAULT now(),
  INDEX idx_user_created (user_id, created_at DESC)
);

-- Audit Logs
CREATE TABLE oauth_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  platform varchar,
  action varchar CHECK (action IN ('token_used', 'token_refreshed', 'revoked', 'test_failed', 'access_requested')),
  status varchar CHECK (status IN ('success', 'failure')),
  error_message text,
  ip_address inet,
  user_agent text,
  created_at timestamp DEFAULT now(),
  INDEX idx_user_created (user_id, created_at DESC)
);

-- Enable RLS
ALTER TABLE oauth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_media_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_videos ENABLE ROW LEVEL SECURITY;

-- RLS Policies (user can only see/update their own data)
CREATE POLICY users_oauth_isolation
  ON oauth_credentials
  FOR ALL
  USING (auth.uid() = user_id);
```

### 6.2 API Contracts

```typescript
// POST /api/photo-upload
// Upload a photo and start the full workflow

interface PhotoUploadRequest {
  photo: File; // Multipart form data
}

interface PhotoUploadResponse {
  workflowId: string;
  status: 'queued';
  estimatedDuration: {
    extraction: number; // seconds
    marketplacePublish: number;
    commercialGeneration: number;
    socialPosting: number;
  };
}

// ─────────────────────────────────────────────────────────────

// GET /api/workflow/:workflowId
// Poll workflow progress

interface WorkflowProgressResponse {
  workflowId: string;
  status: 'in_progress' | 'completed' | 'failed' | 'partial';
  steps: {
    extraction: {
      status: 'queued' | 'processing' | 'completed' | 'failed';
      progress?: number;
      data?: ProductExtractionData;
      error?: string;
    };
    marketplaces: {
      status: 'queued' | 'processing' | 'completed' | 'failed' | 'partial';
      total: 27;
      completed: number;
      failed: number;
      results: Array<{
        platform: string;
        status: 'queued' | 'processing' | 'published' | 'failed';
        listingUrl?: string;
        error?: string;
      }>;
    };
    commercial: {
      status: 'queued' | 'processing' | 'completed' | 'failed';
      progress?: number;
      videoUrl?: string;
      error?: string;
    };
    social: {
      status: 'queued' | 'processing' | 'completed' | 'failed' | 'partial';
      platforms: Array<{
        platform: string;
        status: 'queued' | 'processing' | 'published' | 'failed';
        postUrl?: string;
        error?: string;
      }>;
    };
  };
  createdAt: Date;
  completedAt?: Date;
}

// WebSocket Alternative: /api/workflow/:workflowId/stream
// Server-Sent Events for real-time progress

// ─────────────────────────────────────────────────────────────

// POST /api/oauth/initiate
// Start OAuth flow for a platform

interface OAuthInitiateRequest {
  platform: 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'twitter' | 'linkedin' | 'snapchat' | 'pinterest';
}

interface OAuthInitiateResponse {
  authUrl: string;
  state: string;
  expiresIn: number; // seconds
}

// ─────────────────────────────────────────────────────────────

// GET /api/oauth/callback?code=...&state=...&platform=...
// Handle OAuth redirect (backend redirect, then client-side navigation)

// Response: Redirect to /social-setup?success=true&platform=instagram

// ─────────────────────────────────────────────────────────────

// GET /api/social-auth/status
// Check which platforms are connected

interface SocialAuthStatusResponse {
  platforms: Array<{
    platform: string;
    status: 'connected' | 'expired' | 'not_connected' | 'error';
    username?: string;
    connectedAt?: Date;
    expiresAt?: Date;
    error?: string;
  }>;
}

// ─────────────────────────────────────────────────────────────

// POST /api/social-auth/:platform/disconnect
// Revoke a platform's credentials

interface DisconnectResponse {
  platform: string;
  status: 'disconnected';
}
```

---

## 7. Implementation Order & Timeline

### Phase 1: Foundation (Weeks 1-2)
1. Database schema migration (Supabase)
2. Encryption utilities (credential storage)
3. OAuth state management (session table + validation)

### Phase 2: OAuth & Auth (Weeks 2-4)
1. OAuth flow orchestrator (`/api/oauth/initiate`, `/api/oauth/callback`)
2. Per-platform OAuth handlers (all 8)
3. Token refresh manager + Redis integration
4. Test endpoint validation

### Phase 3: Upload & Extraction (Weeks 4-6)
1. Photo upload component (React)
2. Real-time progress streaming (SSE)
3. Photo validation + compression
4. Integration with existing Vision extraction

### Phase 4: Workflow Orchestration (Weeks 6-8)
1. Job queue + state machine
2. Dependency resolution
3. Workflow execution engine
4. Polling/scheduler

### Phase 5: Social Media Adapters (Weeks 8-10)
1. Adapter base class
2. All 8 platform adapters
3. Rate limiting
4. Dead-letter queue + retry logic

### Phase 6: Integration & Testing (Weeks 10-12)
1. End-to-end workflow tests
2. E2E test suite (Playwright)
3. Load testing
4. Security audit

---

## 8. Key Decision Rationale

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| **Supabase for oauth_credentials** | RLS for multi-tenant isolation; encrypted fields in DB | No secrets manager HSM (acceptable for mid-market) |
| **Server-side OAuth state** | CSRF protection; expiry-based cleanup | Requires session table; slightly more overhead |
| **Per-platform adapters** | Encapsulation; easy to test/modify one platform | More code upfront; ~500 LOC per adapter |
| **Job queue in Postgres** | Reliable, no external dependency; ACID guarantees | Slower than Redis; polling-based (acceptable at scale <1M jobs/day) |
| **SSE for progress** | Simple; unidirectional; built-in browser support | Not full duplex; no client→server messaging (acceptable here) |
| **Exponential backoff retry** | Reduces thundering herd; standard industry pattern | Max 8+ hours before abandonment (configurable) |
| **Dead-letter queue** | Manual inspection/resolution possible; auditable | Additional storage; requires monitoring |
| **Encrypt-at-rest + key per user** | Defense in depth; even DB breach limits exposure | Key derivation/rotation needed (add in Phase 2) |

---

## 9. Monitoring & Observability

### Key Metrics
- OAuth connection success rate (by platform)
- Workflow completion rate (extract → marketplaces → commercial → social)
- Job retry counts (by type)
- Dead-letter queue depth
- Token refresh latency (p50, p99)
- Social media posting latency (per platform)

### Alerting
- DLQ > 10 pending items → alert
- OAuth token refresh failure > 5% → alert
- Workflow execution > 30 minutes → warning
- Any job type failure rate > 10% → alert

### Dashboards
- Real-time workflow execution overview
- OAuth connection status by platform
- Job queue health (queueing lag, retry rates)
- Social media posting success rates

---

## 10. Security Considerations

### Threat Model
1. **Database breach** → Encrypted credentials (each user has unique key); audit logs show access
2. **Network interception** → HTTPS enforced; OAuth state prevents CSRF
3. **Token theft** → Short-lived access tokens (cached in Redis); long-lived refresh tokens encrypted in DB
4. **User impersonation** → RLS policies; audit logs on token usage
5. **Rate-limit bypass** → Per-user, per-platform rate limiters; platform-specific limits honored

### Compliance
- SOC2: Audit logging on all credential access
- GDPR: User can request/delete all credentials + workflow history
- PCI-DSS: If storing payment cards, use platform-specific APIs (not direct storage)

---

## Appendix: Pseudo-Code Examples

### Complete OAuth Flow Example (Instagram)
```typescript
// 1. User clicks "Connect Instagram"
POST /api/oauth/initiate { platform: 'instagram' }
→ { authUrl: 'https://api.instagram.com/oauth?...', state: 'xyz123' }

// 2. User authorizes at Instagram
// Instagram redirects to:
GET /api/oauth/callback?code=abc123&state=xyz123&platform=instagram

// 3. Backend:
// a. Fetch from oauth_pending_states WHERE state='xyz123'
// b. Exchange code for access_token
// c. Call GET /me to validate + get platform_user_id
// d. Encrypt tokens
// e. INSERT into oauth_credentials
// f. Redirect to /social-setup?success=true
```

### Complete Workflow Execution (Photo → Everywhere)
```typescript
// 1. User uploads photo
POST /api/upload + streaming SSE
→ enqueue WorkflowExecution + PhotoExtractionJob

// 2. Worker picks up extraction job
POST /api/workflow/execute { jobId }
→ Call Claude Vision → save extraction_data
→ mark completed → trigger 28 dependent jobs

// 3. 27 Marketplace jobs run in parallel
// 8 Commercial + Social jobs wait for commercial to complete
// Each social job runs in parallel, with per-platform rate limiting

// 4. As each job completes:
// → update workflow_execution.summary
// → send SSE event to client
// → when all done, mark workflow completed
```

---

## Summary

This architecture provides a **secure, scalable, reliable** foundation for the Boss Listers photo→everywhere automation:

✅ **Multi-platform OAuth** with token refresh & expiry handling  
✅ **Encrypted credential storage** with per-user keys  
✅ **Real-time progress UI** via Server-Sent Events  
✅ **Parallel job execution** with dependency resolution  
✅ **Rate limiting & error recovery** per platform  
✅ **Dead-letter queue** for manual intervention  
✅ **Audit logging** for compliance  
✅ **Modular adapters** for easy platform additions  

**Total estimated effort:** 12 weeks for full implementation + testing. Can be parallelized with Phases 2–5 running concurrently after Phase 1.

