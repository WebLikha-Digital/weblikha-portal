-- =============================================================================
-- WEBLIKHA PORTAL — MESSAGE BOARD REPLIES
-- Migration: 022_message_replies.sql
--
-- Stage 3 follow-up. Posts shipped in 020/021 with no way to answer them.
--
--   1. message_replies — a flat thread per post. No nesting, no per-reply
--      visibility: a reply is exactly as visible as the post it hangs under.
--   2. can_read_message(mid) — one helper holding the visibility rule that
--      020's policies express per role. Every reply policy is written in terms
--      of it, so "can read" and "can reply" cannot drift apart.
--   3. Immutable message_id / author_id, mirroring 020's guard on posts.
--   4. notifications.reply_id + type 'message_reply'.
--   5. Two insert triggers: mentions first, then thread participants.
--
-- Apply with: npx supabase db push --db-url $env:DB_URL   (dev first, then prod)
-- Safe to re-run.
-- =============================================================================


-- =============================================================================
-- 1. VISIBILITY HELPER
--
-- Mirrors, in one place, what 020's per-role message policies say:
--   admin                     → every post
--   provider (approved member)→ every post in their projects
--   client   (approved member)→ only is_client_visible posts in their projects
--
-- 020's policies are deliberately NOT rewritten in terms of this helper: they
-- are deployed and working, and rewriting live RLS is a bigger change than
-- replies justify. Both exist; change them together.
--
-- SECURITY DEFINER so the check does not depend on what the caller can read.
-- =============================================================================

create or replace function public.can_read_message(mid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.messages m
    join public.users u on u.id = auth.uid()
    where m.id = mid
      and u.approved = true
      and (
        u.role = 'admin'
        or (
          exists (
            select 1 from public.project_members pm
            where pm.project_id = m.project_id and pm.user_id = u.id
          )
          and (m.is_client_visible or u.role <> 'client')
        )
      )
  );
$$;

comment on function public.can_read_message(uuid) is
  'True when the caller may read this post: approved admin, or approved project member (a client only when the post is client-visible). Reply policies are written in terms of this, so reading and replying cannot drift apart. Mirrors 020''s per-role message policies.';


-- =============================================================================
-- 2. TABLE
-- Deleting a post takes its replies. Deleting a user blanks author_id and keeps
-- the reply, as posts and task comments already behave.
-- =============================================================================

create table if not exists public.message_replies (
  id         uuid        primary key default gen_random_uuid(),
  message_id uuid        not null references public.messages(id) on delete cascade,
  author_id  uuid        references public.users(id) on delete set null,
  body       text        not null,
  mentions   uuid[]      not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.message_replies is
  'Flat reply thread under a message board post. Visibility is inherited from the post — see can_read_message().';

-- Mirrors MESSAGE_BODY_MAX / MESSAGE_MENTIONS_MAX in src/lib/messages.ts; change
-- them together. Emptiness of rich content (<p></p>) is an application rule.
alter table public.message_replies
  drop constraint if exists message_replies_body_length;
alter table public.message_replies
  add constraint message_replies_body_length
  check (char_length(body) between 1 and 20000);

alter table public.message_replies
  drop constraint if exists message_replies_mentions_count;
alter table public.message_replies
  add constraint message_replies_mentions_count
  check (cardinality(mentions) <= 50);

create index if not exists idx_message_replies_message_id
  on public.message_replies (message_id);
create index if not exists idx_message_replies_thread
  on public.message_replies (message_id, created_at);
create index if not exists idx_message_replies_author_id
  on public.message_replies (author_id);

drop trigger if exists message_replies_set_updated_at on public.message_replies;
create trigger message_replies_set_updated_at
  before update on public.message_replies
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 3. IMMUTABLE COLUMNS (mirrors 020 §1)
-- A reply cannot be moved to another post or reattributed. author_id changing
-- TO NULL is allowed: that is ON DELETE SET NULL firing.
-- =============================================================================

create or replace function public.guard_message_reply_immutable_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.message_id is distinct from old.message_id then
    raise exception 'A reply cannot be moved to another message.'
      using errcode = '42501';
  end if;

  if new.author_id is distinct from old.author_id and new.author_id is not null then
    raise exception 'A reply''s author cannot be changed.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists message_replies_guard_immutable_columns on public.message_replies;
create trigger message_replies_guard_immutable_columns
  before update on public.message_replies
  for each row execute function public.guard_message_reply_immutable_columns();


-- =============================================================================
-- 4. RLS
-- Reading and writing use the SAME test. A client on an internal post fails it:
-- select returns zero rows, insert is rejected.
-- =============================================================================

alter table public.message_replies enable row level security;

drop policy if exists "message_replies: read with message" on public.message_replies;
create policy "message_replies: read with message"
  on public.message_replies for select
  using (public.can_read_message(message_id));

drop policy if exists "message_replies: insert own" on public.message_replies;
create policy "message_replies: insert own"
  on public.message_replies for insert
  with check (
    author_id = auth.uid()
    and public.can_read_message(message_id)
  );

drop policy if exists "message_replies: update own" on public.message_replies;
create policy "message_replies: update own"
  on public.message_replies for update
  using (
    author_id = auth.uid()
    and public.can_read_message(message_id)
  )
  with check (
    author_id = auth.uid()
    and public.can_read_message(message_id)
  );

drop policy if exists "message_replies: delete own" on public.message_replies;
create policy "message_replies: delete own"
  on public.message_replies for delete
  using (
    author_id = auth.uid()
    and public.can_read_message(message_id)
  );

drop policy if exists "message_replies: admin deletes any" on public.message_replies;
create policy "message_replies: admin deletes any"
  on public.message_replies for delete
  using (public.is_admin());


-- =============================================================================
-- 5. NOTIFICATIONS
--
-- reply_id scopes de-duplication. Without it, "has this user already been
-- notified about this message?" would match rows from EARLIER replies and
-- silently swallow the new one.
-- =============================================================================

alter table public.notifications
  add column if not exists reply_id uuid
  references public.message_replies(id) on delete cascade;

create index if not exists idx_notifications_reply_id
  on public.notifications (reply_id);

-- Widening an allow-list: existing rows already satisfy it, so NOT VALID keeps
-- this off the ACCESS EXCLUSIVE validation path on a high-write table.
alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('mention', 'task_assigned', 'client_task', 'client_message', 'message_mention', 'message_reply'))
  not valid;


