-- =============================================================================
-- WEBLIKHA PORTAL — EDITING WINDOW
-- Migration: 023_edit_window.sql
--
-- Two problems, one rule: the AUTHOR, and only the author, may edit — and only
-- for a while after posting.
--
--   1. app_settings — one row, one number: how many minutes after posting an
--      author may still edit. Admin-editable, default 15.
--   2. within_edit_window(created_at) — the rule, in one place.
--   3. messages: 004's "messages: admin all" (FOR ALL) let an admin rewrite a
--      client's post. Split into read / insert-own / delete-any: no admin
--      update path remains. The per-role author-update policies collapse into
--      one role-agnostic policy carrying the window.
--   4. task_comments: 008 has the same FOR ALL hole. Same split, and 009's
--      author-update policy gains the window.
--   5. message_replies (022): update policy gains the window.
--
-- Deleting is deliberately NOT time-limited: an author deletes their own
-- whenever, an admin deletes anything. A delete is visible — the row is gone —
-- whereas a late edit rewrites history silently. No delete policy is touched.
--
-- Apply with: npx supabase db push --db-url $env:DB_URL   (dev first, then prod)
-- Safe to re-run.
-- =============================================================================


-- =============================================================================
-- 1. THE SETTING
--
-- One row, forever: `check (id = 1)` makes a second row impossible, so there is
-- never a "which settings row?" question. Single-purpose columns rather than a
-- generic key/value store — a second setting becomes a second column, and keeps
-- its own type, constraint and comment.
-- =============================================================================

create table if not exists public.app_settings (
  id                  smallint     primary key default 1 check (id = 1),
  edit_window_minutes integer      not null default 15,
  updated_at          timestamptz  not null default now()
);

comment on table public.app_settings is
  'Agency-wide portal settings. Exactly one row (id = 1).';
comment on column public.app_settings.edit_window_minutes is
  'Minutes after posting during which an author may still edit their message, reply or task comment. Mirrors EDIT_WINDOW_MIN/MAX_MINUTES in src/lib/messages.ts.';

alter table public.app_settings
  drop constraint if exists app_settings_edit_window_bounds;
alter table public.app_settings
  add constraint app_settings_edit_window_bounds
  check (edit_window_minutes between 1 and 1440);

insert into public.app_settings (id) values (1)
on conflict (id) do nothing;

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

-- Every approved user reads it: the UI needs the number to decide whether to
-- render an Edit button.
drop policy if exists "app_settings: approved read" on public.app_settings;
create policy "app_settings: approved read"
  on public.app_settings for select
  using (public.is_approved_member());

drop policy if exists "app_settings: admin updates" on public.app_settings;
create policy "app_settings: admin updates"
  on public.app_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- No insert or delete policy: the row is created here and is not replaceable.


-- =============================================================================
-- 2. THE RULE
--
-- SECURITY DEFINER so the check never depends on the caller being able to read
-- app_settings — a future tightening of that read policy must not silently
-- disable editing for everyone. Falls back to 15 if the row is somehow missing.
-- =============================================================================

create or replace function public.within_edit_window(created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select now() < created_at + make_interval(
    mins => coalesce((select s.edit_window_minutes from public.app_settings s where s.id = 1), 15)
  );
$$;

comment on function public.within_edit_window(timestamptz) is
  'True while a row posted at created_at is still editable by its author. Single source of the editing window; used by the update policies on messages, task_comments and message_replies.';


-- =============================================================================
-- 3. MESSAGES
--
-- 004's "messages: admin all" is FOR ALL — that is the policy that let an admin
-- edit a client's post. Replaced by three narrower ones. Admin READ and DELETE
-- are unchanged in effect; only the silent-rewrite power goes away.
-- =============================================================================

drop policy if exists "messages: admin all" on public.messages;

drop policy if exists "messages: admin reads all" on public.messages;
create policy "messages: admin reads all"
  on public.messages for select
  using (public.is_admin());

drop policy if exists "messages: admin inserts own" on public.messages;
create policy "messages: admin inserts own"
  on public.messages for insert
  with check (public.is_admin() and author_id = auth.uid());

drop policy if exists "messages: admin deletes any" on public.messages;
create policy "messages: admin deletes any"
  on public.messages for delete
  using (public.is_admin());

-- One role-agnostic author policy replaces 020's provider and 014's client
-- variants. 020's immutable-columns trigger still blocks is_client_visible,
-- project_id and author_id, so this only ever governs title, body, category
-- and mentions.
drop policy if exists "messages: provider edits own" on public.messages;
drop policy if exists "messages: client edits own"   on public.messages;

drop policy if exists "messages: author updates own in window" on public.messages;
create policy "messages: author updates own in window"
  on public.messages for update
  using (
    author_id = auth.uid()
    and public.within_edit_window(created_at)
  )
  with check (author_id = auth.uid());


-- =============================================================================
-- 4. TASK COMMENTS
-- 008's "task_comments: admin all" is the same FOR ALL hole.
-- =============================================================================

drop policy if exists "task_comments: admin all" on public.task_comments;

drop policy if exists "task_comments: admin reads all" on public.task_comments;
create policy "task_comments: admin reads all"
  on public.task_comments for select
  using (public.is_admin());

drop policy if exists "task_comments: admin inserts own" on public.task_comments;
create policy "task_comments: admin inserts own"
  on public.task_comments for insert
  with check (public.is_admin() and author_id = auth.uid());

drop policy if exists "task_comments: admin deletes any" on public.task_comments;
create policy "task_comments: admin deletes any"
  on public.task_comments for delete
  using (public.is_admin());

drop policy if exists "task_comments: author updates own" on public.task_comments;
create policy "task_comments: author updates own"
  on public.task_comments for update
  using (
    author_id = auth.uid()
    and public.within_edit_window(created_at)
  )
  with check (author_id = auth.uid());


-- =============================================================================
-- 5. MESSAGE REPLIES (022)
-- can_read_message() stays: a reply is still only editable where it is readable.
-- =============================================================================

drop policy if exists "message_replies: update own" on public.message_replies;
create policy "message_replies: update own"
  on public.message_replies for update
  using (
    author_id = auth.uid()
    and public.can_read_message(message_id)
    and public.within_edit_window(created_at)
  )
  with check (
    author_id = auth.uid()
    and public.can_read_message(message_id)
  );


-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
--
-- Note: every row that already exists is older than the window, so nothing
-- created before this migration is editable. That is intended.
--
-- Manual checks after applying:
--   - As admin, PATCH another user's message via PostgREST → 0 rows.
--   - As the author, PATCH your own message posted a minute ago → succeeds.
--   - Set edit_window_minutes to 1, wait, PATCH again → 0 rows.
--   - As a non-admin, PATCH app_settings → rejected.
--   - Admin delete of anyone's message and comment still works.
-- =============================================================================
