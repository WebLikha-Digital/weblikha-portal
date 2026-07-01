-- =============================================================================
-- WEBLIKHA PORTAL — USER APPROVAL GATE
-- Migration: 003_user_approval.sql
-- Adds an `approved` flag to users. New signups default to false.
-- Admins bypass the check. Providers and clients need explicit approval.
-- Run via: Supabase Dashboard → SQL Editor
-- =============================================================================


-- 1. Add approved column (default false for new signups)
alter table public.users
  add column approved boolean not null default false;

comment on column public.users.approved is
  'Admin must approve provider/client accounts before they can access the portal. Admins are always considered approved.';


-- 2. Pre-approve all existing users (Matthew's account + any others already set up)
update public.users
  set approved = true;


-- 3. Update the handle_new_auth_user trigger function so new signups
--    start as unapproved (approved = false is the column default, so
--    we just need to make sure the trigger doesn't override it to true).
--    Re-create the trigger function to be explicit.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, name, role, approved)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'provider',   -- default role; admin promotes if needed
    false         -- must be approved by admin before accessing portal
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


-- =============================================================================
-- DONE
-- Run this, then in the portal go to Settings → Pending approvals to manage
-- new team member signups.
-- =============================================================================
