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
-- 6. created_at is the whole basis of within_edit_window(), so it has to be
--    pinned on both ends or the feature is decorative:
--      - UPDATE: messages and task_comments had no immutable-columns guard at
--        all (022 already added one for message_replies). An author could
--        PATCH their own row via PostgREST with a future created_at — the
--        author_id = auth.uid() check does not stop that — and their window
--        would never close. guard_message_immutable_columns() (020) is
--        recreated here to also reject a changed created_at, and
--        guard_task_comment_immutable_columns() is new.
--      - INSERT: created_at only *defaults* to now(); an explicit value in
--        the insert payload overrides a default, so nothing stopped a
--        far-future created_at at post time either. force_created_at_now(),
--        one shared BEFORE INSERT trigger function on messages, task_comments
--        and message_replies, pins it for every non-service-role insert.
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
--
-- guard_message_immutable_columns() (020) is superseded here: same checks on
-- is_client_visible, project_id and author_id, plus a new one on created_at.
-- 020 already attaches this function BEFORE UPDATE on messages
-- (messages_guard_immutable_columns), so recreating the function is enough —
-- no second trigger to create.
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

  if new.created_at is distinct from old.created_at then
    raise exception 'A message''s timestamp cannot be changed.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_message_immutable_columns() is
  'Blocks changes to messages.is_client_visible / project_id / author_id / created_at after insert, for every role. Allows service-role statements and ON DELETE SET NULL on author_id. Superseded from 020 in 023 to add the created_at check that closes the edit-window forgery path.';

-- 020 already created this trigger; left here only so the CREATE OR REPLACE
-- above is guaranteed to be wired up even if 023 is applied out of order.
drop trigger if exists messages_guard_immutable_columns on public.messages;
create trigger messages_guard_immutable_columns
  before update on public.messages
  for each row execute function public.guard_message_immutable_columns();

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
--
-- task_comments has never had an immutable-columns guard at all — unlike
-- messages (020) and message_replies (022), nothing stopped task_id,
-- author_id or created_at from being rewritten on UPDATE. Added now, same
-- shape as the other two.
-- =============================================================================

create or replace function public.guard_task_comment_immutable_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.task_id is distinct from old.task_id then
    raise exception 'A comment cannot be moved to another task.'
      using errcode = '42501';
  end if;

  if new.author_id is distinct from old.author_id and new.author_id is not null then
    raise exception 'A comment''s author cannot be changed.'
      using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'A comment''s timestamp cannot be changed.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_task_comment_immutable_columns() is
  'Blocks changes to task_comments.task_id / author_id / created_at after insert, for every role. Allows service-role statements and ON DELETE SET NULL on author_id.';

drop trigger if exists task_comments_guard_immutable_columns on public.task_comments;
create trigger task_comments_guard_immutable_columns
  before update on public.task_comments
  for each row execute function public.guard_task_comment_immutable_columns();

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
-- 6. INSERT-TIME FORGERY
--
-- The UPDATE guards above close one half of the hole; the other half is at
-- INSERT. created_at only *defaults* to now() — an explicit created_at in the
-- insert payload overrides a column default, so an author could post with a
-- far-future created_at and their edit window would never close, no UPDATE
-- required. One shared function, attached BEFORE INSERT on all three tables:
-- a single place to reason about "can created_at be forged," instead of three
-- near-duplicates. Same auth.uid() is null bypass as the UPDATE guards, so
-- service-role inserts (data fixes, backfills, seed scripts) keep whatever
-- created_at they pass.
-- =============================================================================

create or replace function public.force_created_at_now()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    new.created_at := now();
  end if;

  return new;
end;
$$;

comment on function public.force_created_at_now() is
  'Forces created_at to now() on insert for every non-service-role caller, so an explicit created_at in the request payload cannot override the column default and pre-date or post-date a row. Attached to messages, task_comments and message_replies — every table within_edit_window() governs.';

drop trigger if exists messages_force_created_at_now on public.messages;
create trigger messages_force_created_at_now
  before insert on public.messages
  for each row execute function public.force_created_at_now();

drop trigger if exists task_comments_force_created_at_now on public.task_comments;
create trigger task_comments_force_created_at_now
  before insert on public.task_comments
  for each row execute function public.force_created_at_now();

drop trigger if exists message_replies_force_created_at_now on public.message_replies;
create trigger message_replies_force_created_at_now
  before insert on public.message_replies
  for each row execute function public.force_created_at_now();


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
--   - As the author, PATCH your own message with a future created_at → rejected
--     (A message's timestamp cannot be changed.); same for task_comments and
--     message_replies.
--   - As the author, INSERT a message/task_comment/message_reply with an
--     explicit far-future or far-past created_at in the payload → stored row
--     has created_at = now(), not the submitted value.
-- =============================================================================
