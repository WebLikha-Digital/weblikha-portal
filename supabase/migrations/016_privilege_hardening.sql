-- =============================================================================
-- WEBLIKHA PORTAL — PRIVILEGE HARDENING
-- Migration: 016_privilege_hardening.sql
--
-- Three privilege-escalation holes, all reachable from a browser with nothing
-- but the public anon key and the user's own session cookie. PostgREST is
-- directly addressable, so a server action that refuses a write is not a
-- security boundary — only RLS and triggers are.
--
--   1. CRITICAL — self-promotion to admin. "users: update own profile"
--      (migration 001) declares only USING, so Postgres reuses that expression
--      as the WITH CHECK. It constrains id and nothing else, so any signed-in
--      user could PATCH their own users row with {"role":"admin",
--      "approved":true} and become an admin. is_admin() then returns true
--      everywhere, which bypasses every other guard in the schema — including
--      migrations 014 and 015 — and opens revenue_entries and project budgets.
--
--   2. Providers could mint unlimited incentive points. Neither "tasks:
--      assignee updates status" (001, narrowed in 015) nor "tasks: provider
--      claims unassigned" (014) constrains points_value, so an assignee could
--      PATCH {"status":"done","points_value":5000} and let the security
--      definer award_task_points trigger write that number into their
--      performance_periods row. The loyalty threshold is 1,000 pts/month, so
--      this has money attached.
--
--   3. Project-hopping on two client policies. 015 added
--      is_project_member(project_id) to "tasks: client edits own pending".
--      The sibling policies "task_lists: client renames own" and "messages:
--      client edits own" (both 014) still had the same gap: their INSERT
--      counterparts check membership, their UPDATE with check did not, so a
--      client could PATCH project_id on a phase or message they authored into
--      a project they are not a member of.
--
-- WHY TRIGGERS FOR 1 AND 2, NOT A REWRITTEN WITH CHECK: a WITH CHECK sees
-- only the NEW row, so it cannot express "this column did not change". The
-- obvious workaround — comparing NEW.role against public.get_user_role() —
-- leans on snapshot-visibility semantics that are easy to get subtly wrong and
-- hard to audit. A BEFORE UPDATE trigger compares OLD and NEW directly.
--
-- WHY NOT `REVOKE UPDATE (role, approved) ON public.users FROM authenticated`:
-- approveUser in src/app/(portal)/settings/actions.ts performs the approval as
-- the signed-in admin's own session, not the service role, so a column-level
-- revoke would break admin approvals. The trigger's admin branch is written to
-- allow an admin session through, not only the service role.
--
-- NOTE ON 014: the policy bodies recreated in section 3 are backported into
-- 014 in the same commit. 014 is applied by hand through the SQL Editor and is
-- re-runnable, so a later re-run must not silently revert 015 or 016.
--
-- Run via: Supabase Dashboard -> SQL Editor, or `supabase db push`
-- Safe to re-run: every create is preceded by a drop ... if exists.
-- =============================================================================


-- =============================================================================
-- 1. CRITICAL — users.role / users.approved / users.email ARE ADMIN-ONLY
--
-- Exploit as it stood: a provider or client opens devtools and issues
--   PATCH /rest/v1/users?id=eq.<their own uuid>
--   {"role":"admin","approved":true}
-- with the anon key and their session JWT. "users: update own profile" passes
-- (auth.uid() = id), there is no WITH CHECK of its own, no column REVOKE and
-- no guarding trigger — so the write lands and they are an admin.
--
-- auth.uid() IS NULL means "no end user behind this statement":
--   * the service role key's JWT carries no `sub` claim, so every write from
--     createAdminClient() (invite / revoke / restore in clients/actions.ts)
--     sees a null uid;
--   * SQL Editor and psql maintenance set no request JWT at all;
--   * handle_new_auth_user (migration 003) INSERTs rather than UPDATEs, so it
--     never reaches this trigger, but the same allowance covers any future
--     definer code that does update the row.
-- Letting a null uid through is not an anon-key hole: the only UPDATE policy
-- on public.users requires auth.uid() = id or is_admin(), and both are false
-- for an anonymous request, so an anon caller can never make a row visible to
-- update in the first place.
--
-- auth.uid() is read from the request JWT GUC, not from the database role, so
-- it keeps returning the calling user's id inside a SECURITY DEFINER function
-- too — a definer RPC cannot be used to launder a role change past this.
--
-- The function is SECURITY INVOKER (the default) on purpose: it reads no table
-- directly, and public.is_admin() is already SECURITY DEFINER, so nothing here
-- needs the owner's rights.
-- =============================================================================

