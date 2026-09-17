-- =============================================================================
-- WEBLIKHA PORTAL — MESSAGE CATEGORIES AND MENTIONS
-- Migration: 021_message_categories_mentions.sql
--
-- Extends the Stage 3 message board (020):
--   1. message_categories — one agency-wide list, admin-editable, archivable.
--   2. messages.category_id + messages.mentions.
--   3. A guard so an archived category can't be chosen for a post.
--   4. Body length raised to 20,000 characters (rich-text HTML inflates length).
--   5. notifications type 'message_mention'.
--   6. notify_message_mentions — the single source of truth for mention
--      recipients. Clients are never notified about an internal post.
--
-- Apply with: npx supabase db push --db-url $env:DB_URL   (dev first, then prod)
-- Safe to re-run.
-- =============================================================================


-- =============================================================================
-- 1. CATEGORIES
-- "None" is not a row — it is a null messages.category_id.
-- Archiving replaces deleting: there is no delete policy, and messages reference
-- categories ON DELETE RESTRICT, so a category in use cannot be hard-deleted.
-- =============================================================================

create table if not exists public.message_categories (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  emoji       text        not null,
  position    integer     not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.message_categories is
  'Agency-wide message board categories. Admin-editable; archived rather than deleted.';

alter table public.message_categories
  drop constraint if exists message_categories_name_length;
alter table public.message_categories
  add constraint message_categories_name_length
  check (char_length(btrim(name)) between 1 and 40);

alter table public.message_categories
  drop constraint if exists message_categories_emoji_length;
alter table public.message_categories
  add constraint message_categories_emoji_length
  check (char_length(btrim(emoji)) between 1 and 16);

-- Names unique among ACTIVE categories only, so an archived "Pitch" does not
-- block creating a new one.
create unique index if not exists idx_message_categories_active_name
  on public.message_categories (lower(btrim(name)))
  where archived_at is null;

create index if not exists idx_message_categories_position
  on public.message_categories (position);

drop trigger if exists message_categories_set_updated_at on public.message_categories;
create trigger message_categories_set_updated_at
  before update on public.message_categories
  for each row execute function public.set_updated_at();

alter table public.message_categories enable row level security;

drop policy if exists "message_categories: approved read" on public.message_categories;
create policy "message_categories: approved read"
  on public.message_categories for select
  using (public.is_approved_member());

drop policy if exists "message_categories: admin inserts" on public.message_categories;
create policy "message_categories: admin inserts"
  on public.message_categories for insert
  with check (public.is_admin());

drop policy if exists "message_categories: admin updates" on public.message_categories;
create policy "message_categories: admin updates"
  on public.message_categories for update
  using (public.is_admin())
  with check (public.is_admin());

-- Seed defaults once; re-running inserts nothing that already exists by name.
insert into public.message_categories (name, emoji, position)
select v.name, v.emoji, v.position
from (values
  ('Announcement', '📢', 0),
  ('FYI',          '✨', 1),
  ('Heartbeat',    '💗', 2),
  ('Pitch',        '💡', 3),
  ('Question',     '👋', 4)
) as v(name, emoji, position)
where not exists (
  select 1 from public.message_categories c
  where lower(btrim(c.name)) = lower(v.name)
);


-- =============================================================================
-- 2. MESSAGE COLUMNS
-- =============================================================================

alter table public.messages
  add column if not exists category_id uuid
  references public.message_categories(id) on delete restrict;

create index if not exists idx_messages_category_id
  on public.messages (category_id);

alter table public.messages
  add column if not exists mentions uuid[] not null default '{}';


-- =============================================================================
-- 3. ARCHIVED CATEGORY GUARD
-- An archived category cannot be chosen on insert, or switched to on update.
-- A post that already has a now-archived category keeps it when other fields
-- are edited. SECURITY DEFINER so the check does not depend on what the caller
-- can read under RLS.
-- =============================================================================

create or replace function public.guard_message_archived_category()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.category_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.category_id is not distinct from old.category_id then
    return new;
  end if;

  if exists (
    select 1 from public.message_categories c
    where c.id = new.category_id and c.archived_at is not null
  ) then
    raise exception 'That category is archived and can''t be chosen.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_guard_archived_category on public.messages;
create trigger messages_guard_archived_category
  before insert or update on public.messages
  for each row execute function public.guard_message_archived_category();


-- =============================================================================
-- 4. BODY LENGTH — 20,000 characters of HTML
-- Replaces 020's 10,000 check. NOT VALID so legacy rows are not re-checked on
-- apply; new inserts and updates are enforced. Emptiness of rich content is
-- validated in the application (src/lib/messages.ts).
-- =============================================================================

alter table public.messages
  drop constraint if exists messages_body_length;
alter table public.messages
  add constraint messages_body_length
  check (char_length(body) between 1 and 20000) not valid;


-- =============================================================================
-- 5. NOTIFICATION TYPE
-- NOT VALID: this table is busy, and a full-table validation scan would lock
-- it. Existing rows already satisfy the widened list (it only adds a value),
-- so there is nothing to backfill.
-- =============================================================================

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('mention', 'task_assigned', 'client_task', 'client_message', 'message_mention'))
  not valid;

