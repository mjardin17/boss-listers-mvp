# Boss Listers API Reference

Complete API documentation for the photo→everywhere automation system.

---

## Authentication

All endpoints (except OAuth callback) require:

```
Headers:
  Authorization: Bearer <supabase-access-token>
  x-user-id: <user-uuid>
```

---

## 1. Photo Upload & Extraction

### POST /api/upload

**Stream-based endpoint for real-time progress updates via Server-Sent Events.**

```
Method: POST
Content-Type: multipart/form-data
Headers:
  x-user-id: <uuid>

Body:
  photo: File (multipart form data)

Response (SSE stream):
  Content-Type: text/event-stream

  data: { "step": "uploading", "progress": 0 }\n\n
  data: { "step": "uploading", "progress": 50 }\n\n
  data: { "step": "extracting", "progress": 0 }\n\n
  data: { "step": "extracting", "progress": 100, "data": { ... } }\n\n
  data: { "step": "publishing_marketplaces", "total": 27, "completed": 0 }\n\n
  data: { "step": "publishing_marketplaces", "total": 27, "completed": 5 }\n\n
  ...
  data: { "step": "complete", "workflowId": "...", "results": { ... } }\n\n
```

**Upload Progress Events:**

```typescript
interface UploadProgressEvent {
  step: 'uploading' | 'extracting' | 'publishing_marketplaces' | 'generating_commercial' | 'posting_social' | 'complete' | 'error';
  progress?: number; // 0-100
  total?: number; // For step counts
  completed?: number; // For step counts
  platforms?: string[]; // For social step
  platform?: string; // Platform name
  status?: string; // 'queued', 'processing', 'published', 'failed'
  data?: any; // Extraction data, commercial URL, etc.
  error?: string; // Error message
  results?: WorkflowResult; // Final results
}
```

**Example: JavaScript/React**

```typescript
const response = await fetch('/api/upload', {
  method: 'POST',
  body: formData,
  headers: { 'x-user-id': userId },
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6));
      console.log(`Step: ${event.step}, Progress: ${event.progress}%`);
    }
  }
}
```

---

## 2. Workflow Status Polling

### GET /api/workflow/:workflowId

**Fetch current status of a workflow (alternative to SSE streaming).**

```
Method: GET
Path: /api/workflow/550e8400-e29b-41d4-a716-446655440000
Headers:
  Authorization: Bearer <token>
  x-user-id: <uuid>

Response: 200 OK
Content-Type: application/json

{
  "workflowId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "in_progress",
  "steps": {
    "extraction": {
      "status": "completed",
      "data": {
        "title": "Vintage Rolex Submariner",
        "description": "...",
        "price": 2500,
        "condition": "excellent",
        "dimensions": { "width": "40mm", "height": "13mm" },
        "category": "Jewelry > Watches"
      }
    },
    "marketplaces": {
      "status": "processing",
      "total": 27,
      "completed": 12,
      "failed": 0,
      "results": [
        {
          "platform": "ebay",
          "status": "published",
          "listingUrl": "https://ebay.com/itm/123456"
        },
        {
          "platform": "facebook",
          "status": "published",
          "listingUrl": "https://facebook.com/marketplace/item/123"
        },
        {
          "platform": "etsy",
          "status": "processing"
        },
        {
          "platform": "poshmark",
          "status": "queued"
        }
      ]
    },
    "commercial": {
      "status": "processing",
      "progress": 45,
      "videoUrl": null
    },
    "social": {
      "status": "queued",
      "platforms": [
        { "platform": "instagram", "status": "queued" },
        { "platform": "tiktok", "status": "queued" }
      ]
    }
  },
  "createdAt": "2026-08-26T14:30:00Z",
  "completedAt": null
}
```

**Polling Example (long-poll pattern):**

