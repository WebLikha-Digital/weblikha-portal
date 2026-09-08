-- =============================================================================
-- WEBLIKHA PORTAL — INITIAL DATABASE SCHEMA
-- Migration: 001_initial_schema.sql
-- Run via: Supabase Dashboard → SQL Editor, or `supabase db push`
-- =============================================================================

-- UUID generation uses gen_random_uuid() — built into Postgres 13+, no extension needed.
-- (uuid-ossp/uuid_generate_v4 breaks under the CLI's search_path; see 2026-07 prod deploy.)


-- =============================================================================
-- TABLES
-- =============================================================================

-- Users
-- Extends Supabase's auth.users. A trigger auto-populates this on signup.
create table public.users (
  id          uuid references auth.users(id) on delete cascade primary key,
  email       text        not null unique,
  name        text        not null,
  role        text        not null default 'provider'
                check (role in ('admin', 'provider')),
  specialty   text        not null default 'other'
                check (specialty in ('developer', 'designer', 'seo', 'pm', 'other')),
  avatar_url  text,
  created_at  timestamptz not null default now()
);
comment on table public.users is 'Agency team members — mirrors auth.users with additional profile data.';
comment on column public.users.role is 'admin = full access; provider = own data + assigned projects only.';


-- Projects
create table public.projects (
  id          uuid        default gen_random_uuid() primary key,
  name        text        not null,
  client_name text        not null,
  status      text        not null default 'discovery'
                check (status in ('discovery', 'in_progress', 'review', 'completed', 'archived')),
  start_date  date        not null,
  end_date    date        not null,
  budget      numeric(12,2) not null default 0 check (budget >= 0),
  description text,
  created_by  uuid        references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint end_after_start check (end_date >= start_date)
);
comment on table public.projects is 'Client projects tracked in the portal.';
comment on column public.projects.budget is 'Total agreed project value in PHP.';


-- Project members
-- Join table: which team members are on which project, and in what role.
create table public.project_members (
  id               uuid        default gen_random_uuid() primary key,
  project_id       uuid        not null references public.projects(id) on delete cascade,
  user_id          uuid        not null references public.users(id) on delete cascade,
  role_in_project  text        not null default 'contributor',
  joined_at        timestamptz not null default now(),

  unique(project_id, user_id)
);
comment on column public.project_members.role_in_project is 'e.g. Lead Dev, Designer, SEO Specialist, PM.';


-- Tasks
-- Individual deliverables within a project, assigned to a team member.
create table public.tasks (
  id           uuid        default gen_random_uuid() primary key,
  project_id   uuid        not null references public.projects(id) on delete cascade,
  assignee_id  uuid        references public.users(id) on delete set null,
  title        text        not null,
  description  text,
  status       text        not null default 'pending'
                 check (status in ('pending', 'in_progress', 'done')),
  due_date     date        not null,
  completed_at timestamptz,
  -- Points awarded when this task is closed (default 60)
  points_value integer     not null default 60 check (points_value >= 0),
  created_at   timestamptz not null default now()
);
comment on column public.tasks.points_value is 'Incentive points awarded when status → done. Default 60.';


-- Performance periods
-- Monthly rollup of incentive points per team member.
-- total_points is a generated column — never update it directly.
create table public.performance_periods (
  id              uuid        default gen_random_uuid() primary key,
  user_id         uuid        not null references public.users(id) on delete cascade,
  period_month    integer     not null check (period_month between 1 and 12),
  period_year     integer     not null check (period_year >= 2024),
  task_points     integer     not null default 0 check (task_points >= 0),
  deadline_points integer     not null default 0 check (deadline_points >= 0),
  admin_points    integer     not null default 0,  -- Can be negative (deduction)
  admin_note      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique(user_id, period_month, period_year)
);

-- Generated column: total = task + deadline + admin
alter table public.performance_periods
  add column total_points integer
  generated always as (task_points + deadline_points + admin_points) stored;

comment on column public.performance_periods.task_points is 'Sum of points_value for tasks closed this period.';
comment on column public.performance_periods.deadline_points is '+30 pts per task completed on or before due_date.';
comment on column public.performance_periods.admin_points is 'Manual bonus/deduction set by admin. Can be negative.';
comment on column public.performance_periods.total_points is 'Computed: task + deadline + admin. Do not update directly.';


-- Revenue entries
-- Individual income or expense line items per project.
create table public.revenue_entries (
  id          uuid          default gen_random_uuid() primary key,
  project_id  uuid          not null references public.projects(id) on delete cascade,
  type        text          not null check (type in ('income', 'expense')),
  amount      numeric(12,2) not null check (amount > 0),
  date        date          not null,
  note        text,
  created_at  timestamptz   not null default now()
);
comment on table public.revenue_entries is 'Income and expense line items. Negative net = project running at a loss.';


-- =============================================================================
-- INDEXES (query performance)
-- =============================================================================

create index on public.tasks (project_id);
create index on public.tasks (assignee_id);
create index on public.tasks (status);
create index on public.project_members (project_id);
create index on public.project_members (user_id);
create index on public.performance_periods (user_id, period_year, period_month);
create index on public.revenue_entries (project_id, date);


-- =============================================================================
-- ROW LEVEL SECURITY
-- Every table is locked down. Users only see what they're allowed to see.
-- =============================================================================

alter table public.users               enable row level security;
alter table public.projects            enable row level security;
alter table public.project_members     enable row level security;
alter table public.tasks               enable row level security;
alter table public.performance_periods enable row level security;
alter table public.revenue_entries     enable row level security;

-- Helper: is the current user an admin?
-- SECURITY DEFINER ensures it runs as the table owner, not the caller.
--
-- NOTE — DELIBERATE BACK-PORT FROM MIGRATIONS 017 AND 018.
-- `set search_path` was not in the original 001. It was added by 017 (as
-- `= public`), and 018 established the documented-safe `= public, pg_temp`
-- form that both this copy and 017's own now use.
-- This file is applied by hand through the SQL Editor and advertised as
-- re-runnable, so a re-run of the ORIGINAL text would have silently un-pinned
-- that fix: a SECURITY DEFINER function resolving unqualified names — and
-- operators and casts — through the CALLER's search_path, with no error and
-- nothing visibly different. is_admin() backs almost every policy in the
-- schema, so that is the worst possible function to leave unpinned.
-- Kept in sync on purpose: any future change to this body must be made in
-- BOTH places — here and in the migration that last touched it (017).
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

-- ── Users ────────────────────────────────────────────────────────────────────

-- Everyone can read their own row; admins read all
create policy "users: read own or admin reads all"
  on public.users for select
  using (auth.uid() = id or public.is_admin());

-- Users can update their own name/avatar; admins can update any row
create policy "users: update own profile"
  on public.users for update
  using (auth.uid() = id or public.is_admin());

-- Only admins can insert new user rows (the trigger below handles auto-insert)
create policy "users: admin inserts"
  on public.users for insert
  with check (public.is_admin());

-- ── Projects ─────────────────────────────────────────────────────────────────

-- Members of a project see it; admins see all
create policy "projects: member or admin"
  on public.projects for select
  using (
    public.is_admin() or
    exists (
      select 1 from public.project_members pm
      where pm.project_id = id and pm.user_id = auth.uid()
    )
  );

-- Only admins can create/update/delete projects
create policy "projects: admin manages"
  on public.projects for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── Project members ───────────────────────────────────────────────────────────

create policy "project_members: see own or admin"
  on public.project_members for select
  using (user_id = auth.uid() or public.is_admin());

create policy "project_members: admin manages"
  on public.project_members for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── Tasks ─────────────────────────────────────────────────────────────────────

-- Assignee sees own tasks; project members see all project tasks; admins see all
create policy "tasks: assignee, member, or admin"
  on public.tasks for select
  using (
    public.is_admin() or
    assignee_id = auth.uid() or
    exists (
      select 1 from public.project_members pm
      where pm.project_id = project_id and pm.user_id = auth.uid()
    )
  );

-- Assignee can update status/completed_at on their own tasks
create policy "tasks: assignee updates status"
  on public.tasks for update
  using (assignee_id = auth.uid() or public.is_admin())
  with check (assignee_id = auth.uid() or public.is_admin());

-- Admins create and delete tasks
create policy "tasks: admin inserts"
  on public.tasks for insert
  with check (public.is_admin());

create policy "tasks: admin deletes"
  on public.tasks for delete
  using (public.is_admin());

-- ── Performance periods ───────────────────────────────────────────────────────

-- Users see their own performance; admins see all
create policy "performance: own or admin"
  on public.performance_periods for select
  using (user_id = auth.uid() or public.is_admin());

-- Only admins can insert/update/delete (admin_points, admin_note)
create policy "performance: admin manages"
  on public.performance_periods for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── Revenue entries ───────────────────────────────────────────────────────────

-- Revenue is admin-only (providers don't see financial data)
create policy "revenue: admin only"
  on public.revenue_entries for all
  using (public.is_admin())
  with check (public.is_admin());


-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- 1. Auto-update updated_at on performance_periods
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger performance_periods_set_updated_at
  before update on public.performance_periods
  for each row execute function public.set_updated_at();


-- 2. Auto-award task points when a task is marked done
--    Upserts the matching performance_period row for the assignee.
--
-- *** SUPERSEDED — the live definition of public.award_task_points() is in
--     migration 018_client_delete_and_definer_hardening.sql, section 4.
--     DO NOT RE-APPLY THE BODY BELOW. ***
--
-- Unlike is_admin() above, this one is NOT back-ported: the current function is
-- three fixes ahead of it and reproducing that here would leave two full
-- copies of a 60-line trigger to keep in sync. A banner is the right treatment,
-- matching how 011 handles its superseded claim policy.
--
-- The version below predates all three of:
--   * 008 — completion integrity. It has NO `elsif old.status = 'done'` branch
--     at all, so un-doing a task neither clears completed_at nor deducts the
--     points that were awarded. Toggle a task done -> not done -> done and the
--     assignee is paid twice.
--   * 014 — the deadline gate. `when now()::date <= new.due_date then 30`
--     lacks the `new.points_value > 0` guard, so a zero-point client-filed
--     task still mints a flat +30 the moment anyone closes it.
--   * 017/018 — the pinned search_path. No `set search_path`, so this
--     SECURITY DEFINER function resolves unqualified names, operators and
--     casts through the CALLER's search_path.
--
-- Realistic way to trigger it: hand-applying this trigger section through the
-- SQL Editor — the same route by which the is_admin() back-port above is
-- reached. `create or replace` will overwrite the live function without a
-- word of warning. If you need this section, run 018 section 4 afterwards.
create or replace function public.award_task_points()
returns trigger
language plpgsql
security definer
as $$
declare
  v_month integer;
  v_year  integer;
  v_deadline_bonus integer;
begin
  -- Only fire when status flips to 'done' and there's an assignee
  if new.status = 'done' and old.status <> 'done' and new.assignee_id is not null then

    v_month := extract(month from now());
    v_year  := extract(year  from now());

    -- Deadline bonus: +30 if completed on or before due_date
    v_deadline_bonus := case
      when now()::date <= new.due_date then 30
      else 0
    end;

    -- Mark completed_at
    new.completed_at = now();

    -- Upsert the period row
    insert into public.performance_periods
      (user_id, period_month, period_year, task_points, deadline_points)
    values
      (new.assignee_id, v_month, v_year, new.points_value, v_deadline_bonus)
    on conflict (user_id, period_month, period_year)
    do update set
      task_points     = performance_periods.task_points     + excluded.task_points,
      deadline_points = performance_periods.deadline_points + excluded.deadline_points,
      updated_at      = now();

  end if;

  return new;
end;
$$;

create trigger tasks_award_points
  before update on public.tasks
  for each row execute function public.award_task_points();


-- 3. Auto-create a users row when someone signs up via Supabase Auth
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;  -- Safe to re-run if trigger fires twice
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
