-- =============================================================================
-- WEBLIKHA PORTAL — REORDER TASK RPC
-- Migration: 012_reorder_task_rpc.sql
--
-- Changes:
--   1. reorder_task(uuid, uuid, int) — security definer function so any
--      project member (not just admins) can drag-reorder tasks. Reordering
--      renumbers OTHER tasks' positions, which per-row RLS can't allow for
--      providers; the function validates membership itself and runs the
--      whole renumber atomically in one transaction.
--   2. Integrity: rejects moves to a phase in a different project.
--
--   *** SUPERSEDED — the live definition of public.reorder_task is in
--       migration 018 section 2, which added the client restriction and the
--       pinned search_path. The body below has been BACK-PORTED to match it
--       exactly; see the note at the function itself. ***
--
-- Run via: Supabase Dashboard → SQL Editor, or `supabase db push`
-- =============================================================================

-- NOTE — DELIBERATE BACK-PORT FROM MIGRATION 018. DO NOT "CLEAN THIS UP".
-- Neither the client branch nor `set search_path` was in the original 012.
-- Both were added by 018 section 2. This file contains nothing but
-- `create or replace function` and `comment on function`, which makes it the
-- most re-runnable file in the directory — unlike 001 or 008, it does not
-- abort on a `create table`, so replaying it succeeds silently. A re-run of
-- the ORIGINAL text would therefore have reverted 018's fix 2 in full, with no
-- error and nothing visibly different: clients (project_members since 014)
-- would regain the ability to drag TEAM-created tasks between phases, and the
-- SECURITY DEFINER function would go back to resolving unqualified names —
-- and operators and casts — through the CALLER's search_path.
-- Kept in sync on purpose: any future change to this body must be made in
-- BOTH places — here and in the migration that last touched it (018).
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
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
-- =============================================================================
