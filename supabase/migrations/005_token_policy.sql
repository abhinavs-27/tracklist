-- =========================================
-- Spotify Tokens Table
-- =========================================

create table if not exists public.spotify_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,

  access_token text not null,
  refresh_token text not null,

  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),

  created_at timestamptz not null default now()
);

-- =========================================
-- Enable Row Level Security
-- =========================================

alter table public.spotify_tokens enable row level security;

-- =========================================
-- Policies
-- =========================================

-- Allow users to read their own Spotify tokens
create policy "Users can read their own spotify tokens"
on public.spotify_tokens
for select
using (auth.uid() = user_id);

-- Allow users to insert their own Spotify tokens
create policy "Users can insert their own spotify tokens"
on public.spotify_tokens
for insert
with check (auth.uid() = user_id);

-- Allow users to update their own Spotify tokens
create policy "Users can update their own spotify tokens"
on public.spotify_tokens
for update
using (auth.uid() = user_id);

-- =========================================
-- Helpful Index
-- =========================================

create index if not exists spotify_tokens_user_id_idx
on public.spotify_tokens(user_id);

-- =========================================
-- Update timestamp trigger
-- =========================================

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_spotify_tokens_updated_at
on public.spotify_tokens;

create trigger update_spotify_tokens_updated_at
before update on public.spotify_tokens
for each row
execute procedure public.update_updated_at_column();
