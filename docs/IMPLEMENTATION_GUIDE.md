# Boss Listers Architecture: Implementation Guide

This guide provides step-by-step instructions for implementing the complete photo→everywhere automation system.

---

## Phase 1: Foundation (Weeks 1-2)

### 1.1 Database Schema Migration

Create migration file: `lib/db/migrations/001_oauth_workflow.sql`

```bash
cd /path/to/BossListers
supabase migration new oauth_workflow_tables
```

**Contents: `supabase/migrations/001_oauth_workflow_tables.sql`**

See `docs/sql/00-init-tables.sql` in this repo for complete schema.

**Deploy:**
```bash
supabase db push
```

### 1.2 Encryption Utilities

Create: `lib/crypto/credentialEncryption.ts`

```bash
npm install libsodium.js
```

Key functions:
- `encryptCredential(credential, userKey)` → encrypted object
- `decryptCredential(encrypted, userKey)` → plaintext token
- `deriveUserKey(userId, masterKey)` → per-user encryption key

### 1.3 Environment Variables

Update `.env.local`:

```bash
# OAuth State Storage (5-minute TTL)
OAUTH_STATE_TTL_MS=300000

# Encryption Master Key (generate via crypto.randomBytes(32))
OAUTH_MASTER_KEY=<base64-encoded-32-bytes>

# Redis for token caching (optional; falls back to in-memory)
REDIS_URL=redis://localhost:6379

# Supabase
SUPABASE_SERVICE_ROLE_KEY=<from-supabase-dashboard>
```

---

## Phase 2: OAuth & Auth (Weeks 2-4)

### 2.1 OAuth Orchestrator

Create: `app/api/oauth/initiate/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseAuth';
import { generateOAuthUrl } from '@/lib/oauth/urlBuilders';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const { platform } = await req.json();
  const userId = req.headers.get('x-user-id');

  if (!userId) {
    return NextResponse.json(
      { error: 'User not authenticated' },
      { status: 401 }
    );
  }

  const VALID_PLATFORMS = [
    'instagram', 'tiktok', 'youtube', 'facebook',
    'twitter', 'linkedin', 'snapchat', 'pinterest',
  ];

  if (!VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json(
      { error: `Unknown platform: ${platform}` },
      { status: 400 }
    );
  }

  // Generate state
  const state = crypto.randomUUID();
  const nonce = crypto.randomBytes(32).toString('hex');

  // Store state
  const { error: stateError } = await supabase
    .from('oauth_pending_states')
    .insert({
      state,
      nonce,
      platform,
      user_id: userId,
      created_at: new Date(),
      expires_at: new Date(Date.now() + 5 * 60_000),
    });

  if (stateError) {
    console.error('Failed to store OAuth state:', stateError);
    return NextResponse.json(
      { error: 'Failed to initiate OAuth' },
      { status: 500 }
    );
  }

  // Build auth URL
  const authUrl = generateOAuthUrl(platform, state);

  return NextResponse.json({
    authUrl,
    state,
    expiresIn: 300,
  });
}
```

