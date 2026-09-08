-- =============================================================================
-- WEBLIKHA PORTAL — CLIENT DELETE SCOPE + SECURITY DEFINER HARDENING
-- Migration: 018_client_delete_and_definer_hardening.sql
--
-- 015 and 016 closed WRITE holes, 017 closed READ holes. This one closes a
-- DELETE-shaped data-loss vector, a drag-and-drop hole that reaches team work
-- through an RPC rather than through a policy, and finishes the SECURITY
-- DEFINER search_path pass 017 started.
--
--   1. CRITICAL — a client can orphan the team's to-dos. tasks.task_list_id is
--      ON DELETE SET NULL (002), and referential actions bypass RLS entirely.
--      "task_lists: client deletes own" (014:302) passes on nothing more than
--      role = 'client' AND created_by = auth.uid(). So: a client on project P
--      creates a phase, an admin files three team tasks into it, and the
--      client sends
--          DELETE /rest/v1/task_lists?id=eq.<phase>
--      straight at PostgREST with the public anon key and their own session
--      JWT. The phase goes, the three team tasks survive with
--      task_list_id = NULL, and they vanish from every screen — the to-do UI
--      only renders tasks nested under a phase. Silent, unrecoverable through
--      the UI, and it destroys work the client never filed.
--
--      deleteTaskList in src/app/(portal)/projects/actions.ts already refuses
--      exactly this. That is not a boundary: PostgREST is directly
--      addressable, so a server action is a convenience, not a guard. Only
--      RLS and triggers count.
--
--   2. A client can drag the team's tasks between phases. public.reorder_task
--      (012) is SECURITY DEFINER and asks only
--          is_admin() OR is_project_member(v_project).
--      014 made clients project members, so a client can move ANY task in
--      their project — including team-created work — into a different phase.
--      That contradicts the documented rule that clients cannot edit work
--      created by the team, and it routes around every client policy in 014,
--      015 and 016 because the RPC runs as the owner.
--
--   3. A revoked client can still delete their own phases and pending tasks.
--      "task_lists: client deletes own" (014:302) and "tasks: client deletes
--      own pending" (014:264) check role and created_by but never membership
--      — unlike their UPDATE siblings, which gained
--      is_project_member(project_id) in 015 and 016. Revoking a client
--      DELETES their project_members rows rather than flipping a flag (see
--      CLAUDE.md — deliberate, because `approved` is only an app-layer gate in
--      (portal)/layout.tsx while RLS keys off membership). A revoked client
--      holding a live session therefore keeps delete rights over content they
--      authored.
--
--   4. Five SECURITY DEFINER functions still resolve unqualified names through
--      the CALLER's search_path. 017 pinned is_admin() and
--      is_project_member(); is_approved_member() (013), award_task_points()
--      (008/014), reorder_task() (012), notify_comment_mentions() (013) and
--      notify_task_assignment() (013) were left.
--
-- WHY `public, pg_temp` AND NOT JUST `public`: PostgreSQL searches pg_temp
-- FIRST for unqualified relation names unless pg_temp is named explicitly in
-- search_path, in which case it is searched at the position given. A definer
-- function pinned to `= public` alone can therefore still be fed a
-- caller-created temporary table shadowing a public one. Naming pg_temp last
-- is the documented-safe form. 004 (get_user_role, check_task_project_
-- consistency), 014 (is_member_of) and 017 (is_admin, is_project_member) all
-- use the abbreviated `= public` — they should be brought in line with this
-- form in a later migration. Deliberately NOT changed here: 017's two
-- functions back every policy in the schema and are better re-touched on
-- their own, not folded into an unrelated fix.
--
-- WHY `create or replace` THROUGHOUT: triggers on tasks and task_comments and
-- the users SELECT policy depend on these functions. A drop would either
-- refuse or cascade the dependents away; replace leaves every one intact.
-- Bodies and signatures below are carried over VERBATIM from the migration
-- that last defined each one — the only change is the added SET search_path,
-- except reorder_task, which also gets fix 2.
--
-- Run via: Supabase Dashboard -> SQL Editor, or `supabase db push`
-- Safe to re-run: every create policy and trigger is preceded by a
-- drop ... if exists, and every function uses create or replace.
-- =============================================================================


