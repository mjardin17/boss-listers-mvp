# Local card-storage factory

This is a local staging repository inside BossListers, not a new web app, cloud inventory,
recognition service, or marketplace publisher. It stores cards in SQLite on the computer
where you run it and exports rows for the existing BossListers `public.products` table.
It never writes to Supabase. No paid API is added or called.

## Prerequisites and install

- Python **3.11+** (standard-library SQLite; no pip packages).
- Node **20+**, and this repository's existing dependencies: `npm ci`.
- Run commands from the repository root on your own computer.
- Use branch `feat/card-factory-local`, not `main`.

```sh
python -m scripts.card_factory --help
python -m scripts.card_factory init
```

On Windows, use `py -3.11` instead of `python` if needed. The default database is
`~/BossListers/card-factory.sqlite3`. Override it using `BOSS_CARD_FACTORY_DB` or put
`--db /absolute/path/factory.sqlite3` **before** the subcommand. No environment files
are loaded. Never put credentials in JSON input, flags, source code, or exports.

## Storage and supported types

Tables: `cards`, `collections`, `physical_locations`, `price_history`.

Supported `card_type` values: `pokemon`, `baseball`, `basketball`, `football`, `hockey`,
`soccer`, `racing`. Divisions are exactly **Pokémon** and **Sports Cards**.

Each card has a stable UUID, source key, absolute front/back paths, content fingerprint,
card type, set/collection, number, variant, condition, grade, identity/evidence, location,
on-hand/listed counts, seller price, original identity, correction history and price history.
Only image paths and hashes are stored; images are **not copied** into SQLite or uploaded.
Keep the original image files and back them up with the database. Moving images requires
care; the CLI checks image existence and pair content fingerprints when exporting.

The canonical card field shape and evidence scorer are reused from `lib/cardFields.js`
and `lib/cardIdentification.js`. Imported identities are validated with Zod. No vision
request is made. This task accepts existing identification results; it does not capture
images or run recognition. Missing or ambiguous identity remains `needs-review`.

A collection is assigned only for a confirmed, sufficiently complete identity with front
and back text evidence and a compatible card type. Likely, conflicting, incomplete and
unknown identities are not silently promoted. Set, year, manufacturer, edition and
language remain distinct collection keys. This is evidence-based assignment, not an
external catalog guarantee. Null edition/language values remain unknown.

## Add locations and cards

```sh
python -m scripts.card_factory location-add --name "Box A" --kind box
# Use the returned location UUID as the parent:
python -m scripts.card_factory location-add --name "Row 1" --kind row --parent-id YOUR_BOX_UUID
python -m scripts.card_factory locations
```

Prepare a card JSON file using actual local paths and an existing identification result.
Minimal unresolved input (do not invent identity to fill blanks):

```json
{
  "source_key": "my-scan-0001",
  "front_image_path": "/absolute/path/front.jpg",
  "back_image_path": "/absolute/path/back.jpg",
  "card_type": "pokemon",
  "identification": {"status": "unknown", "fields": {}},
  "condition": null,
  "location_id": null,
  "on_hand": 1,
  "listed": 0,
  "seller_price": null,
  "evidence_sources": [{"kind": "local-photo-pair", "reference": "my-scan-0001"}]
}
```

Replace `identification` with the existing module's result when available. Grade, variant,
set and all other card-specific attributes come from its canonical `fields` object.

```sh
python -m scripts.card_factory add --input /absolute/path/card.json
python -m scripts.card_factory list
python -m scripts.card_factory collections
python -m scripts.card_factory stock --id CARD_UUID --on-hand 3 --listed 1 --location-id LOCATION_UUID
python -m scripts.card_factory review --id CARD_UUID --input corrected-identification.json --note "Checked both sides"
python -m scripts.card_factory seller-price --id CARD_UUID --amount 12.50
```

Repeated identical `source_key` imports return the same record without increasing stock.
A changed retry is rejected. The same image pair under a different key is flagged as a
potential duplicate, including swapped front/back order. Distinct physical copies with
their own photos can coexist. Counts obey `0 <= listed <= on_hand`; listing does not
remove an item from physical ownership. This does not create or reconcile marketplace
listings. Use `seller-price --id CARD_UUID --clear` to clear an asking price.

## Pricing: existing code, separate evidence

```sh
# Offline by default, records "unavailable" without querying a provider:
python -m scripts.card_factory price --id CARD_UUID
# Explicitly opt in only when you want a request to the existing eBay adapter:
python -m scripts.card_factory price --id CARD_UUID --allow-network
```

The opt-in path reads `EBAY_APP_TOKEN` only from the environment and reuses
`lib/cardPricingEbay.js`. It uses the US marketplace and ignores non-USD observations.
No new token provisioning or provider subscription is performed. Tests use mocks;
live provider access is not established by passing tests.