Create: `app/api/oauth/callback/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseAuth';
import { exchangeCodeForToken } from '@/lib/oauth/tokenExchange';
import { encryptCredential } from '@/lib/crypto/credentialEncryption';
import { validatePlatformCredentials } from '@/lib/oauth/validation';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const platform = searchParams.get('platform');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      `/social-setup?error=${error}&platform=${platform}`
    );
  }

  if (!code || !state || !platform) {
    return NextResponse.redirect(
      `/social-setup?error=invalid_request`
    );
  }

  try {
    // 1. Validate state
    const { data: pendingState, error: fetchError } = await supabase
      .from('oauth_pending_states')
      .select('*')
      .eq('state', state)
      .single();

    if (fetchError || !pendingState) {
      return NextResponse.redirect(
        `/social-setup?error=invalid_state&platform=${platform}`
      );
    }

    // Check expiry
    if (new Date(pendingState.expires_at) < new Date()) {
      return NextResponse.redirect(
        `/social-setup?error=state_expired&platform=${platform}`
      );
    }

    const userId = pendingState.user_id;

    // 2. Exchange code for tokens
    const tokens = await exchangeCodeForToken(platform, code);

    // 3. Validate tokens
    const validation = await validatePlatformCredentials(
      platform,
      tokens.access_token
    );

    if (!validation.valid) {
      return NextResponse.redirect(
        `/social-setup?error=invalid_credentials&platform=${platform}`
      );
    }

    // 4. Encrypt and store
    const userKey = deriveUserKey(userId); // See credentialEncryption.ts

    const encrypted = {
      access_token: encryptCredential(tokens.access_token, userKey),
      refresh_token: tokens.refresh_token
        ? encryptCredential(tokens.refresh_token, userKey)
        : null,
    };

    // 5. Update or insert credentials
    await supabase
      .from('oauth_credentials')
      .upsert(
        {
          user_id: userId,
          platform,
          access_token_encrypted: encrypted.access_token.ciphertext,
          access_token_iv: encrypted.access_token.iv,
          access_token_auth_tag: encrypted.access_token.authTag,
          refresh_token_encrypted: encrypted.refresh_token?.ciphertext,
          refresh_token_iv: encrypted.refresh_token?.iv,
          refresh_token_auth_tag: encrypted.refresh_token?.authTag,
          expires_at: tokens.expires_at
            ? new Date(tokens.expires_at)
            : null,
          scope: tokens.scope || '',
          platform_user_id: validation.platformUserId,
          platform_username: validation.username,
          status: 'connected',
          last_test_at: new Date(),
          updated_at: new Date(),
        },
        {
          onConflict: 'user_id,platform',
        }
      );

    // 6. Clean up state
    await supabase
      .from('oauth_pending_states')
      .delete()
      .eq('state', state);

    // 7. Redirect to success
    return NextResponse.redirect(
      `/social-setup?success=true&platform=${platform}`
    );
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(
      `/social-setup?error=server_error&platform=${platform}`
    );
  }
}
```

### 2.2 Token Refresh Manager

Create: `lib/oauth/refreshManager.ts`

```typescript
import { supabase } from '@/lib/supabaseAuth';
import { decryptCredential } from '@/lib/crypto/credentialEncryption';
import { getRedisClient } from '@/lib/redis';

const CACHE_TTL_MS = 3600_000; // 1 hour
const REFRESH_SAFETY_MARGIN_MS = 5 * 60_000; // 5 minutes

export class TokenRefreshManager {
  private redis = getRedisClient();

  async getValidAccessToken(
    userId: string,
    platform: string
  ): Promise<string> {
    const cacheKey = `oauth:token:${userId}:${platform}`;

    // Try cache
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    // Fetch from DB
    const { data: cred, error } = await supabase
      .from('oauth_credentials')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', platform)
      .single();

    if (error || !cred) {
      throw new Error(
        `${platform} not connected. Please reconnect in settings.`
      );
    }

    // Check if refresh needed
    const expiresAt = cred.expires_at
      ? new Date(cred.expires_at).getTime()
      : Infinity;
    const now = Date.now();
    const needsRefresh = expiresAt - now < REFRESH_SAFETY_MARGIN_MS;

    if (!needsRefresh) {
      // Token still valid; decrypt and cache
      const userKey = deriveUserKey(userId);
      const token = decryptCredential(
        {
          ciphertext: cred.access_token_encrypted,
          iv: cred.access_token_iv,
          authTag: cred.access_token_auth_tag,
        },
        userKey
      );

      await this.redis.setex(cacheKey, CACHE_TTL_MS, token);
      return token;
    }

    // Refresh needed
    if (!cred.refresh_token_encrypted) {
      // Platform doesn't support refresh; user must re-authorize
      await supabase
        .from('oauth_credentials')
        .update({ status: 'expired' })
        .eq('user_id', userId)
        .eq('platform', platform);

      throw new Error(
        `${platform} authentication expired. Please reconnect.`
      );
    }

    // Decrypt refresh token and exchange
    const userKey = deriveUserKey(userId);
    const refreshToken = decryptCredential(
      {
        ciphertext: cred.refresh_token_encrypted,
        iv: cred.refresh_token_iv,
        authTag: cred.refresh_token_auth_tag,
      },
      userKey
    );

    const newTokens = await this.exchangeRefreshToken(
      platform,
      refreshToken
    );

    // Update DB
    await supabase
      .from('oauth_credentials')
      .update({
        access_token_encrypted: newTokens.accessTokenEncrypted.ciphertext,
        access_token_iv: newTokens.accessTokenEncrypted.iv,
        access_token_auth_tag: newTokens.accessTokenEncrypted.authTag,
        expires_at: newTokens.expiresAt,
        updated_at: new Date(),
      })
      .eq('user_id', userId)
      .eq('platform', platform);

    // Cache new token
    await this.redis.setex(
      cacheKey,
      CACHE_TTL_MS,
      newTokens.accessToken
    );

    return newTokens.accessToken;
  }

  private async exchangeRefreshToken(
    platform: string,
    refreshToken: string
  ) {
    // Platform-specific logic; see next section
    switch (platform) {
      case 'instagram':
        return exchangeInstagramRefresh(refreshToken);
      case 'youtube':
        return exchangeYoutubeRefresh(refreshToken);
      // ... etc
      default:
        throw new Error(`No refresh handler for ${platform}`);
    }
  }
}

// Export singleton
export const tokenRefreshManager = new TokenRefreshManager();
```

