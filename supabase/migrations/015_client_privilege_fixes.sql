-- =============================================================================
-- WEBLIKHA PORTAL — CLIENT PRIVILEGE FIXES
-- Migration: 015_client_privilege_fixes.sql
--
-- Migration 014 made clients real project_members, but two RLS gaps let a
-- client-role user reach beyond what 014 intended:
--
--   1. "tasks: assignee updates status" (migration 001) restricts neither
--      status, points_value, nor the actor's role. It only requires
--      assignee_id = auth.uid(). Because 014's "tasks: client files own"
--      insert policy lets a client set assignee_id to any project member
--      (including themselves), a client can self-assign a task and then
--      rely on THIS policy — not any client policy — to flip it to
--      status: 'done' with an arbitrary points_value. Postgres RLS
--      permissive policies OR together, so this 001 policy grants exactly
--      what 014's client policies were written to forbid. The
--      security-definer award_task_points trigger then mints a real
--      performance_periods row from a number the client chose.
--
--   2. "tasks: client edits own pending" (migration 014) checks
--      is_project_member(project_id) on INSERT (via the sibling "tasks:
--      client files own" policy) but not on UPDATE's with check. A client
--      can therefore PATCH project_id on their own still-pending task to a
--      project they are not a member of.
--
-- Run via: Supabase Dashboard -> SQL Editor, or `supabase db push`
-- =============================================================================


-- =============================================================================
-- 1. TASK STATUS/POINTS UPDATES MUST EXCLUDE CLIENTS
--
-- Exploit: a client inserts a task with assignee_id = themself (accepted at
-- 0 points, status 'pending' — 014's insert policy allows self-assignment
-- since a client is a project member). They then PATCH
-- {status: 'done', points_value: 5000}. 014's "tasks: client edits own
-- pending" with check rejects that (points_value must stay 0, status must
-- stay 'pending'), but this 001 policy's using/with check ask only
-- "assignee_id = auth.uid()" — no role check — so it independently permits
-- the same write. Permissive RLS policies OR together, so the 014
-- restriction is moot as long as this 001 policy stands unchanged.
--
-- Fix: exclude the client role from the assignee branch. The admin branch
-- is untouched — admins can still update any task via this policy.
-- =============================================================================

drop policy if exists "tasks: assignee updates status" on public.tasks;
create policy "tasks: assignee updates status"
  on public.tasks for update
  using ((assignee_id = auth.uid() and public.get_user_role() <> 'client') or public.is_admin())
  with check ((assignee_id = auth.uid() and public.get_user_role() <> 'client') or public.is_admin());


-- =============================================================================
-- 2. CLIENT TASK EDITS MUST STAY INSIDE THE CLIENT'S OWN PROJECT
--
-- 014's "tasks: client files own" (insert) requires
-- is_project_member(project_id). Its sibling "tasks: client edits own
-- pending" (update) never required it in with check, so a client's PATCH
-- could rewrite project_id to a project they do not belong to as long as
-- the task stayed their own and pending. using is left exactly as 014 wrote
-- it — a client may still only target rows they created that are still
-- pending; only the destination project_id is now constrained.
--
-- In practice this was bounded rather than a silent full takeover: for a
-- task that already belongs to a phase (task_list_id set), migration 004's
-- consistency trigger raises a data-integrity exception on any update that
-- changes project_id while task_list_id still points at a task_lists row
-- in the OLD project, so the bare move fails outright. It does not null
-- task_list_id automatically — a client task with no phase (task_list_id
-- null), or a write that explicitly nulls task_list_id in the same PATCH,
-- was not protected by that trigger, which is why this with check gap
-- still needed closing directly.
-- =============================================================================

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
    and public.is_project_member(project_id)
    and (assignee_id is null or public.is_member_of(project_id, assignee_id))
  );


-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
-- =============================================================================
