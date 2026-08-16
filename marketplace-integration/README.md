# Marketplace Integration

Node/JS scaffold for connecting Boss Listers to marketplace listing APIs.
eBay and Etsy are the only two platforms with open, connectable public APIs;
Whatnot, Depop, Mercari, and Facebook Marketplace are gated (waitlist or
partner-only) and their connectors are documented stubs, not working code.

## Canonical eBay client: `lib/ebay_listing.py`

`src/connectors/ebay.js` in this scaffold is **not** the source of truth for
eBay listing creation. That's `lib/ebay_listing.py` in the
**video-bot-pipeline** repo — it has 24 passing tests (including regressions
for Infinity/NaN prices, banker's-rounding underpricing, and missing images),
defaults to `dry_run=True` before any live call, and raises a named error at
whichever of the three API steps fails instead of returning `{ok:false}`
silently.

`ebay.js` exists only because Boss Listers (Next.js/Node) can't import a
Python module directly. Keep it a **thin, faithful mirror** of the 3-call
flow — do not add independent price/image/title validation here. Two clients
with diverging validation logic is worse than one tested client plus a
minimal mirror; bugs found in one won't automatically get fixed in the other.

If Boss Listers ever needs to actually call the Python client at runtime
(rather than just mirroring its shape), the answer is a small internal
service the Next.js API routes call over HTTP — not a rewrite of the
validation logic in JS.

## Status (verified 2026-08-16, not the original delivery claim)

The original delivery summary for this scaffold claimed 21 files including
`src/index.js`, `src/connectors/facebook.js`, `scripts/oauth-token.js`, and
5 docs. Only 15 of those actually reached GitHub — `src/index.js` (the entry
point the summary's own "verification" section claims to have run),
`facebook.js`, `oauth-token.js`, and 3 of 5 docs are not in this repo.
Treat anything not listed under `src/`, `scripts/`, `docs/` in this directory
as not delivered, regardless of what any summary document says.

`ebay.js` also crashed on its very first call regardless of whether
credentials were set — a `TypeError` from a config shape that never existed
anywhere else in this codebase. That's fixed now (see git history), but it's
a reminder: nothing in this scaffold should be treated as verified until it
has actually been run, not just written.
