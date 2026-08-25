create extension if not exists pgcrypto;

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  sku text not null,
  upc text not null default '',
  title text not null,
  quantity integer not null default 1 check (quantity >= 0),
  condition text not null default 'new',
  cost numeric(12, 2) not null default 0,
  photos jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'active', 'sold_out', 'delisted', 'archived')),
  listing jsonb not null default '{}'::jsonb,
  purchase_price numeric(12, 2) not null default 0,
  sold_price numeric(12, 2) not null default 0,
  last_sync_time timestamptz,
  errors jsonb not null default '[]'::jsonb,
  event_logs jsonb not null default '[]'::jsonb,
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, sku)
);

create table if not exists public.platform_listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  platform text not null check (platform in ('ebay', 'mercari', 'poshmark', 'facebook')),
  external_listing_id text,
  external_draft_id text,
  status text not null default 'not_created' check (
    status in ('not_created', 'draft_ready', 'active', 'sold', 'delist_required', 'delisted', 'error')
  ),
  draft_payload jsonb not null default '{}'::jsonb,
  last_sync_time timestamptz,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_id, platform),
  unique (platform, external_listing_id)
);

create table if not exists public.inventory_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  platform text check (platform in ('ebay', 'mercari', 'poshmark', 'facebook')),
  event_type text not null,
  action_taken text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  inventory_id uuid not null references public.inventory(id) on delete cascade,
  platform text not null check (platform in ('ebay', 'mercari', 'poshmark', 'facebook')),
  action text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed', 'blocked')),
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists inventory_core_user_updated_idx on public.inventory(user_id, updated_at desc);
create index if not exists platform_listings_inventory_idx on public.platform_listings(inventory_id);
create index if not exists inventory_events_inventory_created_idx on public.inventory_events(inventory_id, created_at desc);
create index if not exists sync_jobs_inventory_status_idx on public.sync_jobs(inventory_id, status);

alter table public.inventory enable row level security;
alter table public.platform_listings enable row level security;
alter table public.inventory_events enable row level security;
alter table public.sync_jobs enable row level security;

create policy "Users can read own inventory core"
  on public.inventory for select
  using (auth.uid() = user_id);

create policy "Users can insert own inventory core"
  on public.inventory for insert
  with check (auth.uid() = user_id);

create policy "Users can update own inventory core"
  on public.inventory for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own platform listings"
  on public.platform_listings for select
  using (auth.uid() = user_id);

create policy "Users can insert own platform listings"
  on public.platform_listings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own platform listings"
  on public.platform_listings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own inventory events"
  on public.inventory_events for select
  using (auth.uid() = user_id);

create policy "Users can insert own inventory events"
  on public.inventory_events for insert
  with check (auth.uid() = user_id);

create policy "Users can read own sync jobs"
  on public.sync_jobs for select
  using (auth.uid() = user_id);

create policy "Users can insert own sync jobs"
  on public.sync_jobs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sync jobs"
  on public.sync_jobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.atomic_mark_item_sold(
  p_inventory_id uuid,
  p_triggering_platform text,
  p_event_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inventory public.inventory%rowtype;
  v_user_id uuid;
  v_platform text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'atomic_mark_item_sold requires an authenticated user';
  end if;

  if p_triggering_platform not in ('ebay', 'mercari', 'poshmark', 'facebook') then
    raise exception 'Unsupported triggering platform: %', p_triggering_platform;
  end if;

  select *
    into v_inventory
    from public.inventory
   where id = p_inventory_id
     and user_id = v_user_id
   for update;

  if not found then
    return false;
  end if;

  update public.inventory
     set quantity = 0,
         status = 'sold_out',
         last_sync_time = now(),
         updated_at = now(),
         event_logs = coalesce(event_logs, '[]'::jsonb) || jsonb_build_array(
           jsonb_build_object(
             'event', 'sold',
             'platform', p_triggering_platform,
             'message', 'Inventory marked sold locally; other channels require delist.',
             'createdAt', now()
           )
         )
   where id = p_inventory_id
     and user_id = v_user_id;

  insert into public.platform_listings (
    user_id,
    inventory_id,
    platform,
    status,
    last_sync_time,
    updated_at
  )
  values (
    v_user_id,
    p_inventory_id,
    p_triggering_platform,
    'sold',
    now(),
    now()
  )
  on conflict (inventory_id, platform)
  do update set
    status = 'sold',
    last_sync_time = excluded.last_sync_time,
    updated_at = excluded.updated_at;

  for v_platform in
    select unnest(array['ebay', 'mercari', 'poshmark', 'facebook'])
  loop
    if v_platform <> p_triggering_platform then
      insert into public.platform_listings (
        user_id,
        inventory_id,
        platform,
        status,
        last_sync_time,
        updated_at
      )
      values (
        v_user_id,
        p_inventory_id,
        v_platform,
        'delist_required',
        now(),
        now()
      )
      on conflict (inventory_id, platform)
      do update set
        status = case
          when public.platform_listings.status in ('sold', 'delisted', 'not_created') then public.platform_listings.status
          else 'delist_required'
        end,
        last_sync_time = excluded.last_sync_time,
        updated_at = excluded.updated_at;
    end if;
  end loop;

  insert into public.inventory_events (
    user_id,
    inventory_id,
    platform,
    event_type,
    action_taken,
    payload
  )
  values (
    v_user_id,
    p_inventory_id,
    p_triggering_platform,
    'sold',
    'local_inventory_locked_and_delist_jobs_queued',
    coalesce(p_event_payload, '{}'::jsonb)
  );

  for v_platform in
    select platform
      from public.platform_listings
     where inventory_id = p_inventory_id
       and user_id = v_user_id
       and platform <> p_triggering_platform
       and status = 'delist_required'
  loop
    insert into public.sync_jobs (
      user_id,
      inventory_id,
      platform,
      action,
      status,
      payload,
      idempotency_key
    )
    values (
      v_user_id,
      p_inventory_id,
      v_platform,
      'delist',
      'pending',
      jsonb_build_object(
        'reason', 'sold_on_other_platform',
        'triggeringPlatform', p_triggering_platform,
        'inventoryId', p_inventory_id
      ),
      p_inventory_id::text || ':' || v_platform || ':delist:' || p_triggering_platform
    )
    on conflict (idempotency_key)
    do nothing;
  end loop;

  return true;
end;
$$;
