-- 0020_connected_accounts.sql
-- Backing infrastructure for the unified /connected-accounts page.
--
-- Two independent gaps found while auditing the existing OAuth systems
-- (2026-09-26), both additive/idempotent — nothing here touches the
-- already-live eBay connection or any other existing table/function:
--
-- 1. No way to disconnect a tenant's own marketplace OAuth connection.
--    store_marketplace_connection / get_decrypted_marketplace_token /
--    get_marketplace_connection_status already exist live against
--    public.tenant_marketplace_connections (created directly against the
--    project at some point — no migration file for them exists in this
--    repo, which is its own separate drift problem, out of scope to fix
--    here without risking the live eBay row). This migration only ADDS
--    the missing counterpart: disconnect_marketplace_connection.
--
-- 2. The entire social-media OAuth system (lib/socialMediaAuth.js,
--    lib/tokenManager.js, lib/supabaseCredentials.js,
--    pages/api/oauth/authorize.js, pages/api/oauth/[platform]/callback.js,
--    pages/social.js — covers Instagram/TikTok/YouTube/Facebook/Twitter/
--    LinkedIn/Snapchat/Pinterest) is fully coded but was never backed by
--    real tables: oauth_states, social_media_credentials, and
--    social_media_connections_log do not exist yet. Every "Connect
--    Pinterest" click currently fails at the final storage step with
--    PGRST205 "Could not find the table". This migration creates them.

-- ============================================================
-- 1. Marketplace OAuth disconnect
-- ============================================================

create or replace function public.disconnect_marketplace_connection(
  p_marketplace text,
  p_environment text default 'production'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_deleted int;
begin
  if auth.uid() is null then
    raise exception 'disconnect_marketplace_connection: no authenticated user';
  end if;

  -- Same tenant-resolution rule as the app's own resolveSession(): prefer
  -- the membership where role = 'owner', else any membership.
  select tenant_id into v_tenant_id
  from public.tenant_members
  where user_id = auth.uid()
  order by (role = 'owner') desc
  limit 1;

  if v_tenant_id is null then
    raise exception 'disconnect_marketplace_connection: caller has no tenant';
  end if;

  delete from public.tenant_marketplace_connections
  where tenant_id = v_tenant_id
    and marketplace = p_marketplace
    and environment = p_environment;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke execute on function public.disconnect_marketplace_connection(text, text) from public, anon;
grant execute on function public.disconnect_marketplace_connection(text, text) to authenticated;

-- ============================================================
-- 2. Social media OAuth storage (was entirely missing)
-- ============================================================

-- Short-lived CSRF state for the OAuth redirect round-trip. Written and
-- consumed only by pages/api/oauth/authorize.js and
-- pages/api/oauth/[platform]/callback.js, both server-side via
-- SUPABASE_SERVICE_ROLE_KEY — never touched by a user's own JWT, so RLS
-- stays enabled with zero policies (deny-all for anon/authenticated;
-- service_role is granted explicitly below, matching this project's
-- pattern of never relying on service_role's default privileges — see
-- 0007/0008's explicit grants and the "permission denied for
-- tenant_members" gap that motivated 0018/0019).
create table if not exists public.oauth_states (
  id uuid primary key default gen_random_uuid(),
  state text not null unique,
  platform text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists oauth_states_state_idx on public.oauth_states (state);
alter table public.oauth_states enable row level security;
grant select, insert, update, delete on public.oauth_states to service_role;

-- Encrypted per-user social OAuth credentials (Instagram/TikTok/YouTube/
-- Facebook/Twitter/LinkedIn/Snapchat/Pinterest). encrypted_credentials is
-- AES-256-GCM ciphertext (lib/tokenManager.js), keyed by SECRET_KEY — this
-- table never holds a plaintext token. Keyed by user_id (not tenant_id):
-- social accounts belong to whoever connected them personally, mirroring
-- lib/supabaseCredentials.js's existing contract, unlike the marketplace
-- tables which are tenant-scoped.
create table if not exists public.social_media_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  encrypted_credentials text not null,
  account_identifier text,
  scopes text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);
create index if not exists social_media_credentials_user_idx on public.social_media_credentials (user_id);
alter table public.social_media_credentials enable row level security;
grant select, insert, update, delete on public.social_media_credentials to service_role;

-- Best-effort audit trail (pages/api/oauth/[platform]/callback.js wraps
-- this write in try/catch — a failure here must never block a real
-- connection from being stored).
create table if not exists public.social_media_connections_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  account_identifier text,
  event text not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists social_media_connections_log_user_idx on public.social_media_connections_log (user_id);
alter table public.social_media_connections_log enable row level security;
grant select, insert on public.social_media_connections_log to service_role;
