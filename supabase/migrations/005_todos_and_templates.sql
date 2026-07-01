-- =============================================================================
-- WEBLIKHA PORTAL — TODOS & TASK LIST TEMPLATES
-- Migration: 005_todos_and_templates.sql
--
-- Changes:
--   1. project_templates        — named bundles of phases (admin-managed)
--   2. template_task_lists      — phases within a template
--   3. template_tasks           — tasks within each phase
--   4. RLS: admin-only for all template tables
--   5. Indexes on FK + position columns
--   6. Seed: "Standard Webflow Project" default template
--
-- Run via: Supabase Dashboard → SQL Editor
-- =============================================================================


-- =============================================================================
-- 1. TABLES
-- =============================================================================

CREATE TABLE public.project_templates (
  id          uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  name        text        NOT NULL,
  description text,
  created_by  uuid        REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_templates IS
  'Reusable bundles of phases + tasks that can be stamped onto any project.';


CREATE TABLE public.template_task_lists (
  id          uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  template_id uuid        NOT NULL REFERENCES public.project_templates(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.template_task_lists IS
  'Ordered phases within a project template (e.g. Data Gathering, Design Phase).';


CREATE TABLE public.template_tasks (
  id                    uuid        DEFAULT uuid_generate_v4() PRIMARY KEY,
  template_task_list_id uuid        NOT NULL REFERENCES public.template_task_lists(id) ON DELETE CASCADE,
  title                 text        NOT NULL,
  description           text,
  points_value          integer     NOT NULL DEFAULT 60 CHECK (points_value >= 0),
  position              integer     NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.template_tasks IS
  'Pre-defined tasks within a template phase. Copied into real tasks when template is applied.';


-- =============================================================================
-- 2. TRIGGERS — updated_at on project_templates
-- =============================================================================

CREATE TRIGGER project_templates_set_updated_at
  BEFORE UPDATE ON public.project_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- =============================================================================
-- 3. INDEXES
-- =============================================================================

CREATE INDEX idx_project_templates_created_by
  ON public.project_templates(created_by);

CREATE INDEX idx_template_task_lists_template_position
  ON public.template_task_lists(template_id, position);

CREATE INDEX idx_template_tasks_list_position
  ON public.template_tasks(template_task_list_id, position);


-- =============================================================================
-- 4. ROW LEVEL SECURITY — admin-only for all template tables
-- =============================================================================

ALTER TABLE public.project_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_task_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_tasks      ENABLE ROW LEVEL SECURITY;

-- project_templates: admin full access; providers/clients read-only
-- (providers need to read template names for the "Apply template" picker)
CREATE POLICY "project_templates: admin all"
  ON public.project_templates FOR ALL
  USING     (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "project_templates: authenticated read"
  ON public.project_templates FOR SELECT
  TO authenticated
  USING (true);

-- template_task_lists: same pattern
CREATE POLICY "template_task_lists: admin all"
  ON public.template_task_lists FOR ALL
  USING     (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "template_task_lists: authenticated read"
  ON public.template_task_lists FOR SELECT
  TO authenticated
  USING (true);

-- template_tasks: same pattern
CREATE POLICY "template_tasks: admin all"
  ON public.template_tasks FOR ALL
  USING     (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "template_tasks: authenticated read"
  ON public.template_tasks FOR SELECT
  TO authenticated
  USING (true);


-- =============================================================================
-- 5. SEED — "Standard Webflow Project" default template
-- =============================================================================

DO $$
DECLARE
  v_template_id  uuid;
  v_list_id      uuid;
BEGIN

  -- ── Template ────────────────────────────────────────────────────────────────
  INSERT INTO public.project_templates (name, description)
  VALUES (
    'Standard Webflow Project',
    'Default phases for a typical Webflow design and development engagement.'
  )
  RETURNING id INTO v_template_id;


  -- ── Phase 1: Data Gathering ─────────────────────────────────────────────────
  INSERT INTO public.template_task_lists (template_id, name, position)
  VALUES (v_template_id, 'Data Gathering', 0)
  RETURNING id INTO v_list_id;

  INSERT INTO public.template_tasks (template_task_list_id, title, position) VALUES
    (v_list_id, 'Client kickoff meeting',       0),
    (v_list_id, 'Gather brand assets',          1),
    (v_list_id, 'Content inventory audit',      2),
    (v_list_id, 'Sitemap & page structure',     3),
    (v_list_id, 'Collect copy for all pages',   4);


  -- ── Phase 2: Design Phase ───────────────────────────────────────────────────
  INSERT INTO public.template_task_lists (template_id, name, position)
  VALUES (v_template_id, 'Design Phase', 1)
  RETURNING id INTO v_list_id;

  INSERT INTO public.template_tasks (template_task_list_id, title, position) VALUES
    (v_list_id, 'Wireframes',             0),
    (v_list_id, 'Hi-fi mockups',          1),
    (v_list_id, 'Client design review',   2),
    (v_list_id, 'Design revisions',       3),
    (v_list_id, 'Design sign-off',        4);


  -- ── Phase 3: Development Phase ──────────────────────────────────────────────
  INSERT INTO public.template_task_lists (template_id, name, position)
  VALUES (v_template_id, 'Development Phase', 2)
  RETURNING id INTO v_list_id;

  INSERT INTO public.template_tasks (template_task_list_id, title, position) VALUES
    (v_list_id, 'Webflow project setup',              0),
    (v_list_id, 'Build global styles & components',   1),
    (v_list_id, 'Build all pages',                    2),
    (v_list_id, 'CMS collections setup',              3),
    (v_list_id, 'Interactions & animations',          4),
    (v_list_id, 'Forms & integrations',               5);


  -- ── Phase 4: QA & Testing ───────────────────────────────────────────────────
  INSERT INTO public.template_task_lists (template_id, name, position)
  VALUES (v_template_id, 'QA & Testing', 3)
  RETURNING id INTO v_list_id;

  INSERT INTO public.template_tasks (template_task_list_id, title, position) VALUES
    (v_list_id, 'Cross-browser testing',    0),
    (v_list_id, 'Mobile responsiveness',    1),
    (v_list_id, 'Content & copy review',    2),
    (v_list_id, 'Link & form check',        3),
    (v_list_id, 'Page speed audit',         4),
    (v_list_id, 'SEO meta & OG tags',       5),
    (v_list_id, 'Client UAT sign-off',      6);


  -- ── Phase 5: Launch ─────────────────────────────────────────────────────────
  INSERT INTO public.template_task_lists (template_id, name, position)
  VALUES (v_template_id, 'Launch', 4)
  RETURNING id INTO v_list_id;

  INSERT INTO public.template_tasks (template_task_list_id, title, position) VALUES
    (v_list_id, 'Connect custom domain',      0),
    (v_list_id, 'SSL certificate check',      1),
    (v_list_id, 'Publish to production',      2),
    (v_list_id, 'Post-launch smoke test',     3),
    (v_list_id, 'Handover & documentation',   4);

END;
$$;


-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
-- =============================================================================
