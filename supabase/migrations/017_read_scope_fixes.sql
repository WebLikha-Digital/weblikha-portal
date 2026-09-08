-- =============================================================================
-- WEBLIKHA PORTAL — READ SCOPE FIXES
-- Migration: 017_read_scope_fixes.sql
--
-- Migrations 015 and 016 closed WRITE holes. This one closes READ holes: two
-- SELECT policies from 001 that were never revisited, plus the two SECURITY
-- DEFINER helpers that back most of the schema's RLS.
--
--   1. CRITICAL — every task in the database is readable by any project
--      member. "tasks: assignee, member, or admin" (001) contains an inline
--      subquery whose join predicate is written unqualified:
--
--        exists (
--          select 1 from public.project_members pm
--          where pm.project_id = project_id and pm.user_id = auth.uid()
--        )
--
--      Postgres resolves an unqualified name to the INNERMOST scope that
--      offers it. `pm` offers project_id, so the bare `project_id` binds to
--      pm.project_id, not tasks.project_id. The predicate is therefore
--      pm.project_id = pm.project_id — always true — and the EXISTS collapses
--      to "is this user a member of ANY project at all". One membership on one
--      project reads every task row in the database. Migration 014 made
--      clients project members, so this now leaks other clients' work too.
--
--   2. Non-admins can only see their own project_members row, so the project
--      Team tab renders empty. "project_members: see own or admin" (001) is
--      user_id = auth.uid() or is_admin(), which means the project detail
--      page's project_members(*, user: users(*)) embed returns exactly one row
--      — the caller. This has always affected providers as well as clients; it
--      went unnoticed because admins do the member management.
--
--   3. public.is_admin() (001) and public.is_project_member(uuid) (011) are
--      SECURITY DEFINER with no pinned search_path, unlike get_user_role()
--      (004) and is_member_of() (014), which both SET search_path = public.
--      A definer function resolves unqualified names using the CALLER's
--      search_path — the classic privilege-escalation vector.
--
-- WHY THE HELPER RATHER THAN A CORRECTED SUBQUERY IN FIX 1: writing
-- pm.project_id = tasks.project_id would also be correct, but CLAUDE.md's RLS
-- rules require the is_admin() / get_user_role() / is_project_member() /
-- is_member_of() helpers over inline subqueries, and a helper takes its
-- argument by parameter name, so the ambiguity physically cannot recur.
--
-- CORROBORATION: `= project_id` appears exactly once across migrations
-- 001-016 — the line above. The same-shaped bug DID exist a second time, at
-- 001:193 in "projects: member or admin" (pm.project_id = id, where the bare
-- `id` binds to project_members.id), but migration 004 section 3 already
-- replaced that policy with the `id IN (select project_id ...)` form.
-- Everything else is correctly qualified: 002 writes task_lists.project_id /
-- messages.project_id, and 008's "task_comments: members read" writes
-- pm.project_id = t.project_id.
--
-- Run via: Supabase Dashboard -> SQL Editor, or `supabase db push`
-- Safe to re-run: every create policy is preceded by a drop ... if exists, and
-- both functions use create or replace.
-- =============================================================================


-- =============================================================================
-- 0. HARDEN THE HELPERS FIRST (fix 3)
--
-- Done ahead of the policies below because both policies call into these.
-- Bodies and signatures are carried over verbatim from 001 and 011 — the only
-- change is the added `set search_path`. What they return is unchanged.
--
-- NOTE — WIDENED IN PLACE TO MATCH MIGRATION 018. This file originally pinned
-- both functions to the abbreviated `= public`. 018 established
-- `= public, pg_temp` as the documented-safe form: Postgres searches pg_temp
-- FIRST for unqualified relation names unless pg_temp is named explicitly, so
-- `= public` alone can still be fed a caller-created temporary table shadowing
-- a public one. This file is explicitly advertised as re-runnable, so leaving
-- the weaker form here meant a replay of 017 silently downgraded the pin that
-- 001 and 011 already carry. Both lines below now read
-- `= public, pg_temp`; keep all copies in sync — 001 (is_admin), 011
-- (is_project_member) and this file.
--
-- `create or replace` rather than drop + create: policies across tasks,
-- task_lists, messages, projects, users, performance_periods and
-- revenue_entries depend on these, and a drop would refuse or cascade the
-- policies away. Replace leaves every dependent intact.
--
-- Why this matters: a SECURITY DEFINER function runs with the function owner's
-- rights but resolves unqualified object names against the CALLER's
-- search_path. The bodies here happen to schema-qualify their tables
-- (public.users, public.project_members), so there is no known live exploit
-- today — but operators and casts are still resolved through search_path, and
-- any future edit that drops a qualification would become an escalation with
-- no visible warning. Pinning it removes the class of bug, not one instance.
-- =============================================================================

