# Universal Creative Production Ecosystem — M1 Audit, Architecture & Risks

**Status:** M1 (Audit) — complete, pending owner review before M2 build.
**Branch:** `feat/universal-creative-production` (branched from `arena` @ `800dec7`; `main` untouched at `7040dd9`).
**Date:** 2026-11-16 (America/New_York).
**Scope rule:** This document audits what exists, assigns ownership, and proposes the shared architecture. It does not rebuild working components. No external repo contents are assumed — anything not inspectable from this sandbox is listed as a blocker.

---

## 1. What was inspected

- This sandbox checkout: `BossListers` (branch `arena`, HEAD `800dec7`), all of `lib/`, `app/`, `pages/`, `components/`, `scripts/`, `video/`, `supabase/migrations/`, `docs/`, plus remote branch list and history.
- Sandbox filesystem: only `/home/user/BossListers` and `/home/user/uploads` exist. No sibling repos are present.
- Installed tooling in sandbox: Python 3.13 + OpenCV 4.11 + PIL, ImageMagick (`convert`/`magick`), Node v20. **No `ffmpeg`/`ffprobe` on PATH, no `node_modules`** (snapshot restore removed it; `npm ci` required before tests/builds). No Blender/GIMP/Inkscape/DaVinci/Kdenlive/Shotcut/Natron/Audacity/Ardour/LMMS/REAPER/LibreOffice/Godot/Unity detected.

---

## 2. Project-by-project findings

### 2.1 Commercial Maker (inside BossListers) — EXISTS, live, 5 overlapping paths

BossListers already contains a working commercial-production surface. It is not one system — it is **five overlapping commercial paths** that must be consolidated under one orchestrator (M4), not joined by a sixth:

| # | Path | Entry points | Engine | Status |
|---|------|--------------|--------|--------|
| 1 | **Card Showcase (Remotion)** — newest, primary | `scripts/render-card-showcase.mjs` (CLI), `lib/commercialMaker.js` → `makeCardShowcaseCommercial`, `pages/api/social/make-commercial.js`, `components/video-studio/CardShowcaseEditorPanel.tsx`, `app/api/video-studio/*` | Remotion (`video/CardShowcaseComposition.tsx`, `video/Root.tsx`), `scripts/card_prep.py` (RMBG-1.4 matting, card warp, bundle split), `scripts/commercial_qc.py` (QC), `lib/commercialLearning.js` (learning) | Live, tested (246/246), 2 real MP4s rendered (94/100, 97/100 QC) |
| 2 | **Commercial Cutter (Python)** | `pages/api/omni-lister/cut-commercials.js` → `scripts/commercial_cutter.py` | FFmpeg (hardcoded Windows path `C:\Users\jjard\claude\viral-engine\ffmpeg_bin\ffmpeg.exe`), `scripts/voice_music_factory.py` (Kokoro TTS), `scripts/music_gen.py` (MusicGen) | Live code, **Windows-path-locked**, needs `viral-engine` ffmpeg |
| 3 | **Quick Commercial (Python)** | `scripts/quick_commercial.py` (CLI) | FFmpeg + Kokoro TTS, 15s 4-beat, no bg removal | Live code, Windows-path-locked |
| 4 | **Legacy webhook generator** | `lib/commercialGenerator.js`, `app/api/commercials/route.js` | Webhook to `video-bot-pipeline` (`VIDEO_PIPELINE_WEBHOOK_URL`) + `commercial_jobs` table | **Stale** — route header admits "NOT yet re-verified end-to-end"; receiving side unverified |
| 5 | **External pipeline wrapper** | `lib/commercialMaker.js` → `makeCommercial` → `C:\Users\jjard\claude\video-bot-pipeline\make_commercial.py` | `video-bot-pipeline` repo (not in sandbox) | **Unverifiable from here** — wrapper exists, engine external |

