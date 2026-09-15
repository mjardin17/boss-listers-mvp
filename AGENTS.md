# BossListers — rules for AI assistants working in this repo

## Canonical location
The ONLY working copy of this project is this repo root. A stale duplicate
once lived under Downloads/ — it was removed. Never create or edit project
files outside this repo root, and never work in any other folder on this
machine that looks like this project.

## Before building anything
1. READ THE EXISTING CODE FIRST. Search the repo for the feature before
   writing a single line. If a commit already implements it, extend it —
   never rebuild it from scratch.
2. One system per job:
   - social posting: lib/socialMediaPosters.js (plus buildCaption from
     lib/channels/socialMediaConnector.js). The pages/post.js flow uses
     lib/multiPlatformPoster.js — do not add a fourth posting system.
   - inventory sync: lib/inventorySyncService.js, lib/supabaseInventory.js,
     lib/ebayInventoryFetcher.js. Do not add another inventory engine
     without removing one.
3. Do NOT commit generated output: no graphify-out/, _pages-backup/,
   *.patch files, or report-style .md files describing the build.
4. Verify against THIS repo checkout, not any other directory on disk.
5. Ask before deleting anything that is imported anywhere.