-- public.is_admin() — body verbatim from 001, lines 155-165.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select role = 'admin' from public.users where id = auth.uid()),
    false
  );
$$;

comment on function public.is_admin() is
  'True when the current auth user has role = admin. SECURITY DEFINER bypasses users RLS; search_path pinned to public, pg_temp (017, widened to the form migration 018 established).';

-- public.is_project_member(uuid) — body verbatim from 011, lines 15-26.
-- SECURITY DEFINER is load-bearing here, not incidental: fix 2 below puts this
-- function inside a policy ON public.project_members, and definer is the only
-- reason that does not recurse. See the hazard note in section 2.
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
  'True when the current auth user is a member of the given project. security definer so RLS policies can use it without recursive policy checks; search_path pinned to public, pg_temp (017, widened to the form migration 018 established).';


-- =============================================================================
-- 1. CRITICAL — TASK READS MUST BE SCOPED TO THE TASK'S OWN PROJECT (fix 1)
--
-- THIS IS A TIGHTENING. It REMOVES read access that every project member
-- currently has, and that is precisely the point: a member of project A can
-- today read project B's tasks — titles, descriptions, due dates, assignees —
-- for every project in the database. After this migration they cannot.
--
-- Expect user-visible consequences if anything has been relying on the leak: a
-- provider who was never added to a project but who bookmarked or scripted its
-- task list will start getting empty results. That is correct behaviour.
--
-- The three intended cases all still pass:
--   * ADMIN reads any task            -> public.is_admin() branch, unchanged.
--   * ASSIGNEE reads a task assigned to them even if they are somehow not a
--     member of that project (e.g. removed from project_members while still
--     holding the task) -> assignee_id = auth.uid() branch, unchanged.
--   * MEMBER OF THAT PROJECT reads its tasks -> is_project_member(project_id).
--     Here `project_id` is an argument to a function call evaluated in the
--     OUTER scope, so it unambiguously means tasks.project_id. There is no
--     inner relation for it to bind to.
--
-- Clients keep the access 014 intended: they are project_members, so they
-- still read the full to-do list of their own projects including internal
-- tasks — just not other projects'.
--
-- This is the only SELECT policy on public.tasks, so no other permissive
-- policy ORs the old scope back in.
-- =============================================================================

drop policy if exists "tasks: assignee, member, or admin" on public.tasks;
create policy "tasks: assignee, member, or admin"
  on public.tasks for select
  using (
    public.is_admin()
    or assignee_id = auth.uid()
    or public.is_project_member(project_id)
  );


