# BossListers Card Factory — local staging service

This is an isolated desktop-side staging service. It does **not** publish products, call Supabase, connect to eBay, or modify the BossListers cloud inventory.

## Requirements

- Node.js 22.13+ (uses the built-in `node:sqlite` module; no native addon or external database package).
- A private, persistent local disk.
- A random bearer token of at least 32 characters.

## Start locally

PowerShell:

```powershell
$env:CARD_FACTORY_LOCAL_TOKEN = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:CARD_FACTORY_LOCAL_WORKSPACE_ID = "my-private-workspace"
$env:CARD_FACTORY_LOCAL_DATA_DIR = "$env:LOCALAPPDATA\BossListers\CardFactory"
node scripts/card-factory-local/server.mjs
```

The service binds to `127.0.0.1:8787` by default. Keep it on loopback unless a trusted HTTPS reverse proxy is configured. Non-loopback binding requires the explicit `CARD_FACTORY_ALLOW_NON_LOOPBACK=true` opt-in. Do not expose port 8787 directly to the internet.

## API

- `GET /health`: minimal liveness response; no sensitive details.
- `GET /api/cards`: authenticated list of local staged cards.
- `POST /api/cards`: authenticated staging operation.

The POST body requires `userConfirmed: true`, an `idempotencyKey`, a title, identification object, and a front image. Back image is optional. Images are limited to 4 MB each and JPEG/PNG/WebP bytes are checked against their declared media type. Exact duplicate front/back pairs are rejected; retries with the same idempotency key return the original staged card.

All records are tied to the server-configured workspace ID. The client cannot choose another workspace. Photos are written outside the public web root with restrictive file permissions. SQLite uses WAL mode and stores paths, not public URLs.

## Phone access / security boundary

For iPhone access, put this service behind a trusted HTTPS reverse proxy or private tunnel. The proxy must authenticate the user with the existing BossListers session and inject the local bearer token server-side. **Never put `CARD_FACTORY_LOCAL_TOKEN` in browser JavaScript, a mobile app bundle, a URL, or a client-visible environment variable.** Do not enable non-loopback binding until that proxy and its access policy are configured and verified. Avoid permissive CORS; the service intentionally does not enable it.

The current BossListers Cloudflare Pages deployment cannot directly reach a private desktop process. A secure same-origin authenticated bridge is a separate integration milestone and is not included here.

## Deliberate limitations

- Local staging only; there is no cloud sync, inventory publish, export, pricing lookup, AI call, or platform API call.
- No delete endpoint; this first slice avoids destructive operations.
- No public image-serving endpoint; image paths remain private.
- A `needs_review` status is preserved when supplied by the caller. User confirmation is required before staging, but confirmation does not magically upgrade uncertain AI identification.
- Backups of the data directory are the operator's responsibility. Keep it on an encrypted disk and define a retention policy before production use.

This is a development slice, not a production-ready remote service. Run the automated tests and complete the HTTPS phone-access review before connecting it to the scanner UI.
