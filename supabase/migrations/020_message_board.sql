-- =============================================================================
-- WEBLIKHA PORTAL — MESSAGE BOARD
-- Migration: 020_message_board.sql
--
-- Stage 3 of the client portal. Messages already have a table (002), policies
-- (004, 014, 016), an updated_at trigger (002: set_messages_updated_at) and a
-- (project_id, created_at desc) index (002) — none of those are recreated here.
--
--   1. Lock is_client_visible, project_id and author_id after insert, for every
--      role including admin. Visibility is chosen once, at posting.
--   2. Rewrite 004's provider/client policies with the helper functions.
--   3. Providers can edit and delete their own posts (no policy existed).
--   4. Client delete gains is_project_member — revoking a client deletes their
--      project_members rows, so without it a revoked client with a live
--      session could still delete their old posts.
--   5. notifications.message_id, so a notification can point at a post.
--   6. A client's post notifies every approved admin and every approved provider
--      on the project. This trigger is the single source of truth for
--      recipients; the app reads these rows to decide who gets a push.
--
-- Apply with: npx supabase db push --db-url $env:DB_URL   (dev first, then prod)
-- Safe to re-run: every create is preceded by drop … if exists / create or replace.
-- =============================================================================


-- =============================================================================
-- 1. IMMUTABLE COLUMNS
--
-- A WITH CHECK sees only the NEW row, so it cannot express "unchanged". A
-- BEFORE UPDATE trigger compares OLD and NEW directly.
--
-- auth.uid() IS NULL means no end user is behind the statement (service role,
-- SQL Editor maintenance) — allowed, matching 016's guards.
--
-- author_id changing TO NULL is allowed: that is ON DELETE SET NULL firing when
-- the author's users row is deleted. Blocking it would make those users
-- undeletable.
-- =============================================================================

create or replace function public.guard_message_immutable_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.is_client_visible is distinct from old.is_client_visible then
    raise exception 'Message visibility cannot be changed after posting.'
      using errcode = '42501';
  end if;

  if new.project_id is distinct from old.project_id then
    raise exception 'A message cannot be moved to another project.'
      using errcode = '42501';
  end if;

  if new.author_id is distinct from old.author_id and new.author_id is not null then
    raise exception 'A message''s author cannot be changed.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_message_immutable_columns() is
  'Blocks changes to messages.is_client_visible / project_id / author_id after insert, for every role. Allows service-role statements and ON DELETE SET NULL on author_id.';

drop trigger if exists messages_guard_immutable_columns on public.messages;
create trigger messages_guard_immutable_columns
  before update on public.messages
  for each row execute function public.guard_message_immutable_columns();


-- =============================================================================
-- 2. 004 POLICIES REWRITTEN WITH HELPERS (same meaning)
-- =============================================================================

drop policy if exists "messages: provider reads assigned" on public.messages;
create policy "messages: provider reads assigned"
  on public.messages for select
  using (
    public.get_user_role() = 'provider'
    and public.is_project_member(project_id)
  );

drop policy if exists "messages: provider inserts" on public.messages;
create policy "messages: provider inserts"
  on public.messages for insert
  with check (
    public.get_user_role() = 'provider'
    and author_id = auth.uid()
    and public.is_project_member(project_id)
  );

drop policy if exists "messages: client reads visible" on public.messages;
create policy "messages: client reads visible"
  on public.messages for select
  using (
    public.get_user_role() = 'client'
    and is_client_visible = true
    and public.is_project_member(project_id)
  );


-- =============================================================================
-- 3. PROVIDERS EDIT AND DELETE THEIR OWN POSTS
-- =============================================================================

drop policy if exists "messages: provider edits own" on public.messages;
create policy "messages: provider edits own"
  on public.messages for update
  using (
    public.get_user_role() = 'provider'
    and author_id = auth.uid()
    and public.is_project_member(project_id)
  )
  with check (
    public.get_user_role() = 'provider'
    and author_id = auth.uid()
    and public.is_project_member(project_id)
  );

drop policy if exists "messages: provider deletes own" on public.messages;
create policy "messages: provider deletes own"
  on public.messages for delete
  using (
    public.get_user_role() = 'provider'
    and author_id = auth.uid()
    and public.is_project_member(project_id)
  );


-- =============================================================================
-- 4. CLIENT DELETE REQUIRES MEMBERSHIP (backlog #8)
-- Also back-ported into 014's copy so a hand re-run of 014 cannot revert it.
-- =============================================================================

drop policy if exists "messages: client deletes own" on public.messages;
create policy "messages: client deletes own"
  on public.messages for delete
  using (
    public.get_user_role() = 'client'
    and author_id = auth.uid()
    and public.is_project_member(project_id)
  );


-- =============================================================================
-- 5. NOTIFICATIONS CAN POINT AT A MESSAGE
-- on delete cascade: deleting a post removes its notifications.
-- The 'client_message' type is already allowed by 014's check constraint.
-- =============================================================================

alter table public.notifications
  add column if not exists message_id uuid references public.messages(id) on delete cascade;

create index if not exists idx_notifications_message_id
  on public.notifications(message_id);

comment on column public.notifications.message_id is
  'The message a client_message notification refers to. Null for other types.';


-- =============================================================================
-- 6. A CLIENT POST NOTIFIES THE TEAM
--
-- SECURITY DEFINER: the inserting client cannot read other users' rows or write
-- other users' notifications under RLS. Returns nothing but the insert side
-- effect, so the elevated rights expose no data.
-- =============================================================================

create or replace function public.notify_client_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.users u
    where u.id = new.author_id and u.role = 'client'
  ) then
    return new;
  end if;

  insert into public.notifications (user_id, actor_id, type, project_id, message_id)
  select recipients.id, new.author_id, 'client_message', new.project_id, new.id
  from (
    select u.id
    from public.users u
    where u.role = 'admin' and u.approved = true
    union
    select u.id
    from public.project_members pm
    join public.users u on u.id = pm.user_id
    where pm.project_id = new.project_id
      and u.role = 'provider'
      and u.approved = true
  ) recipients
  where recipients.id is distinct from new.author_id;

  return new;
end;
$$;

comment on function public.notify_client_message() is
  'Creates client_message notifications for approved admins and approved project providers when a client posts. Single source of truth for recipients — the app pushes to exactly these rows.';

drop trigger if exists messages_notify_client_message on public.messages;
create trigger messages_notify_client_message
  after insert on public.messages
  for each row execute function public.notify_client_message();


-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
--
-- Manual checks after applying:
--   - As a provider, PATCH is_client_visible on your own post → rejected (42501).
--   - As a provider, edit and delete your own post → succeeds; another provider's → 0 rows.
--   - As a client, post → one client_message row per approved admin and per approved
--     provider on the project; none for the client.
--   - Delete a user who authored a message (service role) → succeeds; author_id becomes null.
-- =============================================================================
