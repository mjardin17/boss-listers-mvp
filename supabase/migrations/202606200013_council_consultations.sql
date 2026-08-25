create extension if not exists pgcrypto;

create table if not exists public.council_consultations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_prompt text not null,
  expert_responses jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists council_consultations_user_created_idx
  on public.council_consultations(user_id, created_at desc);

alter table public.council_consultations enable row level security;

create policy "Users can read own council consultations"
  on public.council_consultations for select
  using (auth.uid() = user_id);

create policy "Users can insert own council consultations"
  on public.council_consultations for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own council consultations"
  on public.council_consultations for delete
  using (auth.uid() = user_id);