Supporting Commercial Maker pieces (all live in BossListers):
- **Script/copy:** `lib/ads4now/copywriter.js` (AIDA hooks + 5-scene narration, AI with template fallback), `lib/ads4now/commercialMission.js` (30s 5-scene mission + 3 variants + social proof), `pages/api/omni-lister/copywrite.js`, `components/CommercialStudio.js` (canvas scene player/recorder).
- **Image studio:** `pages/api/omni-lister/remove-bg.js` (RMBG-1.4 sidecar `127.0.0.1:8765`), `pages/api/omni-lister/styleframe.js` + `scripts/styleframe_engine.py` (6 presets, turntable angles, pedestals, reflections), `scripts/card_prep.py` (cutout/warp/closeup/bundle-split), `scripts/bg_remove_service.py`.
- **Scene/animation/audio:** `lib/video-studio/types.ts` (Zod scenes/audio/CTA/transitions/motion), `lib/video-studio/templates.ts` (7 templates incl. Card Showcase), `video/VideoComposition.tsx`, `lib/video-studio/draft.ts`, `lib/video-studio/presets.ts`.
- **Render:** `scripts/video-render-worker.mjs` (Supabase `video_studio_projects` poller + Remotion render + post-render QC/learning), `lib/video-studio/renderJobs.ts`, `lib/video-studio/projectStore.ts`, `app/api/video-studio/render/route.ts`.
- **Files/distribution prep:** `lib/commercialFiles.js` (`public/commercials`, preview-vs-live upload), `pages/api/social/post-video.js` (Instagram Reel + Facebook Page, `PUBLISH_LIVE` confirm).
- **QC + learning (just shipped on `arena`):** `scripts/commercial_qc.py` (5-dimension 0–100 QC), `lib/commercialLearning.js` + `lib/video-studio/learning.ts` (per-category playbooks, `bgDim` calibration, feedback/sales re-ranking), `app/api/video-studio/learning/route.ts` (authed), `CardShowcaseEditorPanel` playbook UI, `scripts/test-commercial-learning.js` (7 tests).

### 2.2 Video Studio Pipeline (inside BossListers) — EXISTS, live

- UI: `app/video-studio/page.tsx` → `components/video-studio/VideoStudioClient.tsx` (project CRUD, render polling) + `CardShowcaseEditorPanel.tsx` (1040 lines: showcase editor + learning playbook).
- API: `app/api/video-studio/{projects,projects/[id],render,output/[id],card-prep,learning}/route.ts` — all session-gated (`resolveSession`), verified by `scripts/test-api-auth.js`.
- Storage: Supabase `video_studio_projects` (migration `0011`), tenant-scoped, jsonb project blob. Render output in `.video-studio-data/` (gitignored).
- This is the **command-center seed** (M12): it already has projects, render queue states (`DRAFT/READY/QUEUED/RENDERING/SUCCEEDED/FAILED`), and polling.

### 2.3 StoryForge Ultimate / Book Maker — PARTIAL in BossListers, full engine external

- **Live in BossListers:** KDP publishing suite — `lib/kdp/{exports,metadata,repository,types}.ts` + `app/api/kdp/{packages,exports/pdf,exports/epub,exports/docx,exports/metadata}/route.ts` (PDF/EPUB/DOCX via `docx`+`jszip`, `authors` table). Brand string `"StoryForge"` in `lib/kdp/exports.ts`.
- **Schema-only in BossListers:** migrations `202606180002_storyforge_memory_engine_v2.sql` (universes, worlds, series, books, characters, locations, lore) and `202606180003_storyforge_content_factory_pipeline.sql` (factory runs/artifacts/exports). **Zero code references to `storyforge_*` tables** — no app code reads or writes them. They are dormant schema.
- **External (not in sandbox):** `C:/Users/jjard/claude/bookmaker-station/data/storyforge2` (referenced by `scripts/add-books-inventory.js`, `docs/INVENTORY_BOOKS.md` — book covers live there). The full StoryForge Ultimate memory/factory implementation is presumed to live in `bookmaker-station` and/or `viral-engine`. **Cannot verify — blocker B3.**
- **Directive branch `feature/storyforge2-2026-08-14`:** not present in this repo's branches. Presumed to live in `viral-engine` or `bookmaker-station`. **Blocker B3.**

