# Boss Listers: Architecture Summary & Implementation Roadmap

## Overview

This architecture completes the **6 missing layers** of the Boss Listers photo→everywhere automation system:

1. ✅ **OAuth Architecture** — Multi-platform credential management with refresh logic
2. ✅ **Credential Management** — Encrypted token storage per user
3. ✅ **Upload UI Architecture** — Real-time progress streaming
4. ✅ **Social Media Posting** — Adapter pattern for 8 platforms  
5. ✅ **Workflow Orchestration** — End-to-end async pipeline with job dependencies
6. ✅ **Data Models** — Complete Supabase schema + API contracts

---

## Documents Included

| Document | Purpose | Audience |
|----------|---------|----------|
| **ARCHITECTURE_ADR.md** | Complete architectural decisions + rationale | Tech leads, architects |
| **IMPLEMENTATION_GUIDE.md** | Step-by-step implementation instructions | Frontend + backend engineers |
| **API_REFERENCE.md** | Full API documentation | Frontend engineers, integrators |
| **sql/00-init-tables.sql** | Database schema + migrations | DevOps, backend engineers |
| This file | Roadmap + quick reference | Project managers, architects |

---

## Technology Stack

```
Frontend:     Next.js 14.2 + React 18.3 + Tailwind CSS
Backend:      Next.js API routes (serverless)
Database:     Supabase (PostgreSQL) + RLS
Auth:         Supabase Auth + OAuth 2.0 per platform
Video:        Remotion 4.0 (server-side rendering)
Vision:       OpenAI GPT-4O Vision (product extraction)
Queue:        PostgreSQL (job queue) + Redis (token cache)
Security:     AES-256-GCM encryption + per-user keys
Monitoring:   Supabase analytics + custom dashboards
```

---

## Architecture Layers

### Layer 1: OAuth & Credentials
```
User clicks "Connect Instagram"
    ↓
/api/oauth/initiate → Supabase oauth_pending_states (5-min TTL)
    ↓
Redirect to Instagram login
    ↓
Instagram redirects to /api/oauth/callback?code=...&state=...
    ↓
Exchange code for access_token + refresh_token
    ↓
Encrypt with user-specific key + store in oauth_credentials
    ↓
Cache access_token in Redis (1-hour TTL)
    ↓
Test token validity (API call to platform)
```

**Key Tables:**
- `oauth_credentials` — encrypted tokens per user per platform
- `oauth_pending_states` — CSRF protection (expiry-based cleanup)
- `oauth_audit_log` — compliance logging

---

### Layer 2: Upload & Real-Time Progress
```
Photo selected (drag-drop or file input)
    ↓
POST /api/upload (Server-Sent Events)
    ↓
Stream progress events in real-time:
  - "uploading" (Supabase Storage)
  - "extracting" (Claude Vision)
  - "publishing_marketplaces" (27 parallel jobs)
  - "generating_commercial" (Remotion render)
  - "posting_social" (8 parallel jobs)
    ↓
Client displays progress bar + intermediate results
    ↓
Final summary: links + analytics
```

**SSE Events Every 2-5 Seconds**

---

### Layer 3: Workflow Orchestration
```
workflow_executions (top-level tracking)
    ├─ photo_extraction (1 job, high priority)
    │  └─ generates extraction_data
    │
    ├─ marketplace_publish (27 jobs, normal priority)
    │  └─ depends_on: extraction job
    │
    ├─ commercial_generation (1 job, normal priority)
    │  └─ depends_on: extraction job
    │
    └─ social_media_post (8 jobs, normal priority)
       └─ depends_on: commercial generation job
```

**Dependency Resolution:**
- Job queries: `WHERE status IN ('queued', 'retrying') AND (depends_on IS NULL OR depends_on_id IN (completed jobs))`
- Polling every 5 seconds
- Exponential backoff on retry

---

### Layer 4: Social Media Adapters

```typescript
// Abstract base class
interface SocialMediaAdapter {
  validateVideo(spec): Promise<ValidationResult>
  post(opts): Promise<PostResult>
  getAnalytics(postId): Promise<Analytics>
  delete(postId): Promise<void>
}

// Concrete implementations: Instagram, TikTok, YouTube, Facebook, Twitter, LinkedIn, Snapchat, Pinterest
```