```typescript
async function pollWorkflowUntilComplete(workflowId: string, maxWait = 600_000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    const res = await fetch(`/api/workflow/${workflowId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-user-id': userId,
      },
    });
    
    const workflow = await res.json();
    
    if (workflow.status === 'completed' || workflow.status === 'failed') {
      return workflow;
    }
    
    // Wait 5 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  throw new Error('Workflow timeout');
}
```

---

## 3. OAuth Flow

### POST /api/oauth/initiate

**Start OAuth flow for a platform.**

```
Method: POST
Content-Type: application/json
Headers:
  Authorization: Bearer <token>
  x-user-id: <uuid>

Body:
{
  "platform": "instagram"
}

Response: 200 OK
{
  "authUrl": "https://api.instagram.com/oauth/authorize?client_id=...",
  "state": "abc123-state-token",
  "expiresIn": 300
}
```

**User then navigates to authUrl, authorizes, and is redirected to:**

```
/api/oauth/callback?code=...&state=abc123-state-token&platform=instagram
```

**Backend handles callback, then redirects to:**

```
/social-setup?success=true&platform=instagram
```

### GET /api/oauth/callback

**Handle OAuth redirect from platform (backend only).**

```
Query Params:
  code: <authorization-code>
  state: <state-token>
  platform: <platform-name>
  error: <error-code> (if user denied)

Response: 302 Redirect
  Location: /social-setup?success=true&platform=instagram
  (or /social-setup?error=invalid_state if state check fails)
```

### GET /api/social-auth/status

**Check which platforms are connected.**

```
Method: GET
Headers:
  Authorization: Bearer <token>
  x-user-id: <uuid>

Response: 200 OK
{
  "platforms": [
    {
      "platform": "instagram",
      "status": "connected",
      "username": "@product.reseller",
      "connectedAt": "2026-08-20T10:30:00Z",
      "expiresAt": "2026-10-19T10:30:00Z"
    },
    {
      "platform": "tiktok",
      "status": "expired",
      "error": "Token expired. Please reconnect."
    },
    {
      "platform": "youtube",
      "status": "not_connected"
    }
  ]
}
```

### POST /api/social-auth/:platform/disconnect

**Revoke a platform's credentials.**

```
Method: POST
Path: /api/social-auth/instagram/disconnect
Headers:
  Authorization: Bearer <token>
  x-user-id: <uuid>

Response: 200 OK
{
  "platform": "instagram",
  "status": "disconnected"
}
```

---

## 4. Social Media Posts

### GET /api/social-media/posts

**List user's social media posts.**

```
Method: GET
Query Params:
  platform?: string (filter by platform)
  status?: string (published, failed)
  limit?: number (default 20)
  offset?: number (default 0)

Response: 200 OK
{
  "posts": [
    {
      "id": "uuid",
      "platform": "instagram",
      "postId": "abc123",
      "postUrl": "https://instagram.com/p/abc123",
      "caption": "...",
      "status": "published",
      "publishedAt": "2026-08-26T12:00:00Z"
    }
  ],
  "total": 45
}
```

### GET /api/social-media/posts/:postId

**Get details for a specific post.**

```
Response: 200 OK
{
  "id": "uuid",
  "platform": "instagram",
  "postId": "abc123",
  "postUrl": "https://instagram.com/p/abc123",
  "caption": "Vintage Rolex...",
  "videoUrl": "https://s3.amazonaws.com/...video.mp4",
  "status": "published",
  "publishedAt": "2026-08-26T12:00:00Z",
  "analytics": {
    "likes": 234,
    "comments": 12,
    "shares": 3,
    "impressions": 5000,
    "reach": 4200
  }
}
```

### DELETE /api/social-media/posts/:postId

**Delete a social media post.**

```
Method: DELETE
Response: 204 No Content
(or cascading delete if post was from workflow)
```

---

## 5. Dead-Letter Queue

### GET /api/dead-letter-queue

**View failed posts pending retry or manual intervention.**

```
Method: GET
Query Params:
  status?: string (pending, retrying, abandoned, resolved)
  limit?: number (default 20)