-- Mirrors MESSAGE_MENTIONS_MAX in src/lib/messages.ts — keep them in sync.
-- The column is new with default '{}', so plain (validating) is fine here.
alter table public.messages
  drop constraint if exists messages_mentions_count;
alter table public.messages
  add constraint messages_mentions_count
  check (cardinality(mentions) <= 50);


-- =============================================================================
-- 6. MENTION NOTIFICATIONS
--
-- Candidates: ids in new.mentions not already in old.mentions (all on insert).
-- A candidate is notified only if:
--   - it is not the author, and
--   - it is an approved admin, or an approved member of the project, and
--   - on an INTERNAL post, it is not a client, and
--   - no notification already exists for that user and this message.
--
-- The last rule prevents a double notification when a client's post also
-- mentions a team member. It depends on trigger order: Postgres fires
-- same-event triggers in NAME order, so messages_notify_client_message (020)
-- runs before messages_notify_mentions. Renaming either trigger can break this.
--
-- actor_id is always the post's author (new.author_id) — including when an
-- admin edits someone else's post, the notification still reads as coming
-- from the original author, not the editing admin. And a candidate who
-- already holds any notification for this message (e.g. a client_message row
-- from posting it) is not sent a second, mention-flavoured notice — by
-- design, not an oversight.
-- =============================================================================

create or replace function public.notify_message_mentions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new uuid[];
  v_uid uuid;
begin
  if tg_op = 'INSERT' then
    v_new := coalesce(new.mentions, '{}');
  else
    select coalesce(array_agg(m), '{}') into v_new
    from unnest(coalesce(new.mentions, '{}')) m
    where not (m = any(coalesce(old.mentions, '{}')));
  end if;

  foreach v_uid in array v_new loop
    if v_uid is not distinct from new.author_id then
      continue;
    end if;

    if not exists (
      select 1
      from public.users u
      where u.id = v_uid
        and u.approved = true
        and (
          u.role = 'admin'
          or exists (
            select 1 from public.project_members pm
            where pm.project_id = new.project_id and pm.user_id = v_uid
          )
        )
        and (new.is_client_visible or u.role <> 'client')
    ) then
      continue;
    end if;

    if exists (
      select 1 from public.notifications n
      where n.user_id = v_uid and n.message_id = new.id
    ) then
      continue;
    end if;

    insert into public.notifications (user_id, actor_id, type, project_id, message_id)
    values (v_uid, new.author_id, 'message_mention', new.project_id, new.id);
  end loop;

  return new;
end;
$$;

comment on function public.notify_message_mentions() is
  'Creates message_mention notifications for newly mentioned approved members/admins; never a client on an internal post. Single source of truth for mention recipients.';

drop trigger if exists messages_notify_mentions on public.messages;
create trigger messages_notify_mentions
  after insert or update of mentions on public.messages
  for each row execute function public.notify_message_mentions();


-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
--
-- Manual checks after applying:
--   - As a client, select from message_categories → 5 seeded rows; insert → rejected.
--   - Insert a message with an archived category_id → 42501.
--   - Mention a client on an internal post via the API → no notification row.
--   - A client post mentioning an admin → one notification for that admin.
-- =============================================================================