**Failure Handling:**
- Rate limiting per platform (429 → backoff)
- Dead-letter queue for permanent failures
- Manual retry from dashboard
- Audit log for all attempts

---

### Layer 5: Error Recovery & Dead-Letter Queue

```
Post fails (retryable error)
    ↓
Add to dead_letter_queue with exponential backoff
    ↓
Retry attempt 1 after 1 min (5-min safety margin)
    ↓
Retry attempt 2 after 5 min
    ↓
Retry attempt 3 after 30 min
    ↓
Retry attempt 4 after 2 hours
    ↓
Retry attempt 5 after 8 hours
    ↓
If still failing: Mark "abandoned" + alert user
    ↓
User can manually trigger retry from dashboard
```

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
**Goal:** Prepare database and encryption infrastructure

- [ ] Create Supabase migration files
- [ ] Implement `lib/crypto/credentialEncryption.ts`
- [ ] Deploy `oauth_credentials` + `oauth_pending_states` tables
- [ ] Set up environment variables

**Deliverables:**
- Database schema deployed
- Encryption utilities tested
- Ready for OAuth implementation

---

### Phase 2: OAuth & Auth (Weeks 2-4)
**Goal:** Implement OAuth flow for all 8 platforms

- [ ] `/api/oauth/initiate` — state generation + storage
- [ ] `/api/oauth/callback` — token exchange + validation
- [ ] Token refresh manager + Redis caching
- [ ] Per-platform OAuth handlers (8 files)
- [ ] Test endpoint validation
- [ ] Audit logging

**Deliverables:**
- Users can connect all 8 platforms
- Tokens securely stored + refreshed
- Dashboard shows connection status

**Platforms:**
1. Instagram (long-lived tokens)
2. TikTok (no refresh; re-login required)
3. YouTube (standard OAuth with refresh)
4. Facebook (multi-account support)
5. Twitter/X (PKCE flow)
6. LinkedIn (standard OAuth)
7. Snapchat (marketing API)
8. Pinterest (standard OAuth)

---

### Phase 3: Upload & Extraction (Weeks 4-6)
**Goal:** Build real-time photo upload with progress tracking

- [ ] Photo upload component (React)
- [ ] SSE progress streaming
- [ ] Photo validation (size, format, dimensions)
- [ ] Error handling + retry UI
- [ ] Integration with existing Vision extraction
- [ ] Progress dashboard

**Deliverables:**
- Upload form with real-time progress
- Extraction data preview
- Error states with retry buttons

---

### Phase 4: Workflow Orchestration (Weeks 6-8)
**Goal:** Implement job queue + dependency resolution

- [ ] `WorkflowJobQueue` class (Postgres-based)
- [ ] Job state machine (queued → processing → completed/failed/retrying)
- [ ] Dependency resolution (depends_on foreign key)
- [ ] `/api/workflow/execute` handler (dispatch to worker)
- [ ] Scheduled polling (every 5 seconds)
- [ ] Status tracking database schema

**Deliverables:**
- Jobs execute in correct order
- Parallel execution of independent jobs (27 marketplaces + 8 social)
- Retry logic with exponential backoff
- Progress tracking per job

---

### Phase 5: Social Media Adapters (Weeks 8-10)
**Goal:** Implement posting for all 8 platforms

**1 adapter per platform:**

1. **Instagram Adapter**
   - Validate: 15-90s, 9:16 aspect ratio
   - Post: `/me/media` → `/media/publish`
   - Analytics: insights API

2. **TikTok Adapter**
   - Validate: 3-60s, 9:16 vertical
   - Post: Creator Marketplace API
   - DLQ for rate limiting

3. **YouTube Adapter**
   - Validate: 15-60s, 9:16 Shorts
   - Post: `/youtube/v3/videos`
   - Analytics: viewCount, engagementMetrics

4. **Facebook Adapter**
   - Validate: 15-120s, any aspect ratio
   - Post: `/me/videos` (pages API)
   - Multi-account support

