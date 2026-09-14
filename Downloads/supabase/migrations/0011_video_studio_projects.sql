-- 0011_video_studio_projects.sql
-- Durable, tenant-scoped storage for Video Studio projects, replacing the
-- flat-filesystem persistence lib/video-studio/projectStore.ts started
-- with. Follows the exact tenant-scoping pattern already established in
-- 0007_multi_tenant.sql for marketplace_listings (public.my_tenant_ids()),
-- not a new convention.
--
-- The whole VideoProject (scenes/audio/cta/render state) is stored as one
-- jsonb column rather than fully normalized into scene/audio/cta tables —
-- same shape as public.listings' input/outputs jsonb columns (0005) — a
-- video project is read/written as one unit by the app, never queried by
-- individual scene fields, so normalizing further would add real
-- complexity with no real query benefit yet.

create table if not exists public.video_studio_projects (
  id            text primary key,
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  project       jsonb not null,
  render_status text not null default 'DRAFT'
                  check (render_status in ('DRAFT','READY','QUEUED','RENDERING','SUCCEEDED','FAILED')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists video_studio_projects_tenant_idx
  on public.video_studio_projects (tenant_id, updated_at desc);

alter table public.video_studio_projects enable row level security;

drop policy if exists "video_studio_projects_tenant_read" on public.video_studio_projects;
create policy "video_studio_projects_tenant_read"
  on public.video_studio_projects for select
  using (tenant_id in (select public.my_tenant_ids()));

drop policy if exists "video_studio_projects_tenant_write" on public.video_studio_projects;
create policy "video_studio_projects_tenant_write"
  on public.video_studio_projects for insert
  with check (tenant_id in (select public.my_tenant_ids()));

drop policy if exists "video_studio_projects_tenant_update" on public.video_studio_projects;
create policy "video_studio_projects_tenant_update"
  on public.video_studio_projects for update
  using (tenant_id in (select public.my_tenant_ids()))
  with check (tenant_id in (select public.my_tenant_ids()));

drop policy if exists "video_studio_projects_tenant_delete" on public.video_studio_projects;
create policy "video_studio_projects_tenant_delete"
  on public.video_studio_projects for delete
  using (tenant_id in (select public.my_tenant_ids()));