### 2.3 Platform-Specific OAuth Handlers

Create: `lib/oauth/handlers/instagram.ts`

```typescript
export async function exchangeInstagramCode(code: string) {
  // Step 1: Exchange code for access token
  const tokenRes = await fetch(
    'https://graph.instagram.com/v18.0/access_token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.INSTAGRAM_CLIENT_ID,
        client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/oauth/callback`,
        code,
      }),
    }
  );

  if (!tokenRes.ok) {
    throw new Error(`Instagram token exchange failed: ${tokenRes.statusText}`);
  }

  const { access_token, user_id } = await tokenRes.json();

  // Step 2: Get long-lived token (Instagram)
  const longLivedRes = await fetch(
    `https://graph.instagram.com/v18.0/access_token?grant_type=ig_refresh_token&access_token=${access_token}&client_secret=${process.env.INSTAGRAM_CLIENT_SECRET}`,
    { method: 'GET' }
  );

  const { access_token: longLivedToken, expires_in } = await longLivedRes.json();

  return {
    access_token: longLivedToken,
    refresh_token: longLivedToken, // Instagram uses same token for refresh
    expires_at: Date.now() + expires_in * 1000,
    scope: 'instagram_basic,instagram_graph_user_media',
  };
}

export async function exchangeInstagramRefresh(refreshToken: string) {
  const res = await fetch(
    `https://graph.instagram.com/v18.0/refresh_access_token?grant_type=ig_refresh_token&access_token=${refreshToken}&client_secret=${process.env.INSTAGRAM_CLIENT_SECRET}`,
    { method: 'GET' }
  );

  const { access_token, expires_in } = await res.json();

  return {
    accessToken: access_token,
    accessTokenEncrypted: encryptCredential(access_token, userKey), // Caller provides
    expiresAt: new Date(Date.now() + expires_in * 1000),
  };
}

export async function validateInstagramCredentials(accessToken: string) {
  const res = await fetch('https://graph.instagram.com/me?fields=id,username', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    return { valid: false };
  }

  const { id, username } = await res.json();
  return {
    valid: true,
    platformUserId: id,
    username,
  };
}
```

**Repeat for:** TikTok, YouTube, Facebook, Twitter, LinkedIn, Snapchat, Pinterest (separate files)

---

## Phase 3: Upload & Extraction (Weeks 4-6)

### 3.1 Photo Upload Component

Create: `components/PhotoUpload/PhotoUpload.tsx`

```typescript
import React, { useState, useRef } from 'react';
import { usePhotoUpload } from '@/hooks/usePhotoUpload';
import ProgressBar from './ProgressBar';
import ExtractionPreview from './ExtractionPreview';
import WorkflowResults from './WorkflowResults';

interface PhotoUploadProps {
  userId: string;
  onComplete?: (result: WorkflowResult) => void;
}

