-- 0016: Inventory sync history and tracking
-- Tracks cross-platform inventory syncs (eBay + Etsy)

-- ============================================================
-- sync_runs — one row per sync execution
-- ============================================================
create table if not exists public.sync_runs (
  id                uuid primary key default gen_random_uuid(),
  run_id            text not null unique,
  status            text not null check (status in ('running', 'success', 'partial', 'failed')),
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  error_message     text,

  -- Summary counts
  total_skus_checked integer not null default 0,
  skus_synced       integer not null default 0,
  quantity_updates  integer not null default 0,
  delistings        integer not null default 0,

  -- Sync scope
  sync_type         text not null check (sync_type in ('full', 'single_sku')),
  target_sku        text,

  created_at        timestamptz not null default now()
);

create index if not exists sync_runs_status_idx on public.sync_runs (status);
create index if not exists sync_runs_created_at_idx on public.sync_runs (created_at desc);
create index if not exists sync_runs_target_sku_idx on public.sync_runs (target_sku)
  where target_sku is not null;

-- ============================================================
-- sync_details — detailed line-item log of each SKU processed
-- ============================================================
create table if not exists public.sync_details (
  id                uuid primary key default gen_random_uuid(),
  sync_run_id       uuid not null references public.sync_runs (id) on delete cascade,
  sku               text not null,

  -- Platform quantities before sync
  ebay_qty_before   integer,
  etsy_qty_before   integer,

  -- Platform quantities after sync
  ebay_qty_after    integer,
  etsy_qty_after    integer,

  -- Action taken
  action            text not null check (action in ('none', 'updated', 'delisted', 'error')),
  action_details    jsonb,

  created_at        timestamptz not null default now()
);

create index if not exists sync_details_sync_run_idx on public.sync_details (sync_run_id);
create index if not exists sync_details_sku_idx on public.sync_details (sku);

-- ============================================================
-- RLS and Grants
-- ============================================================
alter table public.sync_runs enable row level security;
alter table public.sync_details enable row level security;

-- service_role only (no public/authenticated policies created)
grant select on public.sync_runs to service_role;
grant insert, update on public.sync_runs to service_role;
grant select on public.sync_details to service_role;
grant insert on public.sync_details to service_role;

-- Boss Listers can read sync history
grant select on public.sync_runs to authenticated;
grant select on public.sync_details to authenticated;

drop policy if exists "sync_runs_boss_lister_read" on public.sync_runs;
create policy "sync_runs_boss_lister_read"
  on public.sync_runs for select
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'boss_lister');

drop policy if exists "sync_details_boss_lister_read" on public.sync_details;
create policy "sync_details_boss_lister_read"
  on public.sync_details for select
  using ((select (auth.jwt() -> 'app_metadata' ->> 'role') = 'boss_lister'));
