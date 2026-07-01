-- =============================================================================
-- WEBLIKHA PORTAL — SCHEMA NORMALIZATION & OPTIMIZATION
-- Migration: 004_schema_normalization.sql
--
-- Changes:
--   1. Add updated_at to users, projects, tasks (+ triggers)
--   2. Add get_user_role() helper function (DRY up RLS policies)
--   3. Fix projects: member or admin RLS (IN instead of EXISTS — more reliable)
--   4. Rewrite task_lists + messages RLS using helper functions (drop inline subqueries)
--   5. Add task/task_list project consistency trigger
--   6. Add missing index on users(role, approved) for approval queue queries
--
-- Run via: Supabase Dashboard → SQL Editor
-- Safe to re-run: all drops use IF EXISTS
-- =============================================================================


-- =============================================================================
-- 1. ADD updated_at TO users, projects, tasks
-- =============================================================================

-- users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill: set updated_at = created_at for existing rows
UPDATE public.users SET updated_at = created_at WHERE updated_at = now();

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.users.updated_at IS
  'Last time this user profile was modified.';


-- projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.projects SET updated_at = created_at WHERE updated_at = now();

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.projects.updated_at IS
  'Last time this project was modified (status change, rename, etc.).';


-- tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.tasks SET updated_at = created_at WHERE updated_at = now();

CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON COLUMN public.tasks.updated_at IS
  'Last time this task was modified (status change, reassignment, etc.).';


-- =============================================================================
-- 2. get_user_role() HELPER FUNCTION
--    Used in RLS policies instead of inline (SELECT role FROM users WHERE id = auth.uid()).
--    SECURITY DEFINER so it bypasses users RLS and avoids recursive policy evaluation.
--    STABLE so PostgreSQL can cache the result within a single query.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_user_role() IS
  'Returns the role of the currently authenticated user. SECURITY DEFINER bypasses RLS.';


-- =============================================================================
-- 3. FIX projects: member or admin RLS
--    Replaces the EXISTS subquery with IN — more reliable under Supabase RLS.
--    (This fix may have already been applied manually — DROP IF EXISTS is safe.)
-- =============================================================================

DROP POLICY IF EXISTS "projects: member or admin" ON public.projects;

CREATE POLICY "projects: member or admin"
  ON public.projects FOR SELECT
  USING (
    public.is_admin() OR
    id IN (
      SELECT project_id
      FROM public.project_members
      WHERE user_id = auth.uid()
    )
  );


-- =============================================================================
-- 4. REWRITE task_lists RLS USING HELPER FUNCTIONS
--    Drops inline role subqueries in favour of get_user_role() + IN.
-- =============================================================================

DROP POLICY IF EXISTS "admin_all_task_lists"       ON public.task_lists;
DROP POLICY IF EXISTS "provider_read_task_lists"   ON public.task_lists;
DROP POLICY IF EXISTS "client_read_task_lists"     ON public.task_lists;

-- Admin: full access
CREATE POLICY "task_lists: admin all"
  ON public.task_lists FOR ALL
  USING     (public.is_admin())
  WITH CHECK (public.is_admin());

-- Provider: read task lists for assigned projects
CREATE POLICY "task_lists: provider reads assigned"
  ON public.task_lists FOR SELECT
  USING (
    public.get_user_role() = 'provider'
    AND project_id IN (
      SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
    )
  );

-- Client: read task lists for their assigned project
CREATE POLICY "task_lists: client reads assigned"
  ON public.task_lists FOR SELECT
  USING (
    public.get_user_role() = 'client'
    AND project_id IN (
      SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
    )
  );


-- =============================================================================
-- 5. REWRITE messages RLS USING HELPER FUNCTIONS
-- =============================================================================

DROP POLICY IF EXISTS "admin_all_messages"        ON public.messages;
DROP POLICY IF EXISTS "provider_read_messages"    ON public.messages;
DROP POLICY IF EXISTS "provider_insert_messages"  ON public.messages;
DROP POLICY IF EXISTS "client_read_messages"      ON public.messages;

-- Admin: full access
CREATE POLICY "messages: admin all"
  ON public.messages FOR ALL
  USING     (public.is_admin())
  WITH CHECK (public.is_admin());

-- Provider: read messages on assigned projects
CREATE POLICY "messages: provider reads assigned"
  ON public.messages FOR SELECT
  USING (
    public.get_user_role() = 'provider'
    AND project_id IN (
      SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
    )
  );

-- Provider: post messages on assigned projects (must be the author)
CREATE POLICY "messages: provider inserts"
  ON public.messages FOR INSERT
  WITH CHECK (
    public.get_user_role() = 'provider'
    AND author_id = auth.uid()
    AND project_id IN (
      SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
    )
  );

-- Client: read only client-visible messages on their project
CREATE POLICY "messages: client reads visible"
  ON public.messages FOR SELECT
  USING (
    public.get_user_role() = 'client'
    AND is_client_visible = true
    AND project_id IN (
      SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
    )
  );


-- =============================================================================
-- 6. TASK / TASK_LIST PROJECT CONSISTENCY TRIGGER
--    Ensures tasks.project_id always matches task_lists.project_id when
--    task_list_id is set. Prevents silent data integrity violations.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_task_project_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.task_list_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.task_lists
      WHERE id = NEW.task_list_id
        AND project_id = NEW.project_id
    ) THEN
      RAISE EXCEPTION
        'Data integrity error: tasks.project_id (%) does not match '
        'task_lists.project_id for task_list_id (%)',
        NEW.project_id, NEW.task_list_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_check_project_consistency
  BEFORE INSERT OR UPDATE OF task_list_id, project_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.check_task_project_consistency();

COMMENT ON FUNCTION public.check_task_project_consistency() IS
  'Ensures tasks.project_id matches task_lists.project_id when task_list_id is set.';


-- =============================================================================
-- 7. MISSING INDEXES
--    users(role) — speeds up filtering providers for member pickers
--    users(approved) — speeds up admin approval queue query
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_users_role     ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_approved ON public.users(approved) WHERE approved = false;

COMMENT ON INDEX idx_users_approved IS
  'Partial index on unapproved users only — approval queue is always a small set.';


-- =============================================================================
-- DONE
-- After running:
--   1. Restart Supabase API (Dashboard → Settings → API → Restart) to flush schema cache
--   2. Verify provider can read their projects (the IN policy fix)
--   3. Test task creation with a task_list_id to confirm the consistency trigger fires
-- =============================================================================