create or replace function public.guard_user_privileged_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- No end user behind this statement (service role, definer code, psql).
  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only an admin can change a user role.'
      using errcode = '42501';
  end if;

  if new.approved is distinct from old.approved then
    raise exception 'Only an admin can change approval status.'
      using errcode = '42501';
  end if;

  -- public.users.email mirrors auth.users.email and the app has no
  -- email-change flow. A self-service change here would silently desync the
  -- two and break the invite/resend lookups, which key off this column.
  if new.email is distinct from old.email then
    raise exception 'Only an admin can change a user email.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_user_privileged_columns() is
  'Blocks non-admin changes to users.role / users.approved / users.email. The 001 UPDATE policy has no WITH CHECK of its own, so without this a user could PATCH themselves to role = admin. Allows auth.uid() IS NULL so the service role and definer code keep working.';

drop trigger if exists users_guard_privileged_columns on public.users;
create trigger users_guard_privileged_columns
  before update on public.users
  for each row execute function public.guard_user_privileged_columns();


-- =============================================================================
-- 2. tasks.points_value IS ADMIN-ONLY
--
-- Exploit as it stood: a provider assignee PATCHes their own task with
-- {"status":"done","points_value":5000}. "tasks: assignee updates status"
-- permits it (it asks only assignee_id = auth.uid() and non-client), and the
-- security definer award_task_points trigger then adds 5000 task_points plus
-- the 30-point deadline bonus to their performance_periods row.
--
-- What must keep working, and does:
--   * a provider assignee flipping their own task to 'done' — points_value is
--     unchanged, so the guard never fires;
--   * a client filing a task at 0 points (014) — the insert branch allows the
--     client role at exactly 0, which is what 014's WITH CHECK already forces;
--   * an admin triaging a client task from 0 to 60 — the admin branch returns
--     early;
--   * applyTemplate and createTask, which run as the signed-in admin;
--   * reorder_task (012) and the claim policy (014), neither of which touches
--     points_value.
-- Only a *change* to points_value by a non-admin is refused.
--
-- The INSERT branch is defence in depth: today the only insert policies on
-- tasks are "tasks: admin inserts" (001) and "tasks: client files own" (014),
-- so a provider cannot insert at all. If that is ever loosened they must not
-- inherit the ability to pick their own payout. 60 is the tasks.points_value
-- column default from migration 001.
-- =============================================================================

create or replace function public.guard_task_points_value()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Service role / definer maintenance, and admins, may set any value.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.points_value is distinct from old.points_value then
      raise exception 'Only an admin can change the points value of a task.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- INSERT
  if public.get_user_role() = 'client' then
    -- Mirrors 014's "tasks: client files own" WITH CHECK: client-filed work is
    -- worth nothing until an admin triages it.
    if new.points_value <> 0 then
      raise exception 'Client-filed tasks are worth 0 points until an admin triages them.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.points_value is distinct from 60 then
    raise exception 'Only an admin can choose the points value of a task.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_task_points_value() is
  'Blocks non-admin changes to tasks.points_value. Without it an assignee could PATCH points_value alongside status = done and have the security definer award_task_points trigger mint arbitrary incentive points.';

-- Fires on every update rather than `update of points_value`: that form fires
-- only when the column is named in the statement, which is the attacker's
-- choice, so it is no basis for a guard.
drop trigger if exists tasks_guard_points_value on public.tasks;
create trigger tasks_guard_points_value
  before insert or update on public.tasks
  for each row execute function public.guard_task_points_value();


-- =============================================================================
-- 3. CLIENT PHASE AND MESSAGE EDITS MUST STAY INSIDE THE CLIENT'S PROJECTS
--
-- Both policies are recreated verbatim from 014 with a single clause added to
-- WITH CHECK: public.is_project_member(project_id). USING is untouched — a
-- client may still only target rows they authored — so only the destination
-- project is newly constrained, exactly as 015 did for client task edits.
--
-- Unlike the task case (015), nothing else stood in the way here: there is no
-- project-consistency trigger on task_lists or messages, so the project_id
-- rewrite succeeded outright and injected the client's content into a project
-- they were not a member of.
-- =============================================================================

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
    and public.is_project_member(project_id)
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
    and public.is_project_member(project_id)
  );


-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
--
-- Sanity checks worth running from a non-admin session:
--   update public.users set role = 'admin' where id = auth.uid();       -- fails
--   update public.tasks set points_value = 5000 where id = '<own task>'; -- fails
--   update public.tasks set status = 'done'  where id = '<own task>';    -- succeeds
-- =============================================================================
