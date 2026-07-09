-- =============================================================================
-- WEBLIKHA PORTAL — CLAIM UNASSIGNED TASKS
-- Migration: 011_claim_unassigned_tasks.sql
--
-- Changes:
--   1. is_project_member(uuid) helper — reusable membership check for RLS
--   2. New tasks UPDATE policy: a project member may claim an UNASSIGNED task
--      by setting assignee_id to themselves. Field-level restraint (only
--      assignee_id changes during a claim) is enforced by the claimTask
--      server action.
--
-- Run via: Supabase Dashboard → SQL Editor, or `supabase db push`
-- =============================================================================

create or replace function public.is_project_member(pid uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = pid
      and pm.user_id    = auth.uid()
  );
$$;

comment on function public.is_project_member is
  'True when the current auth user is a member of the given project. security definer so RLS policies can use it without recursive policy checks.';

-- Members can claim unassigned tasks in their projects (assignee must become themselves)
create policy "tasks: member claims unassigned"
  on public.tasks for update
  using (
    assignee_id is null
    and public.is_project_member(project_id)
  )
  with check (assignee_id = auth.uid());

-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
-- =============================================================================