5. **Twitter/X Adapter**
   - Validate: 15-140s, any aspect ratio
   - Post: `/2/tweets` + media upload
   - v2 API with PKCE

6. **LinkedIn Adapter**
   - Validate: 3-600s, 1:1 or 16:9
   - Post: `/ugcPosts` + media register
   - Company + personal profiles

7. **Snapchat Adapter**
   - Validate: 5-60s, 9:16 vertical
   - Post: `/api/v1/me/media` (Spotlight)
   - Creative kit API

8. **Pinterest Adapter**
   - Validate: 15-60s, 9:16 vertical
   - Post: `/v5/user_account/pins`
   - Shop integration

**Deliverables:**
- All 8 platforms post successfully
- Per-platform rate limiting
- Dead-letter queue for failures
- Analytics dashboard

---

### Phase 6: Integration & Testing (Weeks 10-12)
**Goal:** Full system testing + production readiness

**Unit Tests:**
- Encryption/decryption
- OAuth state validation
- Token refresh logic
- Job dependency resolution
- Retry backoff calculations

**Integration Tests:**
- OAuth end-to-end (with platform mocks)
- Photo → extraction → marketplace → commercial → social (end-to-end)
- Retry logic (job failure + DLQ processing)
- Concurrent uploads (load testing)

**E2E Tests:**
- Real browser: upload → progress tracking → results
- OAuth connect/disconnect flow
- DLQ manual retry
- Workflow status polling

**Performance Tests:**
- 1000 concurrent uploads
- 10,000 jobs in queue
- Social media API concurrency limits
- Database query performance

**Security Audit:**
- Credentials encryption verification
- RLS policies enforcement
- OAuth state CSRF protection
- Token refresh margin correctness
- Audit log completeness

**Deliverables:**
- All tests green
- 80%+ code coverage
- Security audit passed
- Performance benchmarks documented
- Production deployment checklist

---

## Key Decision Trade-offs

| Decision | Advantage | Trade-off |
|----------|-----------|-----------|
| Postgres job queue (vs. Redis) | ACID guarantees; simpler ops | Slower polling; ~200 jobs/sec max |
| Per-user encryption keys | Defense in depth | Key derivation needed |
| Server-side OAuth state | CSRF protection | Session table overhead |
| Exponential backoff (8+ hrs) | Reduces thundering herd | Long wait before abandonment |
| Adapter pattern per platform | Easy to test/modify | ~500 LOC per adapter |
| Dead-letter queue | Manual intervention possible | Requires monitoring |

---

## Monitoring & Observability

**Key Metrics:**

```
OAuth Metrics:
  - Connection success rate per platform
  - Token refresh failures
  - Average token age at refresh

Workflow Metrics:
  - Completion rate (target: >95%)
  - Average duration (extraction, marketplaces, commercial, social)
  - Job retry rate
  - DLQ depth (alert if > 10)

Social Media Metrics:
  - Posts per platform
  - Success rate per platform
  - Average posting latency
  - Rate limit hits (track per platform)

Performance Metrics:
  - Upload latency (p50, p99)
  - Job processing latency
  - Database query time
  - Redis hit rate (token cache)
```

**Alerting Rules:**

```
IF dlq_depth > 10 THEN Slack #alerts
IF oauth_token_refresh_failure_rate > 5% THEN Email ops@
IF workflow_completion_rate < 90% THEN Datadog alert
IF social_posting_latency_p99 > 60s THEN Log for analysis
```

---

## Database Performance Tuning

**Indexes Created:**

```sql
-- Workflow polling (most frequent query)
idx_workflow_jobs_poll ON workflow_jobs(status, priority, created_at)
  WHERE status IN ('queued', 'retrying')

-- User activity timelines
idx_oauth_creds_user_created
idx_workflow_exec_user_created

-- Platform queries
idx_social_posts_platform
idx_marketplace_listings_platform

-- Cleanup jobs
idx_oauth_states_expires (for deletion of expired states)
idx_dlq_status_next_retry (for retry processing)
```

**Query Performance Targets:**

