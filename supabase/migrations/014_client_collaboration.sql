-- =============================================================================
-- WEBLIKHA PORTAL — CLIENT COLLABORATION
-- Migration: 014_client_collaboration.sql
--
-- Lets the `client` role participate in projects they are assigned to — file
-- tasks, add phases, post on the message board — without ever reaching
-- financial data or moving the needle on team incentive points.
--
-- Changes:
--   1. created_by on tasks + task_lists (drives the "Added by client" badge)
--   2. updated_at + trigger on task_lists (last child table missing it)
--   3. award_task_points: deadline bonus gated on points_value > 0, so a
--      zero-point client task can no longer pay out the flat +30
--   4. SECURITY FIX: restrict the claim-unassigned policy to providers.
--      Clients become project members in this migration and would otherwise
--      be able to claim team work and assign it to themselves.
--   5. is_member_of(pid, uid) helper — membership check for a given user
--   6. notifications.type widened for client_task / client_message
--   7. Client RLS — create/edit/delete own tasks + phases, post messages.
--      points_value = 0 and is_client_visible = true are enforced in
--      WITH CHECK, so they hold even if a server action is wrong.
--   8. client_projects view — budget-free projection for client screens
--
-- NOTE ON ROLE ASSIGNMENT: invited clients are promoted by the invite server
-- action (service role), NOT by reading a role out of raw_user_meta_data.
-- User metadata is writable by the signing-up user, so trusting it would let
-- anyone self-register as an admin. handle_new_auth_user is left untouched.
--
-- Run via: Supabase Dashboard -> SQL Editor, or `supabase db push`
-- =============================================================================


-- =============================================================================
-- 1. TRACK WHO CREATED TASKS AND PHASES
-- =============================================================================

alter table public.tasks
  add column if not exists created_by uuid references public.users(id) on delete set null;

alter table public.task_lists
  add column if not exists created_by uuid references public.users(id) on delete set null;

create index if not exists idx_tasks_created_by      on public.tasks(created_by);
create index if not exists idx_task_lists_created_by on public.task_lists(created_by);

comment on column public.tasks.created_by is
  'Who filed this task. Null for rows predating migration 014. Joined against users.role to badge client-filed work.';
comment on column public.task_lists.created_by is
  'Who created this phase. Null for rows predating migration 014.';


-- =============================================================================
-- 2. updated_at ON task_lists
-- =============================================================================

alter table public.task_lists
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists task_lists_set_updated_at on public.task_lists;
create trigger task_lists_set_updated_at
  before update on public.task_lists
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 3. POINTS: DEADLINE BONUS MUST RESPECT points_value = 0
--
-- The bonus was a flat +30 gated only on the due date, so a zero-point client
-- task completed on time still paid out 30 points. Both the award and the
-- reversal branch now require points_value > 0.
--
-- Caveat unchanged from before: the reversal uses the task's CURRENT
-- points_value. Triage a client task (0 -> 60) BEFORE it is completed, not
-- after, or the reversal maths will not match what was awarded.
-- =============================================================================

create or replace function public.award_task_points()
returns trigger
language plpgsql
security definer
as $$
declare
  v_month integer;
  v_year  integer;
  v_deadline_bonus integer;
begin
  -- Task flips TO 'done': stamp completed_at + award points
  if new.status = 'done' and old.status <> 'done' and new.assignee_id is not null then

    v_month := extract(month from now());
    v_year  := extract(year  from now());

    -- Deadline bonus: +30 if completed on or before due_date, and only for
    -- tasks that carry points at all (client-filed tasks are worth 0 until
    -- an admin triages them).
    v_deadline_bonus := case
      when new.points_value > 0 and now()::date <= new.due_date then 30
      else 0
    end;

    new.completed_at = now();

    insert into public.performance_periods
      (user_id, period_month, period_year, task_points, deadline_points)
    values
      (new.assignee_id, v_month, v_year, new.points_value, v_deadline_bonus)
    on conflict (user_id, period_month, period_year)
    do update set
      task_points     = performance_periods.task_points     + excluded.task_points,
      deadline_points = performance_periods.deadline_points + excluded.deadline_points,
      updated_at      = now();

  -- Task flips OUT of 'done': clear completed_at + deduct the points that
  -- were awarded, from the period in which it was completed
  elsif old.status = 'done' and new.status <> 'done' then

    if old.assignee_id is not null and old.completed_at is not null then

      v_month := extract(month from old.completed_at);
      v_year  := extract(year  from old.completed_at);

      v_deadline_bonus := case
        when old.points_value > 0 and old.completed_at::date <= old.due_date then 30
        else 0
      end;

      update public.performance_periods
      set
        task_points     = task_points     - old.points_value,
        deadline_points = deadline_points - v_deadline_bonus,
        updated_at      = now()
      where user_id      = old.assignee_id
        and period_month = v_month
        and period_year  = v_year;

    end if;

    new.completed_at = null;

  end if;

  return new;
end;
$$;


-- =============================================================================
-- 4. SECURITY FIX — ONLY PROVIDERS MAY CLAIM UNASSIGNED WORK
--
-- Migration 011's policy allowed any project member to claim an unassigned
-- task. Clients are project members from this migration onward, so without
-- this change a client could assign team work to themselves.
-- =============================================================================

drop policy if exists "tasks: member claims unassigned" on public.tasks;
drop policy if exists "tasks: provider claims unassigned" on public.tasks;

