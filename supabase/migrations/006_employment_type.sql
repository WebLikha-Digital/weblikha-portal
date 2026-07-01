-- =============================================================================
-- WEBLIKHA PORTAL — EMPLOYMENT TYPE
-- Migration: 006_employment_type.sql
--
-- Changes:
--   1. Add employment_type column to public.users
--      Values: 'in-house' | 'outsource'  (default: 'in-house')
--
-- Run via: Supabase Dashboard → SQL Editor
-- Non-destructive: existing rows default to 'in-house'
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN employment_type text NOT NULL DEFAULT 'in-house'
  CHECK (employment_type IN ('in-house', 'outsource'));

COMMENT ON COLUMN public.users.employment_type IS
  'Whether the team member is a direct employee (in-house) or a contractor (outsource).';

-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
-- =============================================================================