-- =============================================================================
-- 6. MENTION NOTIFICATIONS ON A REPLY
--
-- Same recipient rule as 021's post mentions: not the author, approved, admin
-- or member of the post's project, and never a client when the post is
-- internal. Type 'message_mention', so existing bell/push/email copy applies.
--
-- Fires on INSERT only. Editing a reply notifies nobody, including for a newly
-- added mention — a deliberate simplification over posts.
-- =============================================================================

create or replace function public.notify_message_reply_mentions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid;
  v_message record;
begin
  select m.project_id, m.is_client_visible into v_message
  from public.messages m where m.id = new.message_id;

  foreach v_uid in array coalesce(new.mentions, '{}') loop
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
            where pm.project_id = v_message.project_id and pm.user_id = v_uid
          )
        )
        and (v_message.is_client_visible or u.role <> 'client')
    ) then
      continue;
    end if;

    if exists (
      select 1 from public.notifications n
      where n.user_id = v_uid and n.reply_id = new.id
    ) then
      continue;
    end if;

    insert into public.notifications (user_id, actor_id, type, project_id, message_id, reply_id)
    values (v_uid, new.author_id, 'message_mention', v_message.project_id, new.message_id, new.id);
  end loop;

  return new;
end;
$$;

drop trigger if exists message_replies_notify_mentions on public.message_replies;
create trigger message_replies_notify_mentions
  after insert on public.message_replies
  for each row execute function public.notify_message_reply_mentions();


-- =============================================================================
-- 7. THREAD NOTIFICATIONS
--
-- The post's author plus everyone who already replied, minus the replier, minus
-- anyone the mention trigger just notified for THIS reply.
--
-- Trigger order matters: Postgres fires same-event triggers in NAME order, so
-- message_replies_notify_mentions ('m') runs before …_notify_thread ('t') and
-- its rows are visible to the check below. A mention wins over a generic "new
-- reply" — one notification each, with the more specific wording. RENAMING
-- EITHER TRIGGER SILENTLY REINTRODUCES DUPLICATES. (021 carries the same
-- dependency between its client-message and mention triggers.)
-- =============================================================================

create or replace function public.notify_message_reply_thread()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_message record;
begin
  select m.project_id, m.is_client_visible, m.author_id into v_message
  from public.messages m where m.id = new.message_id;

  insert into public.notifications (user_id, actor_id, type, project_id, message_id, reply_id)
  select u.id, new.author_id, 'message_reply', v_message.project_id, new.message_id, new.id
  from public.users u
  where u.approved = true
    and u.id is distinct from new.author_id
    and (v_message.is_client_visible or u.role <> 'client')
    and (
      u.role = 'admin'
      or exists (
        select 1 from public.project_members pm
        where pm.project_id = v_message.project_id and pm.user_id = u.id
      )
    )
    and (
      u.id = v_message.author_id
      or exists (
        select 1 from public.message_replies r
        where r.message_id = new.message_id
          and r.id <> new.id
          and r.author_id = u.id
      )
    )
    and not exists (
      select 1 from public.notifications n
      where n.user_id = u.id and n.reply_id = new.id
    );

  return new;
end;
$$;

comment on function public.notify_message_reply_thread() is
  'Notifies the post author and earlier repliers when a reply lands. Skips the replier and anyone already notified for this reply (mentions run first, by trigger name order). Single source of truth for recipients — the app pushes to exactly these rows.';

drop trigger if exists message_replies_notify_thread on public.message_replies;
create trigger message_replies_notify_thread
  after insert on public.message_replies
  for each row execute function public.notify_message_reply_thread();


-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
--
-- Manual checks after applying:
--   - As a client, select from message_replies for an internal post → 0 rows.
--   - Insert a reply as a client on an internal post via the API → rejected.
--   - Reply to your own post → no notification for yourself.
--   - Mention someone who also replied earlier → exactly one row, message_mention.
--   - Delete the post → its replies and their notifications go too.
-- =============================================================================
