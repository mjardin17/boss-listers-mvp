# BossListers integrated card scanner

This extends the existing `/card-scan` page and the recovered `feat/card-factory-local`
SQLite repository. It is not a new application or a second master inventory.

## Architecture and operating boundary

```
iPhone Safari / installed BossListers PWA
  -> existing Supabase-authenticated Next.js API
  -> tenant-specific private capture files + existing local SQLite store
  -> explicit, unpublished products feed preview
  -X-> production inventory writes (disabled)
```

**The desktop must run the existing BossListers Node application with Python 3.11+ and
persistent local storage.** An iPhone cannot access the desktop's SQLite file directly.
The browser speaks same-origin HTTPS to the existing application; SQLite stays on the
host running Node. This is not supported on a filesystem-free Cloudflare Worker, an
edge runtime, or an ephemeral serverless filesystem. No deployment has been made.

Use an approved HTTPS origin reachable by the iPhone. Plain HTTP to a desktop LAN IP
is not a reliable camera/PWA configuration. Configuring a public tunnel, hosting, TLS,
firewall exposure, or production deployment is a separate approval step. Do not expose
the synthetic test fixture or a development server to the public as a production service.

The existing auth helpers validate Supabase access tokens and resolve tenant membership.
Production middleware also has an existing Basic Auth gate. This implementation does
not bypass either. Deployment of that gate plus Safari home-screen installation still
requires real-device acceptance; passing a dev-server test does not prove it.

## Local setup (existing checkout)

1. Check out the verified feature branch with a clean working tree; never reset someone
   else's changes. Install existing dependencies with `npm ci`.
2. Install Python 3.11+ and Node 20+.
3. Provide the existing BossListers authentication configuration through environment
   variables. Do not use `wrangler.toml` as a source, and do not paste secrets in chat.
4. Set these **non-secret** local-staging configuration values in your environment:

| Variable | Meaning |
|---|---|
| `CARD_FACTORY_LOCAL_ENABLED=1` | Explicitly enable the local staging routes |
| `BOSS_CARD_FACTORY_ROOT` | Absolute path to a private local data directory; required |
| `CARD_FACTORY_PYTHON` | Optional Python executable, defaults to `python` |

The service creates `<root>/<validated-tenant-UUID>/cards.sqlite3`, private captures and
local exports. Existing standalone CLI databases are not silently imported or reassigned
to a tenant. If an existing CLI database contains real cards, back it up and confirm its
tenant before any separate relocation/import operation. Do not point multiple tenants
at the same database file.

5. Run BossListers normally. For desktop development only, `npm run dev` serves its
   existing port 3001; arrange approved HTTPS before connecting an iPhone.
6. In Safari visit `/card-scan`, sign in normally, then Share → Add to Home Screen.
   The existing manifest identity is preserved; its launch URL now opens the scanner.
   `/capture` and the existing dashboard remain linked and unchanged.

## Capture, review and organization

- Explicit rear-camera request with `facingMode: environment`, inline video and a
  native camera-file/upload fallback. Permission denial leaves upload usable.
- Capture both sides; retake either side. A retake invalidates the prior recognition
  and save identifiers rather than reusing stale evidence.
- JPEG preparation uses the existing `browser-image-compression` package, a maximum
  2400 px dimension and approximately 4 MB per side. This preserves useful resolution
  but is **not evidence that small card text remains readable on every device**. Retake
  glare/blur or use better source photos. Unsupported HEIC produces a clear error.
- The server bounds the complete multipart request, requires both raster sides, checks
  byte signatures, rejects SVG, and stores private random-ID paths outside `public`.
- The browser persists only a transient pending draft, scoped to a previously validated
  tenant/user session. Image bytes, not Blob handles, are stored for WebKit reload safety.
  Camera image URLs are revoked and media tracks are stopped on close/unmount/background.
- Browser drafts are not encrypted backups. Keep a private browser profile. Sign out from
  the scanner to clear the pending draft. An expired/changed session may require online
  authentication before its draft can be recovered. First-time offline pairing is not supported.
- Statuses shown: **Confirmed**, **Needs review**, **Unidentified**. An AI `likely` match
  is not shown as confirmed. Human verification is explicit and recorded separately from
  the AI's evidence-completeness score. It never changes the original model confidence.
- Every canonical card field is editable, including card/set name/number, player,
  manufacturer, year, language, edition/variant, rookie flags, condition observations,
  grading details and transcribed text. Saved staged cards can be reopened and corrected.
- Confirmed user review requires the player/character, set, number, year, manufacturer
  and compatible category. Photos and every original/corrected identity remain available.
- Initial storage types are Pokémon, baseball, basketball, football, hockey, soccer and
  racing. Other trading-card types are not yet accepted into the SQLite schema; do not
  label an unsupported type as a supported one merely to save it.
- Collections are deduplicated by category, set, year, manufacturer, edition and language;
  individual card fields retain player/game information. A separate audited manual
  reassignment changes the collection without changing the printed set identity.
- Physical locations support boxes, binders, binder pages, rows, containers and shelves
  with parents. Binder pages use an additive display-kind annotation, avoiding replacement
  of the existing SQLite table/check constraint.
- Counts obey `0 <= listed <= on_hand`; available is `on_hand - listed`. These are local
  counts, not proof that a marketplace listing exists. No marketplace automation runs.

## Recognition and spending controls

The existing `lib/cardIdentification.js` Gemini adapter is reused. Its result is validated
through the existing Card Factory Zod boundary. The new service does not invoke it merely
because a key exists. Calls require **all** of:

