-- 0027_commercial_jobs_tenant_scope.sql
-- Commercial jobs must be scoped to the tenant that owns the source listing.
-- Existing jobs are backfilled through their listing's tenant_id.

alter table public.commercial_jobs
  add column if not exists tenant_id uuid references public.tenants (id);

update public.commercial_jobs cj
set tenant_id = l.tenant_id
from public.listings l
where cj.listing_id = l.id
  and cj.tenant_id is null;

do $$
begin
  if exists (
    select 1
    from public.commercial_jobs
    where tenant_id is null
  ) then
    raise exception 'Cannot enforce commercial_jobs tenant scope: one or more jobs have no tenant-owned listing';
  end if;
end $$;

alter table public.commercial_jobs
  alter column tenant_id set not null;

create index if not exists commercial_jobs_tenant_created_idx
  on public.commercial_jobs (tenant_id, created_at desc);

-- Replace the legacy session-string policy with authenticated tenant membership.
drop policy if exists commercial_jobs_read_own on public.commercial_jobs;

create policy commercial_jobs_read_tenant
  on public.commercial_jobs
  for select
  using (
    tenant_id in (select public.my_tenant_ids())
    or auth.role() = 'service_role'
  );

comment on column public.commercial_jobs.tenant_id is
  'Tenant that owns the source listing; used for all commercial job reads and signed status callbacks.';

comment on column public.commercial_jobs.status is
  'Job lifecycle: pending, queued, completed, failed.';
