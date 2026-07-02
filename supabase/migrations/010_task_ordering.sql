-- =============================================================================
-- WEBLIKHA PORTAL — TASK ORDERING
-- Migration: 010_task_ordering.sql
--
-- Changes:
--   1. Add position column to tasks (task_lists already has one)
--   2. Backfill per list in creation order
--
-- Run via: Supabase Dashboard → SQL Editor
-- =============================================================================

alter table public.tasks
  add column position integer not null default 0;

comment on column public.tasks.position is
  'Sort order within the task list. Reordered via up/down controls in the UI.';

-- Backfill: number existing tasks within each list by creation time
with numbered as (
  select id,
         row_number() over (
           partition by task_list_id
           order by created_at
         ) - 1 as rn
  from public.tasks
)
update public.tasks t
set position = n.rn
from numbered n
where t.id = n.id;

create index idx_tasks_list_position on public.tasks(task_list_id, position);

-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
-- =============================================================================
