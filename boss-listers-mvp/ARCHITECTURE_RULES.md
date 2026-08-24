# Boss Listers Architecture Rules

## Core Rule
Boss Listers must stay organized. Do not add random files or duplicate systems.

## Forbidden
- No OpenAI calls inside UI components
- No direct localStorage usage inside UI components
- No duplicated schemas or types
- No business logic inside page.tsx
- No scan/session metric calculations inside page shells when a domain helper can own them
- No giant utility files
- No Stripe SDK, auth SDK, or billing state inside UI components
- No marketplace automation yet
- No scraper systems yet
- No Redis/queue systems yet

## Required
- All AI outputs must be validated with Zod
- All persistence must go through repositories
- API routes should only coordinate work
- Components should mostly display data
- Shared types must come from one source of truth
- Existing dashboard response keys must be preserved
- Monetization prep must use feature gates/config first, not payment code
- Scan history must be deduped in repositories before persistence

## Integration Boundaries
- Supabase auth/sync belongs in app/saas repositories and adapters
- Stripe billing belongs in a future billing service plus API route boundary
- Queue/Redis/background work belongs behind API coordination, not UI components
- Marketplace APIs belong in market adapter services only
- Barcode parsing belongs in barcode services and browser camera orchestration only
- Session metrics belong in app/saas session/domain helpers
- Result trust warnings belong in trust/validation services, not ad hoc component checks

## AI Agent Rules
- Do not redesign stable UI
- Do not break Scan Another
- Do not rename API response keys
- Extend existing domains before creating new ones
- Run build verification after changes
