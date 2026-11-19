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

## Desktop launch and phone access

On Windows, from the repository root, run:

```powershell
.\scripts\card-factory-local\start.ps1 -WorkspaceId "<your BossListers tenant UUID>"
```

The launcher generates a fresh random bearer token in process memory, starts the local SQLite service on loopback, builds BossListers, and starts its Next.js production server on port 3001. It does not print or persist the token. The workspace ID must match the authenticated user's BossListers tenant ID.

The scanner now has a separate **Stage locally** action after the user confirms the identified card. It calls `/api/card-factory-local`; that server-side bridge validates the existing BossListers session, checks the tenant ID against `CARD_FACTORY_LOCAL_WORKSPACE_ID`, and forwards the request to loopback while injecting the token server-side. The token is never sent to the browser. The existing **Save to inventory** action remains separate and unchanged.

For iPhone access, use a trusted HTTPS tunnel or reverse proxy to the desktop Next.js production server on port 3001, with an access policy enabled. Do not expose the Next.js development server. Do not expose port 8787 or create a public route directly to the local service. The local service remains bound to loopback.

The hosted Cloudflare Pages deployment must keep `CARD_FACTORY_LOCAL_BRIDGE_ENABLED` unset/false. Cloudflare cannot reach the private desktop process; the bridge works only when the Next.js server itself is running on the desktop. Do not enable the bridge in the hosted environment. Avoid permissive CORS; the local service intentionally does not enable it.

The card scanner's identification endpoint is a separate dependency: the current `main` branch does not yet contain `/api/identify-card`; the separate recovery PR for that endpoint must be reviewed and integrated before the full scan → identify → stage flow works from a clean `main` checkout.

## Deliberate limitations

- Local staging only; there is no cloud sync, inventory publish, export, pricing lookup, AI call, or platform API call.
- No delete endpoint; this first slice avoids destructive operations.
- No public image-serving endpoint; image paths remain private.
- A `needs_review` status is preserved when supplied by the caller. User confirmation is required before staging, but confirmation does not magically upgrade uncertain AI identification.
- Backups of the data directory are the operator's responsibility. Keep it on an encrypted disk and define a retention policy before production use.

This is a development slice, not a production-ready remote service. Run the automated tests and complete the HTTPS phone-access review before connecting it to the scanner UI.
