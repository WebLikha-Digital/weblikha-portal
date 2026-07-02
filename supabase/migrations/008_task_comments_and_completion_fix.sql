-- =============================================================================
-- WEBLIKHA PORTAL — TASK COMMENTS + COMPLETION INTEGRITY FIX
-- Migration: 008_task_comments_and_completion_fix.sql
--
-- Changes:
--   1. New task_comments table — threaded discussion per to-do item
--   2. Fix award_task_points trigger:
--      a. Clear completed_at when a task is moved OUT of 'done'
--      b. Deduct points on un-done so re-completing cannot double-award
--
-- Run via: Supabase Dashboard → SQL Editor
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TASK COMMENTS
-- ─────────────────────────────────────────────────────────────────────────────

create table public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks(id) on delete cascade,
  author_id  uuid references public.users(id) on delete set null,
  body       text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

comment on table public.task_comments is
  'Discussion thread per task. Visible to admins and members of the task''s project.';

create index idx_task_comments_task_id    on public.task_comments(task_id);
create index idx_task_comments_created_at on public.task_comments(task_id, created_at);

alter table public.task_comments enable row level security;

-- Admin: full access
create policy "task_comments: admin all"
  on public.task_comments for all
  using (public.is_admin())
  with check (public.is_admin());

-- Project members: read comments on tasks in their projects
create policy "task_comments: members read"
  on public.task_comments for select
  using (
    exists (
      select 1
      from public.tasks t
      join public.project_members pm on pm.project_id = t.project_id
      where t.id = task_comments.task_id
        and pm.user_id = auth.uid()
    )
  );

-- Project members: comment as themselves on tasks in their projects
create policy "task_comments: members insert"
  on public.task_comments for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1
      from public.tasks t
      join public.project_members pm on pm.project_id = t.project_id
      where t.id = task_comments.task_id
        and pm.user_id = auth.uid()
    )
  );

-- Authors: delete their own comments
create policy "task_comments: author deletes own"
  on public.task_comments for delete
  using (author_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. COMPLETION INTEGRITY FIX
--    Previously: completed_at was never cleared when a task left 'done',
--    and points were never deducted — so toggling done → pending → done
--    double-awarded points.
-- ─────────────────────────────────────────────────────────────────────────────

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

    -- Deadline bonus: +30 if completed on or before due_date
    v_deadline_bonus := case
      when now()::date <= new.due_date then 30
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

      -- Reverse the deadline bonus only if it was earned at completion time
      v_deadline_bonus := case
        when old.completed_at::date <= old.due_date then 30
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
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
-- =============================================================================