-- =============================================================================
-- 2. PROJECT MEMBERS SEE THEIR PROJECT'S ROSTER (fix 2)
--
-- Was: user_id = auth.uid() or public.is_admin() — a non-admin reads exactly
-- one row, their own. The Team tab on the project detail page therefore shows
-- nobody but the viewer, for providers and clients alike.
--
-- Now: a member of a project reads every membership row for THAT project.
-- Admins keep full access through the same is_admin() branch. The
-- user_id = auth.uid() branch is deliberately kept as well, so a user can
-- always see their own membership rows.
--
-- Scope note: this exposes the roster (who is on the project, in what
-- role_in_project, since when) to everyone on that project — including
-- clients. That is the agreed client-portal behaviour: the client Team tab
-- shows names and roles. The agency-internal field, users.employment_type,
-- lives on public.users, not here, and its exposure is governed by the users
-- SELECT policy — see "still open" at the foot of this file.
--
-- -------------------------------------------------------------------------
-- !! RECURSION HAZARD — READ BEFORE EDITING THIS POLICY !!
--
-- A policy ON public.project_members whose expression QUERIES
-- public.project_members recurses infinitely: the inner read re-triggers the
-- same policy. Postgres raises
--     42P17  infinite recursion detected in policy for relation
--            "project_members"
-- and, because this is the SELECT policy on the join table every project
-- screen embeds, that error would brick the entire projects section.
--
-- So DO NOT write, in this policy:
--     exists (select 1 from public.project_members pm where ...)
--     project_id in (select project_id from public.project_members where ...)
-- however obvious either looks.
--
-- public.is_project_member(pid) is safe, and is the ONLY reason this policy
-- can be written at all: it is SECURITY DEFINER, so its body runs with the
-- function owner's rights and RLS on public.project_members is not applied to
-- the read inside it. No policy evaluation, no recursion.
--
-- Verified before writing this: migration 011 lines 15-26 declare
--   create or replace function public.is_project_member(pid uuid)
--   returns boolean language sql security definer stable
-- and section 0 of this migration recreates it with the same
-- `security definer` marker (011's own comment states the same intent:
-- "security definer so RLS policies can use it without recursive policy
-- checks"). If a future migration ever converts it to SECURITY INVOKER, this
-- policy becomes an instant 42P17 and must be rewritten in the same change.
--
-- STABLE (not VOLATILE) also matters here: it lets the planner evaluate the
-- call once per distinct project_id rather than once per row.
-- -------------------------------------------------------------------------
-- =============================================================================

drop policy if exists "project_members: see own or admin" on public.project_members;
create policy "project_members: see own or admin"
  on public.project_members for select
  using (
    public.is_admin()
    or user_id = auth.uid()
    or public.is_project_member(project_id)
  );


-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
--
-- -----------------------------------------------------------------------------
-- MANUAL VERIFICATION — these fixes change READ scope on hot paths, so check
-- them in the app, not only in SQL:
--
--   1. TEAM TAB POPULATES. Open a project detail page as a PROVIDER on that
--      project: the Team tab must list every member, not just the viewer.
--      Repeat as a CLIENT on that project — same roster, names and roles.
--      (Before this migration both saw exactly one row: themselves.)
--
--   2. TO-DO LIST STILL LOADS. Same project, Todos tab, as provider, client
--      and admin: phases and tasks all render as before, including tasks
--      assigned to other people and internal (non-client) tasks. An empty or
--      partial list here means fix 1 over-tightened — check that the caller
--      really has a row in project_members for that project.
--
--   3. CROSS-PROJECT TASK READS ARE GONE. As a user who is a member of
--      project A but NOT project B, query project B's tasks directly:
--        select count(*) from public.tasks where project_id = '<project B id>';
--      Must return 0. Before this migration it returned every task in B.
--      Then confirm the same user still gets a non-zero count for project A.
--
--   4. ADMIN IS UNAFFECTED. As admin, every project's tasks and rosters read
--      exactly as before.
--
--   5. NO 42P17. Simply loading any project page exercises the new
--      project_members policy; an "infinite recursion detected in policy"
--      error there means is_project_member lost its SECURITY DEFINER marker.
--
-- -----------------------------------------------------------------------------
-- KNOWN AND STILL OPEN after this migration — not regressions, and out of
-- scope here, but they are read-scope issues in the same neighbourhood:
--
--   * public.users SELECT is still "read own or admin reads all" (001). Any
--     screen that shows another user's name or avatar — the Team tab roster
--     this migration just unblocked, task assignees, comment authors — depends
--     on the embedded users(*) join, which a non-admin cannot read. Fixing
--     project_members does not by itself make names appear; the users policy
--     needs a companion "readable to co-members" branch, and that branch must
--     withhold employment_type from clients (agency-internal, per CLAUDE.md)
--     rather than handing over the whole row. Deliberately not bundled here:
--     it needs a view or column-level decision, not a one-line policy edit.
--   * projects.budget still reaches any member through "projects: member or
--     admin" (RLS is row-level). The client_projects view (014) is the
--     mitigation, and client-facing screens must keep reading it.
-- =============================================================================