-- =============================================================================
-- 1. CRITICAL — A CLIENT MAY NOT DELETE A PHASE HOLDING TEAM WORK (fix 1)
--
-- Enforces at the database exactly what deleteTaskList tries to enforce in the
-- server action. Admins and providers are unaffected: both return early.
--
-- WHY SECURITY DEFINER, AND WHY IT IS LOAD-BEARING HERE:
--
-- The function reads public.tasks to answer "does this phase hold a task the
-- deleting client did not file". Under SECURITY INVOKER that read is filtered
-- by the caller's RLS — and the answer to a security question would then
-- depend on what the attacker happens to be allowed to see. Any task hidden
-- from the client by RLS would simply not appear in the EXISTS, the check
-- would pass vacuously, and the delete would proceed. The check would be
-- weakest in precisely the cases it exists to catch:
--
--   * a REVOKED client (fix 3's scenario) has no project_members row, so
--     017's "tasks: assignee, member, or admin" policy hides every task in
--     the phase. Invoker sees an empty phase and permits the delete;
--   * any future tightening of the tasks SELECT policy — 017's own footer
--     lists more read-scope work as still open — silently weakens the guard
--     with no error and no test failure.
--
-- A guard must see the true row set, not the attacker's view of it, so this
-- is DEFINER with the search_path pinned. It is a read-only existence check
-- that returns nothing but pass/fail, so the elevated rights leak no data:
-- the client learns only what the server action already told them.
--
-- auth.uid() is read from the request JWT GUC rather than the database role,
-- so it still identifies the calling user inside a definer function — a
-- definer RPC cannot be used to launder a client delete past this. The
-- auth.uid() IS NULL early return covers the service role, SQL Editor and
-- psql maintenance, matching the guards in 016.
--
-- `created_by IS DISTINCT FROM auth.uid()` (not `<>`) is deliberate: tasks
-- predating 014 carry created_by = NULL, and `NULL <> uid` is NULL, not true,
-- so a plain inequality would let a phase full of legacy team tasks be
-- deleted. A task the client cannot prove they filed is team work.
--
-- Cascades are safe: dropping a project cascades into task_lists and fires
-- this trigger per row, but only admins can delete a project, and the
-- get_user_role() branch returns early for them.
-- =============================================================================

create or replace function public.guard_client_task_list_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- No end user behind this statement (service role, definer code, psql).
  if auth.uid() is null then
    return old;
  end if;

  -- Admins and providers are untouched by this guard.
  if public.get_user_role() is distinct from 'client' then
    return old;
  end if;

  if exists (
    select 1
    from public.tasks t
    where t.task_list_id = old.id
      and t.created_by is distinct from auth.uid()
  ) then
    raise exception
      'This phase has to-dos you did not file — ask an admin to delete it.'
      using errcode = '42501';
  end if;

  return old;
end;
$$;

comment on function public.guard_client_task_list_delete() is
  'Blocks a client from deleting a phase that holds any task they did not create. tasks.task_list_id is ON DELETE SET NULL (002) and referential actions bypass RLS, so without this a client could orphan team to-dos out of every screen with one PostgREST DELETE. SECURITY DEFINER so the check sees every task in the phase, not only the ones the deleting client can read.';

drop trigger if exists task_lists_guard_client_delete on public.task_lists;
create trigger task_lists_guard_client_delete
  before delete on public.task_lists
  for each row execute function public.guard_client_task_list_delete();


-- =============================================================================
-- 2. CLIENTS MAY ONLY REORDER WORK THEY FILED THEMSELVES (fix 2)
--
-- Body carried over verbatim from 012 lines 16-88. Two changes only:
--   * created_by is now selected alongside project_id / task_list_id;
--   * one new authorisation branch after the existing membership check.
-- Every other behaviour is preserved exactly, including the same-project
-- validation, the clamped splice, the separate source-list renumber on a
-- cross-phase move, and the existing error messages 'Task not found',
-- 'Only project members can reorder tasks' and 'Target phase is not in the
-- same project' — the UI surfaces those strings.
--
-- Admins and providers reach the new branch with get_user_role() = 'admin' or
-- 'provider' and fall straight through it, so their behaviour is byte-for-byte
-- what it was.
--
-- Scope note, stated plainly: a client moving their OWN task into or out of a
-- phase still renumbers the `position` of the team tasks around it. That is
-- inherent to a single ordered list and is not a privilege issue — the team's
-- tasks keep their phase, their assignee and their content. What is now
-- impossible is moving a task the client did not create, which is the part
-- that contradicted the documented client rules.
--
-- SET search_path also lands here, completing fix 4 for this function.
-- =============================================================================

create or replace function public.reorder_task(
  p_task_id    uuid,
  p_to_list_id uuid,
  p_to_index   integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project    uuid;
  v_from_list  uuid;
  v_created_by uuid;
  v_to_project uuid;
  v_ids        uuid[];
  v_index      integer;
  i            integer;
begin
  select project_id, task_list_id, created_by
    into v_project, v_from_list, v_created_by
  from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;

  if not (public.is_admin() or public.is_project_member(v_project)) then
    raise exception 'Only project members can reorder tasks';
  end if;

  -- Clients became project_members in 014, so the membership check above is
  -- satisfied for every task in their project — including team-created work.
  -- A client may only move a to-do they filed themselves. created_by is NULL
  -- on rows predating 014, and IS DISTINCT FROM treats that as "not theirs".
  if public.get_user_role() = 'client'
     and v_created_by is distinct from auth.uid() then
    raise exception 'Clients can only reorder to-dos they created'
      using errcode = '42501';
  end if;

  select project_id into v_to_project
  from public.task_lists where id = p_to_list_id;
  if not found or v_to_project <> v_project then
    raise exception 'Target phase is not in the same project';
  end if;

  -- Target order without the moved task (source == target for same-list moves)
  select coalesce(array_agg(id order by position), '{}')
    into v_ids
  from public.tasks
  where task_list_id = p_to_list_id and id <> p_task_id;

  -- Renumber the source list separately when moving across phases
  if v_from_list <> p_to_list_id then
    with ordered as (
      select id, row_number() over (order by position) - 1 as rn
      from public.tasks
      where task_list_id = v_from_list and id <> p_task_id
    )
    update public.tasks t
    set position = o.rn
    from ordered o
    where t.id = o.id and t.position <> o.rn;
  end if;

  -- Splice the moved task into the target order at the clamped index
  v_index := greatest(0, least(p_to_index, coalesce(array_length(v_ids, 1), 0)));
  v_ids   := v_ids[1:v_index] || p_task_id || v_ids[v_index + 1:];

  for i in 1..array_length(v_ids, 1) loop
    if v_ids[i] = p_task_id then
      update public.tasks
      set task_list_id = p_to_list_id, position = i - 1
      where id = p_task_id;
    else
      update public.tasks
      set position = i - 1
      where id = v_ids[i] and position <> i - 1;
    end if;
  end loop;
end;
$$;

comment on function public.reorder_task is
  'Drag-and-drop reorder: moves a task to an index, optionally into another phase of the same project. security definer — validates admin/membership itself so providers can reorder despite per-row RLS. Migration 018 restricts the client role to tasks they created and pins search_path.';


-- =============================================================================
-- 3. CLIENT DELETES MUST REQUIRE LIVE PROJECT MEMBERSHIP (fix 3)
--
-- Both policies are recreated verbatim from 014 with one clause added to
-- USING: public.is_project_member(project_id). This is the DELETE counterpart
-- of what 015 did for "tasks: client edits own pending" and 016 did for
-- "task_lists: client renames own" and "messages: client edits own" — those
-- three added the clause to WITH CHECK, which is the right half for an UPDATE
-- (constrain the destination). A DELETE has no WITH CHECK; the row being
-- removed is the only thing to constrain, so the clause belongs in USING.
--
-- Why this is not theoretical: revoking a client removes their
-- project_members rows and leaves `approved` alone as far as RLS is concerned
-- (revokeClientAccess in clients/actions.ts). `approved` gates the app shell
-- in (portal)/layout.tsx, not the database. A revoked client who still holds
-- a valid session JWT keeps talking to PostgREST until the token expires, and
-- until now could go on deleting phases and pending tasks they had authored.
--
-- "messages: client deletes own" (014:338) is left as it stands: a client
-- deleting their own message board post destroys only their own content, and
-- 014 deliberately gave them that. Membership is not carried on messages the
-- way it is on work items. Called out here so the asymmetry reads as a
-- decision rather than an oversight.
-- =============================================================================

drop policy if exists "tasks: client deletes own pending" on public.tasks;
create policy "tasks: client deletes own pending"
  on public.tasks for delete
  using (
    public.get_user_role() = 'client'
    and created_by = auth.uid()
    and status     = 'pending'
    -- Added by migration 018: without it a REVOKED client (project_members
    -- rows deleted, session still live) keeps delete rights on their own
    -- pending tasks.
    and public.is_project_member(project_id)
  );

drop policy if exists "task_lists: client deletes own" on public.task_lists;
create policy "task_lists: client deletes own"
  on public.task_lists for delete
  using (
    public.get_user_role() = 'client'
    and created_by = auth.uid()
    -- Added by migration 018, same reason as the task policy above. The
    -- BEFORE DELETE trigger in section 1 additionally refuses any phase that
    -- holds a task this client did not file.
    and public.is_project_member(project_id)
  );


-- =============================================================================
-- 4. FINISH THE SECURITY DEFINER search_path PASS (fix 4)
--
-- reorder_task is already done in section 2. The remaining four follow, each
-- with its body carried over verbatim from the migration that last defined it.
-- Nothing about what any of them returns or does is changed.
-- =============================================================================

-- ── is_approved_member() — body verbatim from 013 lines 134-145 ───────────────
-- Backs the "users: approved members read directory" SELECT policy, so it runs
-- on very nearly every page load in the portal. Highest-traffic definer
-- function in the schema and the last one still unpinned.

create or replace function public.is_approved_member()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select approved from public.users where id = auth.uid()),
    false
  );
