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
-- Run via: Supabase Dashboard → SQL Editor, or `supabase db push`
-- =============================================================================

create or replace function public.reorder_task(
  p_task_id    uuid,
  p_to_list_id uuid,
  p_to_index   integer
)
returns void
language plpgsql
security definer
as $$
declare
  v_project    uuid;
  v_from_list  uuid;
  v_to_project uuid;
  v_ids        uuid[];
  v_index      integer;
  i            integer;
begin
  select project_id, task_list_id
    into v_project, v_from_list
  from public.tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found';
  end if;

  if not (public.is_admin() or public.is_project_member(v_project)) then
    raise exception 'Only project members can reorder tasks';
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
  'Drag-and-drop reorder: moves a task to an index, optionally into another phase of the same project. security definer — validates admin/membership itself so providers can reorder despite per-row RLS.';

-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
-- =============================================================================