export default function PhotoUpload({ userId, onComplete }: PhotoUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<WorkflowProgress>({
    step: 'idle',
    overallProgress: 0,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadPhoto, error } = usePhotoUpload(userId);

  const handleFileSelect = async (selectedFile: File) => {
    // Validate
    const validation = await validatePhoto(selectedFile);
    if (!validation.valid) {
      setProgress({
        ...progress,
        errors: validation.errors,
      });
      return;
    }

    setFile(selectedFile);
    setProgress({ step: 'uploading', overallProgress: 0 });

    // Start upload
    const result = await uploadPhoto(selectedFile);
    if (result.success) {
      onComplete?.(result);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  if (progress.step === 'complete') {
    return (
      <WorkflowResults
        results={progress.results}
        onStartNew={() => {
          setProgress({ step: 'idle', overallProgress: 0 });
          setFile(null);
        }}
      />
    );
  }

  return (
    <div className="photo-upload">
      <div
        className="upload-area"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
          hidden
        />

        {!file ? (
          <div onClick={() => fileInputRef.current?.click()}>
            <p>Drag & drop your product photo here</p>
            <p>or click to browse</p>
          </div>
        ) : (
          <div>
            <img
              src={URL.createObjectURL(file)}
              alt="Selected"
              style={{ maxWidth: '200px' }}
            />
          </div>
        )}
      </div>

      {progress.step !== 'idle' && (
        <div className="workflow-progress">
          <ProgressBar
            step={progress.step}
            overall={progress.overallProgress}
            steps={{
              uploading: progress.uploading,
              extracting: progress.extracting,
              publishing_marketplaces: progress.publishing_marketplaces,
              generating_commercial: progress.generating_commercial,
              posting_social: progress.posting_social,
            }}
          />

          {progress.extracting?.data && (
            <ExtractionPreview data={progress.extracting.data} />
          )}

          {progress.publishing_marketplaces && (
            <div className="marketplace-status">
              <h3>Marketplace Publishing</h3>
              <div className="progress-text">
                {progress.publishing_marketplaces.completed} /
                {progress.publishing_marketplaces.total}
              </div>
            </div>
          )}

          {progress.posting_social && (
            <div className="social-status">
              <h3>Social Media Posting</h3>
              <div className="platform-list">
                {progress.posting_social.map((p: any) => (
                  <div key={p.platform} className="platform-status">
                    <span>{p.platform}</span>
                    <span className={`status ${p.status}`}>{p.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </div>
  );
}
```

### 3.2 Real-Time Progress Hook

Create: `hooks/usePhotoUpload.ts`

```typescript
import { useState, useCallback } from 'react';

export function usePhotoUpload(userId: string) {
  const [progress, setProgress] = useState<WorkflowProgress>({
    step: 'idle',
    overallProgress: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const uploadPhoto = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('photo', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        headers: { 'x-user-id': userId },
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.step === 'error') {
                setError(data.error);
                return { success: false };
              }

              setProgress((prev) => ({
                ...prev,
                ...data,
                overallProgress: calculateProgress(data),
              }));
            } catch (e) {
              console.error('Failed to parse SSE message:', e);
            }
          }
        }

        buffer = lines[lines.length - 1];
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return { success: false };
    }
  }, [userId]);

  return { progress, uploadPhoto, error };
}

function calculateProgress(data: any): number {
  const weights = {
    uploading: 0.1,
    extracting: 0.2,
    publishing_marketplaces: 0.35,
    generating_commercial: 0.2,
    posting_social: 0.15,
  };

  const stepWeight = weights[data.step as keyof typeof weights] || 0;
  const stepProgress = data.progress ?? 0;

  return stepWeight * stepProgress + (Object.keys(weights) as any[])
    .slice(0, Object.keys(weights).indexOf(data.step))
    .reduce((sum, key) => sum + weights[key], 0) * 100;
}
```

---

## Phase 4: Workflow Orchestration (Weeks 6-8)

### 4.1 Workflow Job Queue

Create: `lib/workflow/jobQueue.ts`

See ARCHITECTURE_ADR.md Section 5.2 for complete implementation.

Key methods:
- `enqueueExtraction(userId, photoId)`
- `enqueueDependents(extractionJobId, extractionResult)`
- `enqueueSocialJobs(commercialJobId, videoUrl)`
- `pollQueue()` → returns next batch of jobs
- `markCompleted(jobId, result)`
- `markFailed(jobId, error, shouldRetry)`

### 4.2 Workflow Execution Handler

Create: `app/api/workflow/execute/route.ts`

See ARCHITECTURE_ADR.md Section 5.3 for complete implementation.

Handles all job types:
- `executeExtraction` → Claude Vision call
- `executeMarketplacePublish` → Per-platform listing
- `executeCommercialGeneration` → Remotion render
- `executeSocialMediaPost` → Per-platform post

### 4.3 Scheduled Polling

Create: `lib/workflow/scheduler.ts`

```typescript
// Runs every 5 seconds via Next.js API endpoint
// Or use Supabase scheduled functions for better scaling

export async function pollWorkflowQueue() {
  const queue = new WorkflowJobQueue();
  const jobs = await queue.pollQueue();

  for (const job of jobs) {
    // Fire off async execution
    // Don't wait; queue it for a worker
    triggerJobExecution(job.id);
  }
}

// Optionally: use pg_cron in Supabase
// CREATE EXTENSION IF NOT EXISTS pg_cron;
// SELECT cron.schedule('workflow-poller', '*/5 seconds',
//   'SELECT trigger_workflow_jobs()');
```

---

## Phase 5: Social Media Adapters (Weeks 8-10)

### 5.1 Base Adapter Class

Create: `lib/social/adapters/base.ts`

See ARCHITECTURE_ADR.md Section 4.1.

### 5.2 Concrete Adapters

Create: `lib/social/adapters/instagram.ts`, `tiktok.ts`, `youtube.ts`, etc.

Each adapter implements:
- `validateVideo(spec)` — Check duration, resolution, codec
- `post(opts)` — Upload and post
- `getAnalytics(postId)` — Fetch performance data
- `delete(postId)` — Remove post

**Example: TikTok Adapter**

```typescript
// lib/social/adapters/tiktok.ts
export class TikTokAdapter implements SocialMediaAdapter {
  platform = 'tiktok';

  async validateVideo(video: VideoSpec) {
    const errors: string[] = [];

    // Duration: 3-60s
    if (video.durationSeconds < 3 || video.durationSeconds > 60) {
      errors.push(`TikTok requires 3-60s (got ${video.durationSeconds}s)`);
    }

    // Aspect ratio: 9:16
    const ratio = video.width / video.height;
    if (Math.abs(ratio - 0.5625) > 0.05) {
      errors.push('TikTok requires 9:16 aspect ratio');
    }

    return { valid: errors.length === 0, errors };
  }

  async post(opts: PostOptions) {
    const { userId, videoUrl, caption } = opts;
    const accessToken = await getValidAccessToken(userId, 'tiktok');

    try {
      // TikTok: Use Creator Marketplace API
      const res = await fetch('https://open.tiktokapis.com/v1/post/publish/action/init/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_info: {
            source: 'CREATOR_API',
            platform: 'TikTok',
          },
          post_info: {
            title: caption.slice(0, 150),
            desc: caption,
            video_external_url: videoUrl,
          },
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'TikTok post failed');
      }

      const { data } = await res.json();

      return {
        platform: 'tiktok',
        postId: data.video_id,
        url: `https://www.tiktok.com/@user/video/${data.video_id}`,
        status: 'published',
        createdAt: new Date(),
      };
    } catch (err) {
      // Add to DLQ for retry
      return {
        platform: 'tiktok',
        postId: '',
        url: '',
        status: 'failed',
        error: err.message,
        createdAt: new Date(),
      };
    }
  }
}
```

### 5.3 Dead-Letter Queue Processor

Create: `lib/social/deadLetterProcessor.ts`

Scheduled to run every 30 minutes:

```typescript
export async function processDeadLetterQueue() {
  const dlq = new DeadLetterQueue();
  await dlq.processQueue();
}

// Wire into Supabase scheduled function:
// supabase/functions/process-dlq/index.ts
```

---

## Phase 6: Integration & Testing (Weeks 10-12)

### 6.1 E2E Tests

Create: `tests/e2e/photo-upload.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Photo Upload Workflow', () => {
  test('should complete full workflow from photo to social posts', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('input[name=email]', 'test@example.com');
    await page.fill('input[name=password]', 'testpass123');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('/dashboard');

    // 2. Navigate to upload
    await page.click('a:has-text("Upload Photo")');
    await page.waitForURL('/upload');

    // 3. Upload photo
    const fileInput = page.locator('input[type=file]');
    await fileInput.setInputFiles('fixtures/sample-product.jpg');

    // 4. Wait for extraction
    await page.waitForSelector('text=Extraction complete');
    await expect(page.locator('text=Title:')).toBeVisible();

    // 5. Monitor marketplace publishing
    await page.waitForSelector('text=Publishing to 27 marketplaces');
    // Poll until complete (timeout 2 min)
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return text.includes('27 / 27');
      },
      { timeout: 120_000 }
    );

    // 6. Monitor commercial generation
    await page.waitForSelector('text=Generating commercial');
    await page.waitForSelector('video');

    // 7. Monitor social posting
    await page.waitForSelector('text=Posting to social media');
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return text.includes('8 / 8');
      },
      { timeout: 60_000 }
    );

    // 8. Verify success
    await expect(page.locator('text=Workflow complete')).toBeVisible();
    await expect(page.locator('text=marketplace_listings')).toContainText('27');
    await expect(page.locator('text=social_media_posts')).toContainText('8');
  });

  test('should handle OAuth connect/disconnect', async ({ page }) => {
    await page.goto('/social-setup');

    // Click "Connect Instagram"
    await page.click('button:has-text("Connect Instagram")');

    // Playwright will navigate to Instagram
    // Mock Instagram response...
    // (Use MSW or intercept requests)

    // Should redirect back with success
    await page.waitForURL('**/social-setup?success=true**');
  });

  test('should retry failed posts from DLQ', async ({ page }) => {
    // Manually add to DLQ
    // Wait 30+ minutes
    // Verify retry succeeded
  });
});
```

### 6.2 Unit Tests

Create: `tests/unit/oauth.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { TokenRefreshManager } from '@/lib/oauth/refreshManager';
import { encryptCredential, decryptCredential } from '@/lib/crypto/credentialEncryption';