Every available estimate is marked **unverified**, specifically an active-listing asking
price rather than a completed sale. Errors/missing evidence produce null, not zero.
Each observation retains the identity snapshot, evidence, timestamp, provider and confidence.
Pricing never changes the seller price. `lib/cardPricing.js` was inspected but its paid
PriceCharting path is not enabled by this tool.

## Export to the existing inventory format

```sh
python -m scripts.card_factory check-schema
python -m scripts.card_factory export --tenant-id YOUR_REAL_TENANT_UUID --output /absolute/path/exports
python -m scripts.card_factory validate-feed --input /absolute/path/exports/export-UUID/products.json
```

Every export creates a new directory containing:

1. **products.json** — JSON array containing only existing `public.products` columns.
2. **metadata.json** — full local card details, both image paths, collections, physical
   locations, price history, counts, correction history and pending reasons. This is not
   a Supabase row. It includes a SHA-256 checksum of products.json.
3. **schema-check.json** — read-only checks against the repository migration declarations.

Export rows have stable `CF-<local-card-UUID>` SKUs, your explicit `tenant_id`, a title,
`price` from your seller-set asking price, `quantity` equal to physical `on_hand`, nullable
`description`/`condition`, `image_url: null`, `status: "draft"`, `source: "manual"`,
`published: false`. Local paths are not falsely presented as public image URLs. Listing
counts and extra fields remain in the metadata sidecar because products lacks those columns.

Unresolved cards, missing images, and cards without seller prices remain in metadata with
pending reasons and are **withheld** from products.json. The products schema requires a
numeric price, so null cannot safely be exported and a market estimate is not a seller's
asking price. An intentionally seller-set zero is schema-valid but never substituted
for an unknown price.

**No importer is run or added.** This is an export feed, not a claim that cloud inventory
has changed. A later authorized import must preserve the `(tenant_id, sku)` identity,
verify tenant ownership and existing rows, avoid overwriting eBay-owned inventory, and
handle image uploads separately. Do not POST this JSON to `/api/inventory`: that endpoint
accepts a different request shape and currently sets `published: true`, `status: "active"`.
Do not import metadata.json as product columns or silently discard needed metadata.

## Read-only live schema check (optional)

```sh
python -m scripts.card_factory check-schema --live
```

This performs **GET only** on Supabase's PostgREST OpenAPI metadata, not SQL or RPC. It
requires `SUPABASE_URL` and either `SUPABASE_SERVICE_ROLE_KEY`, or `SUPABASE_ANON_KEY`
with an authorized `SUPABASE_SCHEMA_TOKEN`. Prefer the least-privileged credential that
can see the schema. Never paste credential values into chat or CLI flags. No values are
printed, error bodies are withheld, and credential-bearing redirects are refused.

Without credentials, only repository schema compatibility is established. OpenAPI checks
column visibility/types, not tenant membership, uniqueness, triggers, permissions, or
whether all migrations were applied. No claim of live schema validation is made by an
offline export. `wrangler.toml` is not a configuration source for this tool.

## Source evidence / target choice

- `pages/api/inventory.js`: existing tenant inventory endpoint.
- `lib/supabaseInventory.js`: product writer and inventory reader, scoped by tenant.
- `supabase/migrations/0001_init_inventory.sql`: `products` base fields/constraints.
- `supabase/migrations/0003_commerce_hardening.sql`: published/stock bookkeeping.
- `supabase/migrations/0007_multi_tenant.sql`: tenant ownership and RLS.
- `supabase/migrations/0021_products_tenant_sku_unique.sql`: per-tenant SKU key.
- `supabase/schema.sql`: separate `inventory_items` JSON-listing store; not this endpoint's target.
- `supabase/migrations/202605300001_inventory_core.sql`: separate `inventory` workflow;
  not silently merged into products by this task.
- `lib/storage/localDatabase.ts`, `lib/storage/persistenceAdapter.ts`: existing JSON-backed
  execution collections, not a SQLite card store; left unchanged.
- `lib/openaiVision.js`, `pages/capture.js`: existing capture/vision flow, left unchanged.

## Verification and backup

```sh
npm test
node --test tests/cardIdentification.test.js tests/cardPricing.test.js tests/cardPricingEbay.test.js tests/cardFactoryAdapters.test.js
python -m unittest discover -s tests/card_factory -p 'test_*.py'
npm run typecheck
npm run build
```

Tests use temporary SQLite files, synthetic card/image fixtures and mocked provider data;
they do not consume paid API credits or write production data. Back up the closed SQLite
file, referenced photos, and export directories. SQLite and exports contain private local
paths and inventory information; use a private folder and your OS disk encryption.
