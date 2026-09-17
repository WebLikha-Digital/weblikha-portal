-- =============================================================================
-- WEBLIKHA PORTAL — WEB PUSH SUBSCRIPTIONS
-- Migration: 019_push_subscriptions.sql
--
-- RENUMBERED from 014. This file and 014_client_collaboration.sql were written on
-- branches that did not see each other and both took number 014. This one moved,
-- rather than shifting 014-018, because it depends only on 001 (users,
-- set_updated_at) and nothing later references it — so a fresh replay in filename
-- order is still valid — whereas 014-018 cross-reference each other by number
-- throughout their comments. It was already applied to dev and prod by hand under
-- its old name; the rename does not re-run it. NOT idempotent: never replay it.
--
-- One row per browser/device per user. Subscription keys (endpoint/p256dh/auth)
-- let their holder send pushes to that device, so RLS is owner-only for ALL
-- operations — no directory read, no admin policy. Server-side sends read this
-- table with the service-role client (src/lib/supabase/admin.ts), never RLS.
--
-- Run via: Supabase Dashboard → SQL Editor, or `supabase db push`
-- =============================================================================

create table public.push_subscriptions (
  id         uuid        default gen_random_uuid() primary key,
  user_id    uuid        not null references public.users(id) on delete cascade,
  endpoint   text        not null unique,
  p256dh     text        not null,
  auth       text        not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Web Push subscriptions, one per browser/device. Owner-only RLS; server sends use the service-role client.';

create index idx_push_subscriptions_user on public.push_subscriptions(user_id);

-- Reuse the shared set_updated_at() trigger function from 001
create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: read own"
  on public.push_subscriptions for select
  using (user_id = auth.uid());

create policy "push_subscriptions: insert own"
  on public.push_subscriptions for insert
  with check (user_id = auth.uid());

create policy "push_subscriptions: update own"
  on public.push_subscriptions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "push_subscriptions: delete own"
  on public.push_subscriptions for delete
  using (user_id = auth.uid());

-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
-- =============================================================================
