-- =============================================================================
-- WEBLIKHA PORTAL — PROJECTS FEATURE MIGRATION
-- Migration: 002_projects_feature.sql
-- Adds: task_lists, messages tables; client user role; task_list_id on tasks
-- Run via: Supabase Dashboard → SQL Editor
-- =============================================================================


-- =============================================================================
-- 1. ADD CLIENT ROLE TO USERS
-- =============================================================================

-- Drop existing check constraint and re-add with 'client' included
alter table public.users
  drop constraint users_role_check;

alter table public.users
  add constraint users_role_check
    check (role in ('admin', 'provider', 'client'));

comment on column public.users.role is
  'admin = full access; provider = own data + assigned projects; client = assigned project overview only.';


-- =============================================================================
-- 2. TASK LISTS (phases per project)
-- =============================================================================

create table public.task_lists (
  id          uuid        default gen_random_uuid() primary key,
  project_id  uuid        not null references public.projects(id) on delete cascade,
  name        text        not null,
  position    integer     not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.task_lists is
  'Ordered phases/lists within a project (e.g. Data Gathering, Design Phase, Dev Phase).';

create index idx_task_lists_project_id on public.task_lists(project_id);
create index idx_task_lists_position   on public.task_lists(project_id, position);


-- =============================================================================
-- 3. ADD task_list_id TO TASKS
-- =============================================================================

alter table public.tasks
  add column task_list_id uuid references public.task_lists(id) on delete set null;

create index idx_tasks_task_list_id on public.tasks(task_list_id);


-- =============================================================================
-- 4. MESSAGES (message board per project)
-- =============================================================================

create table public.messages (
  id                uuid        default gen_random_uuid() primary key,
  project_id        uuid        not null references public.projects(id) on delete cascade,
  author_id         uuid        references public.users(id) on delete set null,
  title             text        not null,
  body              text        not null,
  is_client_visible boolean     not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.messages is
  'Message board posts per project. is_client_visible controls whether clients can see the post.';

create index idx_messages_project_id on public.messages(project_id);
create index idx_messages_created_at on public.messages(project_id, created_at desc);

-- Auto-update updated_at on messages
create trigger set_messages_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 5. ROW LEVEL SECURITY
-- =============================================================================

alter table public.task_lists enable row level security;
alter table public.messages   enable row level security;


-- ── task_lists policies ───────────────────────────────────────────────────────

-- Admin: full access
create policy "admin_all_task_lists" on public.task_lists
  for all to authenticated
  using     (public.is_admin())
  with check (public.is_admin());

-- Provider: read task lists for assigned projects
create policy "provider_read_task_lists" on public.task_lists
  for select to authenticated
  using (
    not public.is_admin()
    and (select role from public.users where id = auth.uid()) = 'provider'
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = task_lists.project_id
        and pm.user_id = auth.uid()
    )
  );

-- Client: read task lists for their assigned project
create policy "client_read_task_lists" on public.task_lists
  for select to authenticated
  using (
    (select role from public.users where id = auth.uid()) = 'client'
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = task_lists.project_id
        and pm.user_id = auth.uid()
    )
  );


-- ── messages policies ─────────────────────────────────────────────────────────

-- Admin: full access
create policy "admin_all_messages" on public.messages
  for all to authenticated
  using     (public.is_admin())
  with check (public.is_admin());

-- Provider: read + write messages on assigned projects
create policy "provider_read_messages" on public.messages
  for select to authenticated
  using (
    not public.is_admin()
    and (select role from public.users where id = auth.uid()) = 'provider'
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = messages.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "provider_insert_messages" on public.messages
  for insert to authenticated
  with check (
    (select role from public.users where id = auth.uid()) = 'provider'
    and author_id = auth.uid()
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = messages.project_id
        and pm.user_id = auth.uid()
    )
  );

-- Client: read only client-visible messages on their project
create policy "client_read_messages" on public.messages
  for select to authenticated
  using (
    (select role from public.users where id = auth.uid()) = 'client'
    and is_client_visible = true
    and exists (
      select 1 from public.project_members pm
      where pm.project_id = messages.project_id
        and pm.user_id = auth.uid()
    )
  );


-- =============================================================================
-- DONE
-- =============================================================================
