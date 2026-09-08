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
--      *** SUPERSEDED — that policy is NEUTRALISED below (commented out).
--          Migration 014 section 4 replaced it with a provider-only version
--          because clients became project_members. See the note at the
--          statement itself, and migration 018 section 5. ***
--
-- Run via: Supabase Dashboard → SQL Editor, or `supabase db push`
-- =============================================================================

-- NOTE — DELIBERATE BACK-PORT FROM MIGRATIONS 017 AND 018.
-- `set search_path` was not in the original 011. It was added by 017 (as
-- `= public`), and 018 established the documented-safe `= public, pg_temp`
-- form that both this copy and 017's own now use.
-- This file is applied by hand through the SQL Editor and advertised as
-- re-runnable, so a re-run of the ORIGINAL text would have silently un-pinned
-- that fix — a SECURITY DEFINER function resolving unqualified names through
-- the CALLER's search_path, with no error and nothing visibly different.
-- Kept in sync on purpose: any future change to this body must be made in
-- BOTH places — here and in the migration that last DEFINES this function,
-- which is 017 section 0, not 018. (018 pins five other definer functions but
-- deliberately leaves is_admin and is_project_member to 017; it only supplied
-- the `, pg_temp` form both files now use.)
create or replace function public.is_project_member(pid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = pid
      and pm.user_id    = auth.uid()
  );
$$;

comment on function public.is_project_member is
  'True when the current auth user is a member of the given project. security definer so RLS policies can use it without recursive policy checks.';

-- ─────────────────────────────────────────────────────────────────────────────
-- NEUTRALISED — DO NOT UNCOMMENT. SUPERSEDED BY MIGRATION 014, SECTION 4.
--
-- This policy let ANY project member claim an unassigned task. Migration 014
-- made clients project_members, which turned it into a privilege hole: a
-- client could assign team work to themselves. 014 drops it by name and
-- replaces it with "tasks: provider claims unassigned", which additionally
-- requires get_user_role() = 'provider' in both USING and WITH CHECK.
--
-- Why it is commented out rather than left in place: this file is applied by
-- hand through the SQL Editor and advertised as re-runnable. There is no
-- `drop policy if exists` in front of the statement, so before 014 a re-run
-- merely errored with "policy already exists" — but once 014 had dropped the
-- policy, a re-run of 011 would have recreated it cleanly and silently handed
-- clients back the ability to claim team work. See migration 018, section 5.
--
-- The live policy is defined ONLY in 014. Change it there.
--
-- create policy "tasks: member claims unassigned"
--   on public.tasks for update
--   using (
--     assignee_id is null
--     and public.is_project_member(project_id)
--   )
--   with check (assignee_id = auth.uid());
-- ─────────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
-- =============================================================================
