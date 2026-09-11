-- Migration 0015: Add webhook_events table for tracking eBay order events
-- Tracks all webhook events received from eBay for audit and debugging

create table if not exists public.webhook_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  event_type text not null check (event_type in ('ITEM_SOLD', 'INVENTORY_QUANTITY_CHANGED', 'LISTING_STATUS_CHANGED', 'OTHER')),
  sku text,
  quantity_change integer,
  new_quantity integer,
  old_quantity integer,
  payload jsonb not null default '{}',
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Index for finding events by tenant and time (useful for audits and replays)
create index if not exists webhook_events_tenant_time_idx on public.webhook_events (tenant_id, processed_at desc);

-- Index for finding events by SKU (useful for debugging specific products)
create index if not exists webhook_events_sku_idx on public.webhook_events (sku);

-- Index for finding events by type (useful for filtering ITEM_SOLD vs QUANTITY_CHANGED)
create index if not exists webhook_events_type_idx on public.webhook_events (event_type, processed_at desc);

-- Add column to sync_logs to track webhook event count
alter table public.sync_logs
  add column if not exists webhook_events_processed integer not null default 0;

-- Allow service role to write webhook events (no public access)
grant insert on public.webhook_events to service_role;
grant select on public.webhook_events to service_role;

-- RLS: Only service_role and authenticated users in the tenant can read
alter table public.webhook_events enable row level security;

drop policy if exists "webhook_events_tenant_read" on public.webhook_events;
create policy "webhook_events_tenant_read"
  on public.webhook_events for select
  using (tenant_id in (select public.my_tenant_ids()));

drop policy if exists "webhook_events_service_write" on public.webhook_events;
create policy "webhook_events_service_write"
  on public.webhook_events for insert
  with check (true);
