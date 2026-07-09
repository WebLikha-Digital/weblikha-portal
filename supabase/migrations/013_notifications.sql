-- =============================================================================
-- WEBLIKHA PORTAL — IN-APP NOTIFICATIONS
-- Migration: 013_notifications.sql
--
-- Changes:
--   1. notifications table + indexes + RLS (recipient-only access)
--   2. Trigger: @mention in a task comment → notification per mentioned user
--   3. Trigger: task assigned → notification for the new assignee
--   4. is_approved_member() helper + users directory read policy — providers
--      could previously only read their own users row, so a provider's bell
--      couldn't show who mentioned them and mention emails couldn't resolve
--      recipient addresses.
--
-- Inserts happen ONLY via the security definer trigger functions (table owner
-- bypasses RLS), so no insert policy is defined.
--
-- Run via: Supabase Dashboard → SQL Editor, or `supabase db push`
-- =============================================================================

-- ── 1. Table ───────────────────────────────────────────────────────────────────

create table public.notifications (
  id         uuid        default gen_random_uuid() primary key,
  user_id    uuid        not null references public.users(id) on delete cascade,
  actor_id   uuid        references public.users(id) on delete set null,
  type       text        not null check (type in ('mention', 'task_assigned')),
  project_id uuid        not null references public.projects(id) on delete cascade,
  task_id    uuid        references public.tasks(id) on delete cascade,
  comment_id uuid        references public.task_comments(id) on delete cascade,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.notifications is
  'In-app notifications. Rows are inserted by security definer triggers (mentions, assignments); recipients read/update/delete their own.';

create index idx_notifications_user_created on public.notifications(user_id, created_at desc);
create index idx_notifications_user_unread  on public.notifications(user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications: read own"
  on public.notifications for select
  using (user_id = auth.uid());

create policy "notifications: mark own read"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notifications: delete own"
  on public.notifications for delete
  using (user_id = auth.uid());

-- ── 2. Mention notifications ───────────────────────────────────────────────────

create or replace function public.notify_comment_mentions()
returns trigger
language plpgsql
security definer
as $$
declare
  v_project uuid;
  v_new     uuid[];
  v_uid     uuid;
begin
  if tg_op = 'INSERT' then
    v_new := coalesce(new.mentions, '{}');
  else
    -- Only users newly added to the mentions array on edit
    select coalesce(array_agg(m), '{}') into v_new
    from unnest(coalesce(new.mentions, '{}')) m
    where not (m = any(coalesce(old.mentions, '{}')));
  end if;

  select project_id into v_project from public.tasks where id = new.task_id;
  if v_project is null then
    return new;
  end if;

  foreach v_uid in array v_new loop
    if v_uid is distinct from new.author_id then
      insert into public.notifications (user_id, actor_id, type, project_id, task_id, comment_id)
      values (v_uid, new.author_id, 'mention', v_project, new.task_id, new.id);

      -- Opportunistic prune: keep the recipient's read history bounded
      delete from public.notifications
      where user_id = v_uid
        and read_at is not null
        and created_at < now() - interval '90 days';
    end if;
  end loop;

  return new;
end;
$$;

create trigger task_comments_notify_mentions
  after insert or update of mentions on public.task_comments
  for each row execute function public.notify_comment_mentions();

-- ── 3. Assignment notifications ────────────────────────────────────────────────

create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and new.assignee_id is distinct from auth.uid()  -- no self-notify (e.g. claiming)
  then
    insert into public.notifications (user_id, actor_id, type, project_id, task_id)
    values (new.assignee_id, auth.uid(), 'task_assigned', new.project_id, new.id);

    delete from public.notifications
    where user_id = new.assignee_id
      and read_at is not null
      and created_at < now() - interval '90 days';
  end if;

  return new;
end;
$$;

create trigger tasks_notify_assignment
  after insert or update of assignee_id on public.tasks
  for each row execute function public.notify_task_assignment();

-- ── 4. Users directory read for approved members ───────────────────────────────

-- security definer avoids infinite RLS recursion (users policy querying users)
create or replace function public.is_approved_member()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select approved from public.users where id = auth.uid()),
    false
  );
$$;

comment on function public.is_approved_member is
  'True when the current auth user exists and is approved. security definer so the users RLS policy can reference the users table without recursing.';

create policy "users: approved members read directory"
  on public.users for select
  using (public.is_approved_member());

-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
-- =============================================================================