- separate approval for paid API usage;
- `CARD_FACTORY_ALLOW_PAID_AI=approved` in the server environment;
- `GEMINI_API_KEY` in the server environment;
- the authenticated tenant matching `PLATFORM_OWNER_TENANT_ID`.

`GEMINI_CARD_MODEL` optionally selects the model. The inherited default/model availability
and actual recognition accuracy have **not** been validated with live calls. No paid calls
were made during implementation/testing. With the gate off, capture and manual staging
work and identification is honestly unavailable. Unknown/malformed/provider-failure output
never becomes a guessed identity. Repeating a capture request reuses its stored result and
does not bill another recognition call. A separate recognition-rerun/versioning feature is
not implemented; the UI calls this retrying the capture request, not a new AI opinion.

Identification confidence is an evidence-completeness score, not a calibrated probability.
Variant, condition and valuation confidence remain unavailable unless evidence exists;
no made-up confidence percentages or professional grades are substituted.

## Value evidence

The existing eBay adapter is reused. A request must be initiated by the user and additionally
requires `CARD_FACTORY_ALLOW_EBAY=approved`, the owner tenant, and `EBAY_APP_TOKEN` from the
environment. No token provisioning or paid provider is added. PriceCharting remains off.

All returned eBay values are **unverified active-listing asking-price estimates**, never
completed sales or verified comps. The records retain provider, retrieval time, currency,
identity snapshot, observed condition, confidence, matching evidence and methodology.
A user-verified identity may be queried without relabeling an uncertain model result as
confirmed. Seller asking prices remain distinct. Completed-sale/verified-comparable feeds
are not implemented by this adapter. Missing evidence produces unavailable/null.

## Inventory integration and explicit sync block

The existing `/api/inventory` route calls `publishToInventory`, which writes `public.products`
with `status: active` and `published: true`. The scanner **does not call that route**.

“Prepare BossListers feed” uses the recovered exporter and schema checker to produce only
manual, unpublished draft product rows. SKU is stable (`CF-<local UUID>`); the future import
key is `(tenant_id, sku)`. Tenant identity comes from the validated session, never a body
parameter. Required price is a user-set asking price. Unidentified records, missing/changed
photos and missing seller prices remain pending. Local image paths are not invented as
public URLs. Downloaded metadata retains the rich card data, but no private server paths.

`POST /api/card-factory/sync` always rejects with 409. There is no production writer hidden
behind the button. No migration or cloud data write was performed. The live deployed schema
is unverified because authorized credentials were unavailable.

Before a live writer can be implemented/enabled:

1. Verify the actual deployed product columns, `(tenant_id, sku)` uniqueness and RLS with
   authorized read-only credentials; repository migrations alone are not proof.
2. Approve a non-destructive metadata association. A possible design is a one-to-one
   `product_card_details` companion keyed to the existing product UUID and tenant, holding
   card/evidence/location references—not a second inventory quantity authority. Its exact
   schema and constraints must be reviewed against the actual deployment first.
3. Approve private image upload/storage policies, tenant-safe metadata access and backups.
4. Extend the existing inventory service with an explicitly unpublished draft path that
   cannot overwrite eBay-owned or other-tenant products. Do not reuse the active publisher.
5. Add transactional/import receipts, conflict handling and retry tests against an approved
   non-production Supabase instance, then separately approve production writes.

Until then, this is a working local scanner/staging/export feature, **not completed cloud sync**.

## Learning Core boundary (no connection)

`learning_lessons()` emits only explicitly verified corrections with stable lesson IDs,
original/corrected identification, image fingerprint evidence, actor/time, model, original
confidence, verification outcome and `test_result: null`. Promotion is always
`pending_regression`. The UI can download the lessons, but does not send them anywhere.
Unverified corrections are excluded. A future consumer must validate evidence, attach
regression outcomes, and explicitly approve promotion. Existing inventory is never silently
rewritten. No AI Orchestra repository or service was accessed or modified in this phase.

## Tests and reproducibility

```sh
npm test
npm run test:card-factory
npm run test:card-scanner
npm run lint
npm run typecheck
npm run build
npx playwright install --with-deps chromium webkit
npm run test:e2e:card-scanner
```

The scanner browser suite manages a loopback, read-only Supabase-shaped **test auth fixture**
and a dedicated local Next dev server, with AI/pricing gates forcibly disabled. Ports 3001
and 3112 must be free; it refuses to reuse unknown servers. It exercises the existing auth
helper over mocked identity/membership responses and real local SQLite/HTTP routes. This
is not verification against production Supabase. Test inventory is under ignored
`data/card-scanner-e2e`; no real inventory is loaded.

Browser targets: Chromium with iPhone viewport/touch settings and Playwright WebKit with
iPhone 13 settings. WebKit's synthetic canvas-stream camera test is explicitly skipped
because that Linux runtime rejects playback; WebKit upload, denial/fallback, review,
persistence, retries and tenant API tests run. Chromium's synthetic stream test checks
rear-camera constraints, frame capture and stopped tracks. Neither is physical iPhone
camera or installed home-screen testing. Actual Safari/iOS permission behavior, focus,
image quality, HEIC conversion, HTTPS/Basic Auth interaction and installation remain
real-device acceptance tasks.

ESLint is the only added development dependency. Lint is scoped to the scanner code and
new tests; this repository had no lint script/config beforehand. Existing framework build
warnings (React 18 with Next 16, middleware convention and legacy filesystem tracing) are
not silently described as resolved by this feature.