describe('Token Refresh', () => {
  it('should encrypt and decrypt credentials', () => {
    const token = 'secret_token_123';
    const userKey = Buffer.from('user-key-32-bytes-long-enough!!');

    const encrypted = encryptCredential(token, userKey);
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.authTag).toBeTruthy();

    const decrypted = decryptCredential(encrypted, userKey);
    expect(decrypted).toBe(token);
  });

  it('should detect tampered ciphertext', () => {
    const token = 'secret';
    const userKey = Buffer.from('user-key-32-bytes-long-enough!!');

    const encrypted = encryptCredential(token, userKey);
    encrypted.ciphertext = encrypted.ciphertext.replace('a', 'b');

    expect(() => decryptCredential(encrypted, userKey)).toThrow();
  });
});
```

---

## Deployment Checklist

- [ ] Database migrations applied (`supabase db push`)
- [ ] Environment variables set (OAuth clients, encryption keys)
- [ ] Redis configured (or in-memory fallback tested)
- [ ] Supabase RLS policies enabled
- [ ] OAuth callbacks configured on each platform
- [ ] Email notifications configured for alerts
- [ ] Monitoring dashboards created
- [ ] Load testing completed (1000 concurrent uploads)
- [ ] Security audit passed
- [ ] E2E test suite green
- [ ] Documentation updated

---

## Quick-Start Commands

```bash
# 1. Clone and setup
git clone ...
cd BossListers
npm install

# 2. Create .env.local
cp .env.example .env.local
# Edit with actual values

# 3. Run database migrations
supabase db push

# 4. Start dev server
npm run dev

# 5. Run tests
npm test

# 6. Deploy
npm run build && vercel deploy
```

---

## Monitoring & Alerts

Set up alerts in your monitoring system (Datadog, New Relic, etc.):

- **DLQ depth > 10:** Email alert
- **OAuth token refresh failure rate > 5%:** Slack alert
- **Workflow execution time > 30 min:** Warning
- **Job retry count > 3:** Log for analysis

---

## Next Steps

1. Start with Phase 1 this week
2. Have OAuth flow working by end of Week 4
3. Full workflow end-to-end by Week 8
4. Production-ready by Week 12

Good luck! 🚀

