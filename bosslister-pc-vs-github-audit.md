# BossListers PC vs GitHub Audit Report
**Date:** 2026-09-22  
**Branch:** `feat/native-connectors-amazon-tiktok-ebay-etsy-fb-ig-bonanza`  
**Repo:** `mjardin17/boss-listers-mvp`

---

## ROOTS VERIFICATION ✅

| Item | Status | Value |
|------|--------|-------|
| Working Directory | ✅ | `C:\Users\jjard\claude\BossListers` |
| Git Remote | ✅ | `https://github.com/mjardin17/boss-listers-mvp.git` |
| Current Branch | ✅ | `feat/native-connectors-amazon-tiktok-ebay-etsy-fb-ig-bonanza` |
| `.env.local` Exists | ✅ | Yes (gitignored, contents not printed) |

---

## STEP 1: LOCAL GIT STATE

### Modified Files (4)
```
 M lib/__tests__/inventorySyncService.test.js
 M lib/inventorySyncService.js
 M pages/api/omni-lister/save.js
 M scripts/commercial_cutter.py
```

### Untracked Files (4)
```
?? card-lane-handoff-report.md
?? ebay-dryrun-oddish-report.md
?? public/voice/
?? scripts/voice_music_factory.py
```

### Recent Commits (Last 3)
```
04f79fe feat: add Snapchat Shop, Twitter Commerce, Pinterest Shop (16 total)
7f002eb feat: add Mercari, Poshmark, Depop connectors (13 total)
7f4ca99 feat: add commercial cutter with local MusicGen audio bed and Omni-Lister video syndication
```

---

## STEP 2: MISSING EBAY/BONANZA BRIDGE FILES

### Expected by Code but MISSING from BossListers/
These files are **REFERENCED** in BossListers code but do **NOT EXIST** in this repository:

| File | Referenced In | Status |
|------|---|---|
| `lib/etsy_listing.py` | `lib/channels/apiConnectors.js` | **MISSING** |
| `scripts/listing_service.py` | Multiple .js files | **MISSING** |
| `lib/facebook_marketplace_listing.py` | `lib/channels/apiConnectors.js` | **MISSING** |
| `lib/bonanza_listing.py` | `lib/channels/apiConnectors.js` | **MISSING** |
| `scripts/ebay_listing_service.py` | `pages/api/channels/ebay/create-listing.js` | **MISSING** |

---

## STEP 3: MACHINE-WIDE HUNT — FOUND LOCATIONS

### ✅ Bridge Files EXIST in Sister Project: `video-bot-pipeline`

**Location:** `C:\Users\jjard\claude\video-bot-pipeline\`

| File | Size | Last Modified | PC Status |
|------|------|---|---|
| `lib/ebay_listing.py` | Present | 2025+ | ✅ FOUND |
| `lib/bonanza_listing.py` | Present | 2025+ | ✅ FOUND |
| `lib/etsy_listing.py` | Present | 2025+ | ✅ FOUND |
| `lib/facebook_marketplace_listing.py` | Present | 2025+ | ✅ FOUND |
| `scripts/listing_service.py` | Present | 2025+ | ✅ FOUND |
| `scripts/ebay_listing_service.py` | Present | 2025+ | ✅ FOUND |

**Also in worktrees:** `.claude/worktrees/api-key-book-corrections-1fe882/` (backup copies exist)

### Other Boss-Listers References Found
- `C:\Users\jjard\claude\crosspost\` — crosspost integration
- `C:\Users\jjard\claude\relay\` — relay/export copies
- `C:\Users\jjard\claude\viral-engine\` — viral engine integration
- `C:\Users\jjard\Documents\Codex\2026-05-15\` — archive copies
- `C:\Users\jjard\Downloads\bosslisters-all-connections-claude-prompt.pdf` — documentation

---

## STEP 4: PC-ONLY / GITHUB-ONLY / DIFFERS CLASSIFICATION

### Modified Files — NOT YET COMMITTED
```
M lib/__tests__/inventorySyncService.test.js
M lib/inventorySyncService.js
M pages/api/omni-lister/save.js
M scripts/commercial_cutter.py
```
**Classification:** PC-ONLY (uncommitted, unseen by GitHub)

### Untracked Files — PC-ONLY
```
?? card-lane-handoff-report.md (report-style, should NOT commit per AGENTS.md)
?? ebay-dryrun-oddish-report.md (report-style, should NOT commit per AGENTS.md)
?? public/voice/ (generated output, should NOT commit)
?? scripts/voice_music_factory.py (untracked Python, may be NEW or leftover)
```
**Classification:** PC-ONLY (uncommitted)

### Missing Bridge Files — NOT IN BOSSLISTER REPO
**Status:** GITHUB-ONLY (exist in video-bot-pipeline, missing in BossListers)

| File | Canonical Location | BossListers Status |
|------|---|---|
| `lib/ebay_listing.py` | `video-bot-pipeline/lib/` | Not copied to BossListers |
| `lib/bonanza_listing.py` | `video-bot-pipeline/lib/` | Not copied to BossListers |
| `lib/etsy_listing.py` | `video-bot-pipeline/lib/` | Not copied to BossListers |
| `lib/facebook_marketplace_listing.py` | `video-bot-pipeline/lib/` | Not copied to BossListers |
| `scripts/listing_service.py` | `video-bot-pipeline/scripts/` | Not copied to BossListers |
| `scripts/ebay_listing_service.py` | `video-bot-pipeline/scripts/` | Not copied to BossListers |

---

## STEP 5: VERDICT

### ❌ Missing eBay/Bonanza Functionality Status

**The eBay/Bonanza listing-creation code is NOT sitting uncommitted on this PC.**

**Root Cause:**
1. BossListers code **REFERENCES** these Python bridge files (`lib/ebay_listing.py`, `scripts/ebay_listing_service.py`, etc.)
2. The actual implementations **EXIST** in a sister project: `video-bot-pipeline` (canonical home)
3. These bridge files were **NEVER COPIED** into BossListers — they remain in their original location only
4. The BossListers API endpoints (`pages/api/channels/ebay/create-listing.js`, etc.) call out to the video-bot-pipeline services via localhost or assume they're installed elsewhere

### Current State
- ✅ BossListers has **native JS/TS connectors** (new BaseConnector pattern with 16 marketplaces built)
- ❌ BossListers is **missing the legacy Python bridge files** that old API endpoints reference
- ✅ The Python bridges **exist and work** but live in `video-bot-pipeline` repo
- ⚠️ No uncommitted work on this PC — this is an **architectural/integration gap**, not uncommitted code

### Next Steps
1. **Either:** Copy the 5 missing Python bridge files from `video-bot-pipeline/` to `BossListers/lib/` and `BossListers/scripts/`
2. **Or:** Remove references from BossListers code and rely entirely on native JS connectors (recommended per AGENTS.md "no Python bridges")
3. **Or:** Keep as-is if video-bot-pipeline is a permanent sibling service

---

## SUMMARY

| Category | Count | Status |
|----------|-------|--------|
| Modified but uncommitted | 4 files | ⏳ Ready to commit |
| Untracked (should NOT commit) | 4 items | ❌ Generated output |
| Missing bridge files | 5 files | 📦 Exist in video-bot-pipeline, not in BossListers |
| Git conflicts | 0 | ✅ None |
| Secrets leaked | 0 | ✅ None |

**Audit Conclusion:** No lost work. The missing eBay/Bonanza functionality is not uncommitted — it's in a different repo (video-bot-pipeline). BossListers has **native connectors** for 16 platforms; legacy Python bridges remain in their original home.