Response: 200 OK
{
  "items": [
    {
      "id": "uuid",
      "platform": "tiktok",
      "caption": "...",
      "error": "TikTok API returned 429 (rate limited)",
      "errorCode": "RATE_LIMITED",
      "attemptCount": 2,
      "maxAttempts": 5,
      "status": "retrying",
      "nextRetryAt": "2026-08-26T15:00:00Z",
      "createdAt": "2026-08-26T10:00:00Z"
    }
  ],
  "total": 3
}
```

### POST /api/dead-letter-queue/:itemId/retry

**Manually retry a failed post.**

```
Method: POST
Response: 200 OK
{
  "itemId": "uuid",
  "status": "retrying",
  "nextRetryAt": "2026-08-26T14:30:00Z"
}
```

### POST /api/dead-letter-queue/:itemId/abandon

**Mark an item as abandoned (too many failures).**

```
Method: POST
Body:
{
  "reason": "Optional reason for abandonment"
}
Response: 200 OK
{
  "itemId": "uuid",
  "status": "abandoned"
}
```

---

## 6. Marketplace Listings

### GET /api/marketplace-listings

**View all marketplace listings from workflows.**

```
Method: GET
Query Params:
  platform?: string (ebay, amazon, facebook, etc.)
  status?: string (draft, published, delisted, failed)
  limit?: number (default 20)

Response: 200 OK
{
  "listings": [
    {
      "id": "uuid",
      "platform": "ebay",
      "listingId": "123456789",
      "listingUrl": "https://ebay.com/itm/123456789",
      "title": "Vintage Rolex Submariner",
      "price": 2500,
      "status": "published",
      "publishedAt": "2026-08-26T12:00:00Z"
    }
  ],
  "total": 27
}
```

---

## 7. Commercial Videos

### GET /api/commercial-videos

**View generated commercials.**

```
Method: GET
Response: 200 OK
{
  "videos": [
    {
      "id": "uuid",
      "workflowId": "uuid",
      "videoUrl": "https://s3.amazonaws.com/...commercial.mp4",
      "durationSeconds": 45,
      "format": "9:16",
      "fileSizeBytes": 12345678,
      "createdAt": "2026-08-26T12:00:00Z"
    }
  ]
}
```

---

## 8. Workflow Management

### GET /api/workflows

**List all workflows for user.**

```
Method: GET
Query Params:
  status?: string (in_progress, completed, failed, partial)
  limit?: number (default 20)
  offset?: number (default 0)

Response: 200 OK
{
  "workflows": [
    {
      "id": "uuid",
      "photoUrl": "https://s3.../photo.jpg",
      "status": "completed",
      "summary": {
        "marketplacesPublished": 27,
        "marketplacesFailed": 0,
        "socialPosted": 8,
        "socialFailed": 0,
        "videoUrl": "https://s3.../commercial.mp4"
      },
      "createdAt": "2026-08-26T10:00:00Z",
      "completedAt": "2026-08-26T11:30:00Z"
    }
  ],
  "total": 42
}
```

### DELETE /api/workflows/:workflowId

**Delete a workflow and all associated data (cascading).**

```
Method: DELETE
Response: 204 No Content
(Deletes workflow_execution, all workflow_jobs, social_media_posts, marketplace_listings, commercial_videos)
```

---

## Error Responses

### 400 Bad Request

```json
{
  "error": "invalid_request",
  "message": "Platform must be one of: instagram, tiktok, youtube, ...",
  "details": {}
}
```

### 401 Unauthorized

```json
{
  "error": "unauthorized",
  "message": "Missing or invalid authorization token"
}
```

### 403 Forbidden

```json
{
  "error": "forbidden",
  "message": "You do not have permission to access this resource"
}
```

### 404 Not Found

```json
{
  "error": "not_found",
  "message": "Workflow 550e8400-... not found"
}
```

### 429 Too Many Requests

```json
{
  "error": "rate_limited",
  "message": "Too many requests. Please retry after 60 seconds.",
  "retryAfter": 60
}
```

### 500 Internal Server Error

```json
{
  "error": "internal_error",
  "message": "An unexpected error occurred. Support ticket: #12345"
}
```

---

## Rate Limits

**API Rate Limits (per user per hour):**

| Endpoint | Limit |
|----------|-------|
| POST /api/upload | 100 |
| GET /api/workflow/:id | 1000 |
| GET /api/oauth/initiate | 50 |
| POST /api/social-media/posts | 500 |
| GET /api/workflows | 1000 |

**Social Media Rate Limits (per platform):**

See ARCHITECTURE_ADR.md Section 4.2 for platform-specific limits.

---

## Webhooks (Future)

```
POST https://your-domain.com/webhooks/social-media
Content-Type: application/json
X-Signature: <hmac-sha256>

