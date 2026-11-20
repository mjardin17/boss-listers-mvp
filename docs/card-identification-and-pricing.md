# Card identification and valuation API

## Scanner identification

`POST /api/identify-card` requires an authenticated BossListers tenant session and a `multipart/form-data` request containing `front` and optional `back` image files.

- JPEG, PNG, and WebP only; file signatures are checked, not just browser MIME labels.
- 4 MB maximum per image and 9 MB maximum combined request.
- Gemini identification uses evidence-weighted fields; the model's self-reported confidence is not trusted.
- Ambiguous identities remain `needs_review`; unknown identities are not priced.
- Provider errors are sanitized before returning them to the scanner.

## PriceCharting restrictions

PriceCharting lookup is **off by default**. To enable it for one internal-use tenant, configure all three server-side values:

- `PRICECHARTING_API_TOKEN`
- `PRICECHARTING_API_ENABLED=true`
- `PRICECHARTING_ALLOWED_TENANT_ID=<the authorized tenant UUID>`

For a multi-tenant commercial application, do not enable PriceCharting data for other tenants unless PriceCharting has granted written commercial permission. Only then may the owner set `PRICECHARTING_COMMERCIAL_LICENSE_CONFIRMED=true`. The application must not treat this flag as a substitute for obtaining that written agreement.

PriceCharting's published terms say its API and CSV data are for internal use; sharing the data with third parties or making it available in an application/service used by others requires a commercial license and express written permission. Its API documentation also limits calls to one per second and warns that persistent excess calls can lead to access revocation. See https://www.pricecharting.com/api-documentation.

This implementation adds a five-minute per-process result cache and a 1.1-second per-process request queue. This protects a single Node process, such as the desktop companion. It is **not a distributed rate limiter**: do not enable the provider on a horizontally scaled/serverless deployment until a shared durable rate limiter and cache are implemented.

PriceCharting provides current price-guide estimates, not historical sales data. The UI must label these as provider estimates, not verified sold comps. Unsupported grades, missing price fields, ambiguous identity matches, and conflicting matched prices return an insufficient result rather than a guessed value.
