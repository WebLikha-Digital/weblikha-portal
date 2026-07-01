-- =============================================================================
-- WEBLIKHA PORTAL — USER SKILLS (multi-value)
-- Migration: 007_user_skills.sql
--
-- Changes:
--   1. Add skills text[] column to public.users (default empty array)
--   2. Seed from existing specialty values so no data is lost
--      (specialty column is kept for backward compatibility)
--
-- Run via: Supabase Dashboard → SQL Editor
-- Non-destructive: existing rows get their specialty migrated to skills[1]
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN skills text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.users.skills IS
  'Ordered list of skill tags. First element is the primary/display skill.
   Values: developer | designer | seo | pm | copywriter | video | social_media | other';

-- Seed skills from existing specialty (skip "other" as it is a placeholder)
UPDATE public.users
  SET skills = ARRAY[specialty]
  WHERE specialty IS NOT NULL
    AND specialty <> 'other'
    AND specialty <> '';

-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
-- =============================================================================
