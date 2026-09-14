-- 0005_listings_and_storage.sql
-- Boss Listers MVP: listing-generation history + storage bucket

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  session_id text not null default 'anon',
  input jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '[]'::jsonb,
  image_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists listings_session_created_idx
  on public.listings (session_id, created_at desc);

create index if not exists listings_created_idx
  on public.listings (created_at desc);

alter table public.listings enable row level security;

-- Service-role only (via Worker), no anon/authenticated access
grant all on public.listings to service_role;
revoke all on public.listings from anon, authenticated;

-- Storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Cross-colo rate limiting
create table if not exists public.api_rate_limit (
  key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);

alter table public.api_rate_limit enable row level security;
grant all on public.api_rate_limit to service_role;
revoke all on public.api_rate_limit from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_key text, p_max int, p_window_seconds int
) returns table (allowed boolean, remaining int, retry_after int)
language plpgsql security definer set search_path = public as $$
declare r public.api_rate_limit%rowtype;
begin
  insert into public.api_rate_limit (key) values (p_key)
    on conflict (key) do nothing;
  select * into r from public.api_rate_limit where key = p_key for update;
  if now() - r.window_start > make_interval(secs => p_window_seconds) then
    update public.api_rate_limit set window_start = now(), hits = 1 where key = p_key;
    return query select true, p_max - 1, 0;
  elsif r.hits >= p_max then
    return query select false, 0,
      ceil(extract(epoch from (r.window_start + make_interval(secs => p_window_seconds) - now())))::int;
  else
    update public.api_rate_limit set hits = r.hits + 1 where key = p_key;
    return query select true, p_max - r.hits - 1, 0;
  end if;
end $$;

revoke all on function public.consume_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, int, int) to service_role;