{
  "event": "post.published",
  "platform": "instagram",
  "postId": "abc123",
  "timestamp": "2026-08-26T12:00:00Z",
  "metadata": { ... }
}
```

**Supported events:**
- `post.published`
- `post.failed`
- `post.deleted`
- `workflow.completed`
- `workflow.failed`

---

## Code Examples

### Complete Upload → Social Media Flow (React)

```typescript
import { useEffect, useState } from 'react';

export function ProductUploader() {
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('idle');

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('photo', file);

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      headers: { 'x-user-id': userId },
    });

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
          const event = JSON.parse(line.slice(6));
          
          setStatus(event.step);
          if (event.progress !== undefined) {
            setProgress(event.progress);
          }
          
          if (event.step === 'complete') {
            setWorkflowId(event.workflowId);
          }
        }
      }

      buffer = lines[lines.length - 1];
    }
  };

  return (
    <div>
      <input
        type="file"
        onChange={(e) => handleUpload(e.target.files![0])}
        accept="image/*"
      />
      <div>Status: {status}</div>
      <div>Progress: {progress}%</div>
      {workflowId && <div>Workflow: {workflowId}</div>}
    </div>
  );
}
```

### Connect Social Media Account (React)

```typescript
function SocialConnector() {
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState<string[]>([]);

  const handleConnect = async (platform: string) => {
    setConnecting(true);
    
    const res = await fetch('/api/oauth/initiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-user-id': userId,
      },
      body: JSON.stringify({ platform }),
    });

    const { authUrl } = await res.json();
    
    // Redirect to OAuth provider
    window.location.href = authUrl;
  };

  // After OAuth callback, check status
  useEffect(() => {
    const checkStatus = async () => {
      const res = await fetch('/api/social-auth/status', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-user-id': userId,
        },
      });
      
      const { platforms } = await res.json();
      setConnected(
        platforms
          .filter(p => p.status === 'connected')
          .map(p => p.platform)
      );
    };

    checkStatus();
  }, []);

  return (
    <div>
      {['instagram', 'tiktok', 'youtube'].map(platform => (
        <button
          key={platform}
          onClick={() => handleConnect(platform)}
          disabled={connected.includes(platform)}
        >
          {connected.includes(platform) ? `✓ ${platform}` : `Connect ${platform}`}
        </button>
      ))}
    </div>
  );
}
```

---

## FAQ

**Q: Can I upload multiple photos at once?**  
A: Currently single photo per request. Batch uploads coming in Phase 2.

**Q: What happens if a social media post fails?**  
A: Posts that fail are queued in the dead-letter queue and retried exponentially. View via GET /api/dead-letter-queue.

**Q: How long do photos/videos stay in storage?**  
A: 30 days by default. Configure via STORAGE_RETENTION_DAYS environment variable.

**Q: Can I delete a workflow?**  
A: Yes, use DELETE /api/workflows/:workflowId. This cascades and deletes all related listings and posts.

**Q: How do I know when a post is published?**  
A: Either poll GET /api/workflow/:id or subscribe to webhooks (POST /webhooks/social-media).