### 2.4 Video Factory — NO standalone repo in sandbox; fragments exist

No long-form/documentary/YouTube pipeline exists in BossListers. Fragments that a Video Factory would reuse:
- `scripts/commercial_cutter.py` (15s 4-beat cutter, 6-point verification gate, 3 platform specs),
- `scripts/quick_commercial.py` (15s single-photo commercial),
- `scripts/voice_music_factory.py` (Kokoro 4-beat narration with speed alignment),
- `scripts/music_gen.py` (MusicGen beds, channel prompts incl. documentary `GG`/`LO`/`IL`),
- `video/VideoComposition.tsx` + `lib/video-studio/*` (multi-scene Remotion),
- `scripts/video-render-worker.mjs` (queue worker pattern).
- **Missing:** research/script/storyboard agents, subtitle pipeline, thumbnail generator, long-form assembly, bulk scheduling. These are M5 build items, not existing capabilities. Do not claim they exist.

### 2.5 Viral Engine (`mjardin17/viral-engine`) — NOT ACCESSIBLE

- Referenced by: `scripts/commercial_cutter.py` + `scripts/quick_commercial.py` (ffmpeg paths), `CHANNEL_SETUP.md` (eBay sync Edge Function `viral-engine/inventory-sync/`), `bosslister-pc-vs-github-audit.md` (`C:\Users\jjard\claude\viral-engine\`).
- `git ls-remote https://github.com/mjardin17/viral-engine.git` fails in sandbox: `fatal: could not read Username` (no credentials, no public access). **Blocker B2.**
- This sandbox clone also has **no `origin` remote configured** (`git remote -v` is empty), so even `BossListers` cannot be pushed from here. **Blocker B1.**

### 2.6 Commercial Maker V6 (`C:\Users\jjard\Downloads\commercial-maker-v6\`) — NOT ACCESSIBLE

- Windows Downloads path; sandbox is Linux with only `/home/user/BossListers`. Referenced only by `scripts/styleframe_engine.py` docstring ("commercial-maker-v6 backgrounds") and `pages/api/omni-lister/remove-bg.js` comment ("Commercial Maker v6 RMBG-1.4 pipeline").
- **Blocker B4.** The V6 capabilities must be audited from the owner's machine or a pushed archive before M4 can claim to "advance StoryForge Ultimate / V6" rather than reinvent them.

### 2.7 CROSSPOST Studio — PARTIAL in BossListers, full studio external

- **Live in BossListers (distribution surface):** `lib/socialMediaPosters.js` (8 social adapters; video posting wired for **Instagram + Facebook only**, `VIDEO_URL_PLATFORMS`), `lib/multiPlatformPoster.js` (marketplace `post-everything` flow), `pages/api/social/post-video.js` (preview-default, `PUBLISH_LIVE` confirm, per-platform truthful reporting), `lib/channels/socialMediaConnector.js` (`buildCaption`).
- **UI labels only:** `components/dashboard/TopBar.tsx` ("CrossPost"), `CommandPalette.tsx` ("Tell CrossPost AI what to do…") — no CROSSPOST Studio app code in this repo.
- `BOSS_LISTERS_ARCHITECTURE.md` (Empire MASTER spec) already decided: **marketplace cross-listing = BossListers; social syndication = CrossPost**. That boundary is preserved in this plan.
- Full CROSSPOST Studio repo not located. **Blocker B5** (partial — BossListers-side distribution is audited; studio-side scheduling/analytics are not).

### 2.8 BossListers integrations — EXISTS, live

- **Inventory → commercial (already wired):** `pages/storefronts.js` `MakeCommercial` → `POST /api/social/make-commercial` → `lib/commercialMaker.js` (`buildMakeRequest` from `lib/supabaseInventory.js` product row; never invents price; render-only, posts nothing). `GET /api/social/make-commercial` lists commercial-ready items.
- **Empire contract:** `lib/empireContract.js` + `pages/api/empire/*` (`/empire/health|event|listings|platforms|stock/add`, `X-Empire-Key` fail-closed). Empire OS is the hub; BossListers is a module on port 3001.
- **Inventory system of record:** `lib/supabaseInventory.js`, `lib/stockList.js`, `lib/inventorySyncService.js`, `supabase/migrations/0001–0026` (products, listings, tenants, channels, orders, stock).
- **Reseller agents (NOT creative agents):** `lib/agents/*` — sourcing, pricing, risk, velocity, inventory, optimization, listing + `executionAgent.ts` orchestrator + `councilMonitor.ts`. These score reseller decisions; they are not a creative workforce. M6 must add creative agents alongside, not replace these.

### 2.9 AI Orchestra / Learning Core / Empire Memory — NO unified core; fragments exist

- **Creative learning (new, live):** `lib/commercialLearning.js` (per-category playbooks, QC-driven recipe optimization, `bgDim` calibration, star/tag/sales feedback, `--explore`), `lib/video-studio/learning.ts` (Zod schemas), `data/commercial-learning.json` (gitignored local store; 2 seeded runs, avg 95.5/100).
- **Correction memory:** `lib/userCorrections/{correctionStore,correctionMerge,correctionPricingMemory}.ts` (pricing-focused).
- **Event bus:** `lib/eventEngine/{eventBus,eventDispatcher,eventStore,eventTypes}.ts`.
- **Storage/telemetry:** `lib/storage/{localDatabase,cacheEngine,telemetryStore,snapshotEngine,recoveryEngine,scanHistoryStore,listingHistoryStore,inventoryPersistence}.ts`.
- **Domain brain:** `lib/bossBrain.ts` (BUY/MARGINAL/SKIP reseller recommendations).
- **Missing:** a shared Learning Core that unifies creative + reseller learning, verified-skill promotion, regression-test generation from failures, and model/workflow scorecards. M10 builds this by **extending** `commercialLearning.js`, not by adding a parallel store (AGENTS.md: one system per job).

### 2.10 Creative application integrations — NONE verified; 2 present

| App | Integration method (verified?) | Status in sandbox |
|-----|-------------------------------|-------------------|
| FFmpeg/ffprobe | CLI subprocess | **Not installed**; code hardcodes Windows `viral-engine\ffmpeg_bin` paths |
| ImageMagick | CLI | Installed (`convert`/`magick`) — **no code integration yet** |
| Python PIL/OpenCV | Library | Installed; integrated (`card_prep.py`, `commercial_qc.py`, `styleframe_engine.py`) |
| Remotion | Node library | Declared in `package.json`; `node_modules` absent in sandbox (needs `npm ci`) |
| Kokoro TTS / MusicGen / RMBG-1.4 | Python local models | Code-integrated; models not verified in sandbox |
| Blender, FreeCAD, OpenSCAD, MeshLab, GIMP, Inkscape, Krita, Darktable, Scribus, Penpot, DaVinci Resolve, Kdenlive, Shotcut, Natron, Audacity, Ardour, LMMS, REAPER, LibreOffice, ONLYOFFICE, Godot, Unity, Material Maker | — | **Not installed, no integration code.** Per directive: no MCP claim without a tested integration. All start as `unverified` in the registry (M2/M3). |

---

## 3. Capability ownership map (who owns what — no duplicates)

| Capability | Owner (single source of truth) | Consumers |
|------------|-------------------------------|-----------|
| Product catalog / inventory / pricing truth | BossListers (`lib/supabaseInventory.js`, `lib/stockList.js`, Supabase `products`) | Commercial Maker (read), Video Factory (read), CROSSPOST (read) |
| Marketplace cross-listing | BossListers (`lib/multiPlatformPoster.js`, `lib/channels/apiConnectors.js`) | — (never CROSSPOST) |
| Social video distribution | CROSSPOST boundary (`lib/socialMediaPosters.js`, `pages/api/social/post-video.js`) | Commercial Maker / Video Factory (submit approved exports only) |
| Commercial production (all 5 paths → 1 orchestrator) | Commercial Maker lane (`lib/commercialMaker.js` + `lib/video-studio/*` + `video/*`) | Video Studio UI, storefronts UI, CLI |
| Long-form video production | Video Factory lane (new, M5; reuses cutter/voice/music/Remotion fragments) | Command Center |
| Book/story memory + KDP | StoryForge Ultimate (external engine; BossListers keeps KDP exports `lib/kdp/*` + dormant `storyforge_*` schema until engine access lands) | Commercial Maker (storytelling workflows) |
| Creative asset library | Shared Asset Factory (new, M7; seeds from `public/commercials`, `public/styleframes`, `public/cutouts`, `public/uploads`) | Both lanes |
| Creative application registry | Universal Connector (new, M2/M3) | Both lanes, agents |
| Creative agents | Orchestrator (new, M6; extends `lib/agents/executionAgent.ts` pattern) | Workflows (M9) |
| Production workflows | Workflow runner (new, M9) | Command Center |
| Learning (creative + reseller) | Learning Core (M10; extends `lib/commercialLearning.js` + `lib/userCorrections/*`) | Both lanes, Arena evaluation |
| Model evaluation | Arena evaluation (new, M10; local-only by default, no paid credits without approval) | Router (M10) |
| Resource management / queues | Resource manager (new, M12; extends `video-render-worker` + `renderJobs.ts`) | Both lanes |
| Command Center | Video Studio (extended, M12; `components/video-studio/*` + `app/video-studio/*`) | Owner |

---

## 4. Proposed shared architecture

```
                        ┌─────────────────────────────────────────────┐
                        │            COMMAND CENTER (M12)             │
                        │  Video Studio extended: lanes, queues,      │
                        │  registry, agents, assets, QC, learning,    │
                        │  resources, history, job initiation         │
                        └──────────────────┬──────────────────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              │                            │                            │
   ┌──────────▼──────────┐    ┌────────────▼─────────────┐   ┌────────▼─────────┐
   │  VIDEO FACTORY lane │    │ COMMERCIAL MAKER lane    │   │  STORYFORGE ULT. │
   │  (M5) long-form,    │    │ (M4) commercials, ads,   │   │  reference impl. │
   │  docs, shorts, bulk │    │  promos, campaigns,      │   │  (external; KDP  │
   │                     │    │  inventory commercials   │   │  exports in-repo)│
   └──────────┬──────────┘    └────────────┬─────────────┘   └────────┬─────────┘
              │                            │                            │
              └────────────────────────────┼────────────────────────────┘
                                           │
                        ┌──────────────────▼──────────────────────────┐
                        │  UNIVERSAL CREATIVE PRODUCTION ENGINE (M2)  │
                        │  lib/universal-creative/                    │
                        │  • connector registry + capability manifests│
                        │  • agent orchestrator (M6)                  │
                        │  • workflow runner (M9)                     │
                        │  • shared asset factory (M7)                │
                        │  • QA (extends commercial_qc.py)            │
                        │  • Learning Core bridge (M10)               │
                        │  • Arena evaluation (M10)                   │
                        │  • resource manager (M12)                   │
                        └──────────────────┬──────────────────────────┘
                                           │
        ┌──────────────────┬───────────────┼──────────────────┬─────────────────┐
        ▼                  ▼               ▼                  ▼                 ▼
  Creative apps      BossListers      CROSSPOST          Learning Core    Arena models
  (M3: FFmpeg,       inventory        (approved          (verified        (local-first;
  ImageMagick,       (read-only       exports only;      skills only;     no paid calls
  PIL/OpenCV,        product truth)   PUBLISH_LIVE       regression       without approval)
  Remotion,          + Empire         confirm)
  Kokoro/MusicGen/   contract
  RMBG; rest
  unverified)
```

Design rules (from `AGENTS.md` + `ARCHITECTURE_RULES.md`, non-negotiable):
1. **Extend, never duplicate.** One system per job. The 5 commercial paths consolidate under `lib/commercialMaker.js` + `lib/video-studio/*`; learning extends `lib/commercialLearning.js`; agents extend the `lib/agents/executionAgent.ts` pattern.
2. **Zod at every boundary.** All new schemas live in one source of truth per domain (`lib/video-studio/*` pattern).
3. **Auth on every API route.** `scripts/test-api-auth.js` is a hard gate — any new `app/api/**/route.ts` must contain `resolveSession` (or equivalent) or the build fails.
4. **Render-only safety.** Nothing auto-lists, auto-posts, or invents prices/specs. Publishing requires `PUBLISH_LIVE` + authorized connections (existing pattern, preserved).
5. **No AI calls in UI components; no business logic in pages.** API routes coordinate; domain helpers own logic.
6. **No MCP claims without tested integrations.** Every app starts `unverified` in the registry with a capability manifest (formats, permissions, resources, verification history).
7. **Local-first, zero paid APIs by default.** Arena evaluation and agents run local models/templates unless the owner approves paid usage per job.
8. **Windows paths must be parameterized** (`FFMPEG_PATH` env / `which` lookup) before any cloud/remote execution claim.

---

## 5. Risks

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R1 | **External repos inaccessible** (V6, viral-engine, video-bot-pipeline, bookmaker-station, CROSSPOST Studio, branch `feature/storyforge2-2026-08-14`) | M4/M5 could rebuild what already exists; StoryForge "reference implementation" unverifiable | Blockers B1–B5 below; M2–M3 proceed on BossListers-verified surface only; owner provides archives/credentials before M4 claims V6/StoryForge advancement |
| R2 | **No git remote in sandbox** | Cannot push `feat/universal-creative-production` or `arena` from here | Owner pushes from `C:\Users\jjard\claude\BossListers` (existing pattern) |
| R3 | **5 overlapping commercial paths** | New engine becomes a 6th system; bugs multiply | M4 consolidates under one orchestrator with path adapters; legacy webhook path (4) deprecated after verification |
| R4 | **Windows absolute paths** (`C:\Users\jjard\...` in `commercialMaker.js`, `commercial_cutter.py`, `quick_commercial.py`) | Breaks Linux/cloud/remote execution; silent failures | M2 connector layer parameterizes all tool paths via env + discovery; tests assert no `C:\` literals in new code |
| R5 | **Missing sandbox tooling** (no ffmpeg, no node_modules, heavy Python models) | Cannot run acceptance tests A/B here | `npm ci` + documented tool bootstrap; acceptance tests run on owner machine or CI with ffmpeg; sandbox verifies unit/integration layers |
| R6 | **Auth gate** (`test-api-auth.js`) | New Command Center / registry APIs fail build if unauthenticated | Every new route uses `resolveSession`; tests run after each milestone |
| R7 | **Learning store is local-only** (`data/`, gitignored) | Multi-tenant/cloud loses playbooks; per-tenant isolation absent | M10 migrates learning to tenant-scoped Supabase (pattern: `0011_video_studio_projects.sql`); local file remains CLI fallback |
| R8 | **Paid-API creep** (copywriter AI, future Arena models) | Unexpected spend | Local/template defaults; paid calls require per-job approval + cost tracking (M12) |
| R9 | **Scope (12 milestones)** | Big-bang rewrite risk; breaks working 246-test baseline | Incremental milestones with `npm test && typecheck && build` after each; `main` never touched; feature branch only |
| R10 | **Dormant StoryForge schema** (`storyforge_*` tables, zero code) | Dead schema confuses ownership; RLS policies use `auth.uid()` while app uses tenant sessions | M4/M10 reconcile: either wire the engine or mark schema deprecated — owner decision after B3 access |

---

## 6. Blockers (need owner action)

| ID | Blocker | Needed to unblock |
|----|---------|-------------------|
| B1 | Sandbox has no `origin` remote; push impossible from here | Push from owner machine, or provide credentials/remote URL |
| B2 | `mjardin17/viral-engine` not accessible (`ls-remote` auth failure) | Public access, credentials, or archive of `viral-engine` (esp. `ffmpeg_bin`, `inventory-sync/`, branch `feature/storyforge2-2026-08-14`) |
| B3 | StoryForge Ultimate engine (`bookmaker-station/data/storyforge2`) + branch `feature/storyforge2-2026-08-14` not in this repo | Archive or repo access; decision on dormant `storyforge_*` schema (R10) |
| B4 | Commercial Maker V6 (`C:\Users\jjard\Downloads\commercial-maker-v6\`) not in sandbox | Archive of V6 (esp. backgrounds + RMBG pipeline) for M4 audit |
| B5 | CROSSPOST Studio full repo not located (only BossListers-side distribution audited) | Repo location/access for scheduling/analytics integration (M11) |
| B6 | `video-bot-pipeline` (`C:\Users\jjard\claude\video-bot-pipeline`) not in sandbox | Archive or access (owns `make_commercial.py`, eBay/Etsy/Facebook Python bridges) |

**M2–M3 do not require B1–B6** (they build on the BossListers-verified surface). M4's "advance StoryForge/V6" claim and M11's CROSSPOST integration do.

---

## 7. Milestone plan (incremental, tests after each)

- **M1 — Audit (this document).** Ownership map + architecture + risks. ✅ Done, pending review.
- **M2 — Universal Connector skeleton.** `lib/universal-creative/registry.ts` (capability manifests, connection status, permissions, resources, formats, verification history) + `app/api/video-studio/registry/route.ts` (authed) + tests. No app claims beyond verified (FFmpeg/PIL/OpenCV/Remotion/ImageMagick).
- **M3 — Core app integrations.** Parameterize tool paths (kill `C:\` literals); verify FFmpeg, ImageMagick, Remotion, Kokoro/MusicGen/RMBG where installable; mark everything else `unverified`.
- **M4 — Commercial Maker + StoryForge upgrade.** Consolidate 5 paths under orchestrator; Image/Scene/Animation/Audio/Render studios as workflow stages over existing engines. Requires B3/B4 for "advance" claims.
- **M5 — Video Factory upgrade.** Long-form/doc/shorts/bulk workflows over cutter/voice/music/Remotion fragments.
- **M6 — Specialized agent workforces.** Commercial (10 agents) + Video Factory (11 agents) via orchestrator; creative agents alongside reseller agents.
- **M7 — Shared Asset Factory.** Asset registry (ID/project/production/source/format/dims/version/location/deps/approval/QC) seeded from `public/*`; never overwrite originals.
- **M8 — BossListers inventory → commercials.** Batch generation from real inventory (extends existing `make-commercial` linkage); manual entry fallback; never invent specs/prices.
- **M9 — Production workflows.** 6 reusable workflows (Product Commercial, Local Business, YouTube, Documentary, Short-Form Campaign, Multi-Platform), executable/observable/recoverable.
- **M10 — Learning Core + Empire Memory + Arena.** Unify creative/reseller learning; verified-skill promotion; regression tests from failures; local-first model scorecards + routing.
- **M11 — CROSSPOST distribution.** Approved exports → platform versions (dims/captions/thumbs); `PUBLISH_LIVE` preserved. Requires B5.
- **M12 — Command Center + resources/security + acceptance.** Unified dashboard in Video Studio; CPU/RAM/GPU/storage monitoring; queues/timeouts/retry; audit logs; acceptance tests A (Commercial) + B (Video Factory) with real renders + QC + shared-connector/asset proof.

Acceptance (per directive §16): Test A and Test B must be **real end-to-end renders** through the shared connector with QC reports — simulated workflows do not count.

---

## 8. M1 verification

- Baseline (pre-M1, on `arena`): `npm test` 246/246 PASS, `typecheck` 0 errors, `build` 72/72 routes (verified 2026-11-16 session).
- M1 change: this document only (no code). Tests re-run after commit to confirm baseline holds.
- Branch hygiene: work on `feat/universal-creative-production` only; `main` untouched; no push from sandbox (B1).
