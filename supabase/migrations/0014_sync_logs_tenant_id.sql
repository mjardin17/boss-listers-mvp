-- Migration 0014: Add tenant_id to sync_logs for multi-tenant support
-- Tracks which tenant's sync run this log entry represents

alter table public.sync_logs
  add column if not exists tenant_id uuid references public.tenants (id) on delete cascade;

-- Backfill existing logs to the default tenant (Josh's account)
update public.sync_logs
  set tenant_id = '00000000-0000-0000-0000-000000000001'
  where tenant_id is null;

-- Make tenant_id required going forward
alter table public.sync_logs alter column tenant_id set not null;

-- Add index for fast lookups by tenant
create index if not exists sync_logs_tenant_started_idx on public.sync_logs (tenant_id, started_at desc);

-- Add new columns for detailed tracking
alter table public.sync_logs
  add column if not exists items_created integer not null default 0,
  add column if not exists items_updated integer not null default 0,
  add column if not exists items_skipped integer not null default 0,
  add column if not exists metadata jsonb not null default '{}';

-- Allow authenticated users to read their own sync logs (via RLS)
grant select on public.sync_logs to authenticated;

-- RLS: Only users in the tenant can read that tenant's sync logs
drop policy if exists "sync_logs_tenant_read" on public.sync_logs;
create policy "sync_logs_tenant_read"
  on public.sync_logs for select
  using (tenant_id in (select public.my_tenant_ids()));
