# Syncr-inspired stock alerts in BossListers

This feature ports the useful low-stock workflow from the supplied Syncr project into BossListers without importing Syncr's Base44 database, authentication, or product model.

## Included

- Tenant-specific low-stock threshold (default: 2 units).
- Database-triggered alert creation whenever a tracked product is inserted or its title, SKU, quantity, status, or tracking flag changes.
- One open alert per product per low-stock cycle; repeated quantity changes update the existing alert instead of creating duplicates.
- Automatic transition to Restocked when inventory rises above the tenant threshold.
- Inbox, Restocked, and Archived folders with read/unread, mark-all-read, archive, restore, and archive-read actions.
- Optional email delivery through Resend, disabled by default and available only when server-side `RESEND_API_KEY` and `STOCK_ALERT_FROM_EMAIL` are configured.
- Email claims are atomic in Postgres to avoid concurrent page loads sending the same notification twice.
- Digital ebook SKUs already listed in `config/inventory-sync.json` are excluded from physical stock alerts.

## Database deployment

Apply `supabase/migrations/0028_stock_alerts.sql` to the BossListers Supabase project before deploying the application code. It adds tenant-scoped settings and alert tables, a product stock-tracking flag, trigger-based reconciliation, and an email-claim RPC.

The migration backfills existing products so items already below the default threshold appear in the alert inbox. It does not publish, end, or otherwise modify marketplace listings.

## Optional email configuration

Set these as server-side secrets only:

- `RESEND_API_KEY`
- `STOCK_ALERT_FROM_EMAIL` (a sender address verified in Resend)

Email alerts are opt-in per tenant. The settings UI will keep the email checkbox disabled until both values are present. Do not put these values in browser-visible environment variables or commit them to Git.

## API

- `GET /api/stock-alerts` — tenant's latest 100 alerts.
- `POST /api/stock-alerts` — mark read/unread, mark all read, archive, restore, archive read alerts, or deliver pending email alerts.
- `GET /api/stock-alert-settings` — threshold and email capability.
- `PUT /api/stock-alert-settings` — save threshold/email preference and immediately reconcile the tenant's inventory.

All routes derive the tenant from the caller's Supabase session; no client-supplied tenant ID is accepted.

## Validation

Run `node --test scripts/test-stock-alerts.js` and the existing repository test suite. The PR must also receive a Next.js production build and a migration review before merge.

## Deliberately not copied from Syncr

Syncr's sale mutation decrements quantity by one and clears a platform-name array when stock reaches zero. BossListers keeps its existing order/sale and marketplace reconciliation systems instead. Clearing an array is not equivalent to ending a real marketplace listing.