$$;

comment on function public.is_approved_member is
  'True when the current auth user exists and is approved. security definer so the users RLS policy can reference the users table without recursing; search_path pinned by migration 018.';


-- ── award_task_points() — body verbatim from 014 lines 87-154 ─────────────────
-- 008 fixed completion integrity and 014 gated the deadline bonus on
-- points_value > 0. 014 is the current definition and is what is reproduced
-- here; the only change is SET search_path. The tasks_award_points BEFORE
-- UPDATE trigger from 001 keeps pointing at it — create or replace does not
-- disturb it.

create or replace function public.award_task_points()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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


-- ── notify_comment_mentions() — body verbatim from 013 lines 57-98 ────────────
-- The task_comments_notify_mentions AFTER INSERT OR UPDATE trigger keeps
-- pointing at it.

create or replace function public.notify_comment_mentions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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


-- ── notify_task_assignment() — body verbatim from 013 lines 104-124 ───────────
-- The tasks_notify_assignment AFTER INSERT OR UPDATE trigger keeps pointing
-- at it.

create or replace function public.notify_task_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
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


-- =============================================================================
-- 5. RE-RUN SAFETY IN THE EARLIER FILES (fix 5)
--
-- Not SQL in this file — recorded here so the change is discoverable from the
-- migration that motivated it.
--
-- 001 and 011 are hand-applied through the SQL Editor and advertised as
-- re-runnable, so replaying either is a real event. Two hazards, both patched
-- in place in the same commit as this migration, each carrying a comment
-- marking it a deliberate back-port:
--
--   * 011 defined public.is_project_member WITHOUT a pinned search_path, and
--     001 defined public.is_admin the same way. 017 pinned both. A re-run of
--     either file would have silently un-pinned 017's fix — no error, no
--     visible change. Both now carry `set search_path = public, pg_temp`.
--   * 011 also creates "tasks: member claims unassigned", the policy 014
--     deliberately dropped because it let clients claim team work. 011 has no
--     `drop policy if exists` in front of it, so before 014 a re-run merely
--     errored — but AFTER 014 dropped the policy, a re-run of 011 would have
--     recreated it cleanly and handed clients back the ability to assign team
--     work to themselves. That statement is now commented out in 011 with a
--     pointer to 014 section 4.
--
-- This follows the precedent 014 set (see its NOTE ON POLICY BODIES BEING
-- EDITED IN PLACE): where a re-runnable file would revert a later fix, the
-- fix is back-ported into it and both copies are kept in sync deliberately.
--
-- STILL A HAZARD, NOT ADDRESSED HERE: 014 section 7's delete policies
-- ("tasks: client deletes own pending" at 014:264 and "task_lists: client
-- deletes own" at 014:302) do NOT carry the is_project_member(project_id)
-- clause that section 3 above adds, so a re-run of 014 will revert fix 3 —
-- exactly the failure mode 014's own header warns about for the UPDATE
-- policies. The same back-port should be applied to those two policy bodies
-- in 014. Left out of this change only because its scope was limited to 001
-- and 011; it should be the first follow-up.
-- =============================================================================


-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
--
-- -----------------------------------------------------------------------------
-- MANUAL VERIFICATION — run these in the app, not only in SQL. Sign in as each
-- role separately; a client session needs a real invited client on a project.
--
--   1. A CLIENT CANNOT DELETE A PHASE CONTAINING TEAM TASKS.
--      As admin: file a task into a phase the client created.
--      As that client: delete the phase from the UI — refused, and the error
--      is the 42501 message, not a generic failure. Then bypass the UI the way
--      an attacker would and confirm the database itself refuses:
--        delete from public.task_lists where id = '<phase id>';
--      Must raise. Afterwards confirm no task was orphaned:
--        select count(*) from public.tasks
--        where project_id = '<project id>' and task_list_id is null;   -- 0
--
--   2. A CLIENT CANNOT DRAG A TEAM TASK TO ANOTHER PHASE.
--      As that client, in the Todos tab, drag an admin-created task into a
--      different phase — refused ('Clients can only reorder to-dos they
--      created'). Directly:
--        select public.reorder_task('<team task id>', '<other phase id>', 0);
--      Must raise. The task must still be in its original phase afterwards.
--
--   3. A CLIENT CAN STILL DELETE THEIR OWN PHASE AND THEIR OWN PENDING TASK.
--      As that client: create a phase, file a to-do into it, delete the to-do,
--      then delete the now-empty phase. Both must succeed. Also confirm a
--      client can still drag their OWN to-do between phases.
--
--   4. ADMIN AND PROVIDER BEHAVIOUR IS UNCHANGED.
--      As admin: delete a phase that holds team tasks — succeeds.
--      As a provider on the project: drag any task between phases — succeeds;
--      claim an unassigned task — still succeeds (014's policy, untouched);
--      close a task and confirm points land in performance_periods, and that
--      re-opening it deducts them again (award_task_points was only re-pinned,
--      not changed).
--
--   5. THE TO-DO LIST AND TEAM TAB STILL LOAD FOR ALL THREE ROLES.
--      Open a project detail page as admin, provider and client. Todos tab:
--      every phase and task renders, including internal tasks for the client,
--      with the "Added by client" badges intact. Team tab: the full roster.
--      A blank or partial screen here points at section 4 — is_approved_member
--      backs the users directory read policy and runs on nearly every page.
--
--   6. NOTIFICATIONS STILL FIRE. @mention someone in a task comment and assign
--      a task to someone else; both bells must light up. Those two triggers
--      were re-pinned in section 4.
--
--   7. A REVOKED CLIENT LOSES DELETE RIGHTS. Revoke a client from Clients,
--      then, with their still-valid session, attempt to delete a phase or a
--      pending task they authored. Both must now be refused (fix 3).
-- -----------------------------------------------------------------------------
-- =============================================================================