create policy "tasks: provider claims unassigned"
  on public.tasks for update
  using (
    assignee_id is null
    and public.get_user_role() = 'provider'
    and public.is_project_member(project_id)
  )
  with check (
    assignee_id = auth.uid()
    and public.get_user_role() = 'provider'
  );


-- =============================================================================
-- 5. MEMBERSHIP HELPER FOR AN ARBITRARY USER
--
-- is_project_member(pid) answers "am I a member". Client policies also need
-- "is this OTHER user a member" to validate an assignee.
-- =============================================================================

create or replace function public.is_member_of(pid uuid, uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = pid
      and pm.user_id    = uid
  );
$$;

comment on function public.is_member_of is
  'True when the given user is a member of the given project. security definer so RLS policies can validate an assignee without recursive policy checks.';


-- =============================================================================
-- 6. NOTIFICATION TYPES FOR CLIENT ACTIVITY
-- =============================================================================

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in ('mention', 'task_assigned', 'client_task', 'client_message'));


-- =============================================================================
-- 7. CLIENT WRITE POLICIES
--
-- Guarantees enforced here rather than in server actions:
--   * a client-filed task is always worth 0 points
--   * a client can never mark a task done (status stays 'pending' on write)
--   * a client can only assign to someone already on that project
--   * a client message is always client-visible (otherwise they could post
--     something RLS then hides from them)
-- =============================================================================

-- ── Tasks ────────────────────────────────────────────────────────────────────

drop policy if exists "tasks: client files own" on public.tasks;
create policy "tasks: client files own"
  on public.tasks for insert
  with check (
    public.get_user_role() = 'client'
    and public.is_project_member(project_id)
    and created_by   = auth.uid()
    and points_value = 0
    and status       = 'pending'
    and (assignee_id is null or public.is_member_of(project_id, assignee_id))
  );

drop policy if exists "tasks: client edits own pending" on public.tasks;
create policy "tasks: client edits own pending"
  on public.tasks for update
  using (
    public.get_user_role() = 'client'
    and created_by = auth.uid()
    and status     = 'pending'
  )
  with check (
    public.get_user_role() = 'client'
    and created_by   = auth.uid()
    and points_value = 0
    and status       = 'pending'
    and (assignee_id is null or public.is_member_of(project_id, assignee_id))
  );

drop policy if exists "tasks: client deletes own pending" on public.tasks;
create policy "tasks: client deletes own pending"
  on public.tasks for delete
  using (
    public.get_user_role() = 'client'
    and created_by = auth.uid()
    and status     = 'pending'
  );

-- ── Task lists (phases) ──────────────────────────────────────────────────────

drop policy if exists "task_lists: client creates own" on public.task_lists;
create policy "task_lists: client creates own"
  on public.task_lists for insert
  with check (
    public.get_user_role() = 'client'
    and public.is_project_member(project_id)
    and created_by = auth.uid()
  );

drop policy if exists "task_lists: client renames own" on public.task_lists;
create policy "task_lists: client renames own"
  on public.task_lists for update
  using (
    public.get_user_role() = 'client'
    and created_by = auth.uid()
  )
  with check (
    public.get_user_role() = 'client'
    and created_by = auth.uid()
  );

-- Deleting a phase sets task_list_id to null on its tasks (migration 002), so
-- a client could orphan team work. The delete server action additionally
-- refuses when the phase holds any task the client did not file.
drop policy if exists "task_lists: client deletes own" on public.task_lists;
create policy "task_lists: client deletes own"
  on public.task_lists for delete
  using (
    public.get_user_role() = 'client'
    and created_by = auth.uid()
  );

-- ── Messages ─────────────────────────────────────────────────────────────────

drop policy if exists "messages: client posts shared" on public.messages;
create policy "messages: client posts shared"
  on public.messages for insert
  with check (
    public.get_user_role() = 'client'
    and public.is_project_member(project_id)
    and author_id         = auth.uid()
    and is_client_visible = true
  );

drop policy if exists "messages: client edits own" on public.messages;
create policy "messages: client edits own"
  on public.messages for update
  using (
    public.get_user_role() = 'client'
    and author_id = auth.uid()
  )
  with check (
    public.get_user_role() = 'client'
    and author_id         = auth.uid()
    and is_client_visible = true
  );

drop policy if exists "messages: client deletes own" on public.messages;
create policy "messages: client deletes own"
  on public.messages for delete
  using (
    public.get_user_role() = 'client'
    and author_id = auth.uid()
  );


-- =============================================================================
-- 8. BUDGET-FREE PROJECT PROJECTION FOR CLIENT SCREENS
--
-- RLS is row-level, so the "projects: member or admin" policy hands clients
-- the whole row including budget. Client-facing queries read this view
-- instead. security_invoker keeps the caller's RLS in force.
-- =============================================================================

drop view if exists public.client_projects;
create view public.client_projects
with (security_invoker = true)
as
  select
    p.id,
    p.name,
    p.client_name,
    p.status,
    p.start_date,
    p.end_date,
    p.description,
    p.created_at
  from public.projects p;

comment on view public.client_projects is
  'Projects without budget or created_by, for client-facing screens. security_invoker means the caller RLS on public.projects still applies.';

grant select on public.client_projects to authenticated;


-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
-- =============================================================================