```
Job polling (10 jobs):     < 50ms
Status check (1 workflow): < 100ms
DLQ processing (batch):    < 500ms
List user workflows:       < 200ms
```

---

## Deployment Checklist

```
Pre-Production:
  ☐ Database migrations applied
  ☐ RLS policies enabled + tested
  ☐ Environment variables set
  ☐ OAuth callback URLs configured on platforms
  ☐ Redis cache configured
  ☐ Email alerts configured
  
Testing:
  ☐ Unit tests green (80%+ coverage)
  ☐ Integration tests green
  ☐ E2E tests green (Playwright)
  ☐ Load testing completed (1000 concurrent)
  ☐ Security audit passed
  ☐ Performance benchmarks met
  
Production:
  ☐ Monitoring dashboards created
  ☐ Alert rules configured
  ☐ Backup strategy verified
  ☐ Rollback plan documented
  ☐ Support documentation finalized
  ☐ User onboarding guide created
```

---

## Quick-Start Guide

### 1. Start Phase 1 This Week
```bash
cd BossListers
git checkout -b feat/architecture

# Create initial database migration
supabase migration new initial_schema
# Edit supabase/migrations/...sql with contents from docs/sql/00-init-tables.sql
supabase db push

# Create encryption utilities
touch lib/crypto/credentialEncryption.ts
```

### 2. Phase 2 (Next Week)
```bash
# Create OAuth API routes
mkdir -p app/api/oauth/{initiate,callback}
# Implement handlers from IMPLEMENTATION_GUIDE.md

# Create platform handlers
mkdir -p lib/oauth/handlers
# Implement 8 platform-specific OAuth flows
```

### 3. Phase 3-6
```bash
# Follow IMPLEMENTATION_GUIDE.md step-by-step
# Each phase has clear deliverables
# Integrate with existing extraction + video generation
```

---

## Estimated Effort

| Phase | Duration | FTE | Work |
|-------|----------|-----|------|
| 1 | 2 weeks | 1 | DB schema, encryption |
| 2 | 2 weeks | 1.5 | OAuth flows (8 platforms) |
| 3 | 2 weeks | 1 | Upload component, SSE |
| 4 | 2 weeks | 1 | Job queue, orchestration |
| 5 | 2 weeks | 2 | Adapters (8 platforms), DLQ |
| 6 | 2 weeks | 1.5 | Testing, monitoring, security |
| **Total** | **12 weeks** | **~10** | Complete architecture |

**Parallelization:** Phases 2–5 can run concurrently after Phase 1, reducing total time to ~8 weeks with 2 engineers.

---

## Next Steps

1. **This Week:** Review ARCHITECTURE_ADR.md + IMPLEMENTATION_GUIDE.md
2. **Week 1:** Start Phase 1 (database + encryption)
3. **Week 2:** Begin Phase 2 (OAuth) while Phase 1 is wrapping
4. **Week 4:** OAuth complete + Phase 3 (upload) starts
5. **Week 6:** Workflow orchestration + adapters in parallel
6. **Week 8:** Integration & E2E testing
7. **Week 10:** Security audit + performance optimization
8. **Week 12:** Production deployment

---

## Support & Questions

**For architectural questions:**
- See ARCHITECTURE_ADR.md Sections 8-10 (rationale, trade-offs, monitoring)

**For implementation questions:**
- See IMPLEMENTATION_GUIDE.md (step-by-step with code examples)

**For API integration:**
- See API_REFERENCE.md (all endpoints, error handling, examples)

**For database questions:**
- See docs/sql/00-init-tables.sql (schema, RLS, performance notes)

---

## Success Criteria

✅ Architecture is **modular** (add platform in <3 hours)  
✅ System is **reliable** (99%+ workflow completion)  
✅ Credentials are **secure** (AES-256-GCM, per-user keys)  
✅ Failures are **recoverable** (DLQ + exponential backoff)  
✅ Performance is **acceptable** (<30 sec for small photos)  
✅ Monitoring is **complete** (all critical metrics tracked)  
✅ Documentation is **comprehensive** (team can extend independently)  

---

**This architecture is ready for immediate implementation. Start with Phase 1 and follow the roadmap. 🚀**

