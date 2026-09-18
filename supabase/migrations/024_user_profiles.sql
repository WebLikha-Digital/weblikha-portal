-- =============================================================================
-- WEBLIKHA PORTAL — USER PROFILES AND ONBOARDING
-- Migration: 024_user_profiles.sql
--
-- The portal knows a person's name, email and role and nothing else. This adds
-- the details a working relationship needs — a photo, a phone number, a
-- timezone for international clients — plus the flag that drives a required
-- one-screen onboarding on first sign-in.
--
--   1. Profile columns on public.users. All nullable: a half-filled profile is
--      a normal state, not an error.
--   2. A timezone trigger, because a CHECK cannot consult pg_timezone_names.
--   3. An `avatars` storage bucket whose writes are scoped to each user's own
--      folder — deliberately NOT how comment-attachments (009) was set up.
--
-- NO new RLS policies: "users: update own profile" already exists, and 016's
-- guard_user_privileged_columns() blocks role/approved/email. Everything added
-- here is meant to be self-editable. Do not touch that guard.
--
-- Apply with: npx supabase db push --db-url $env:DB_URL   (dev first, then prod)
-- Safe to re-run.
-- =============================================================================


-- =============================================================================
-- 1. PROFILE COLUMNS
-- Limits mirror src/lib/profile.ts — change them together.
-- =============================================================================

alter table public.users add column if not exists phone           text;
alter table public.users add column if not exists birthdate       date;
alter table public.users add column if not exists timezone        text;
alter table public.users add column if not exists job_title       text;
alter table public.users add column if not exists location        text;
alter table public.users add column if not exists bio             text;
alter table public.users add column if not exists company         text;
alter table public.users add column if not exists company_website text;
alter table public.users add column if not exists onboarded_at    timestamptz;

comment on column public.users.timezone is
  'IANA zone name, e.g. Asia/Manila. Validated by guard_user_timezone(); used to show other people their local time.';
comment on column public.users.company is
  'Client-side only: the company a client works for. Distinct from projects.client_name, which names the engagement.';
comment on column public.users.onboarded_at is
  'Set once by completeOnboarding(). Null sends the user to /onboarding via (portal)/layout.tsx. Deliberately not derived from "are the fields filled", so clearing a field does not re-trigger onboarding.';

alter table public.users drop constraint if exists users_phone_length;
alter table public.users add constraint users_phone_length
  check (phone is null or char_length(btrim(phone)) between 5 and 30);

alter table public.users drop constraint if exists users_timezone_length;
alter table public.users add constraint users_timezone_length
  check (timezone is null or char_length(timezone) between 3 and 64);

alter table public.users drop constraint if exists users_job_title_length;
alter table public.users add constraint users_job_title_length
  check (job_title is null or char_length(btrim(job_title)) <= 80);

alter table public.users drop constraint if exists users_location_length;
alter table public.users add constraint users_location_length
  check (location is null or char_length(btrim(location)) <= 120);

alter table public.users drop constraint if exists users_bio_length;
alter table public.users add constraint users_bio_length
  check (bio is null or char_length(btrim(bio)) <= 500);

alter table public.users drop constraint if exists users_company_length;
alter table public.users add constraint users_company_length
  check (company is null or char_length(btrim(company)) <= 120);

alter table public.users drop constraint if exists users_company_website_format;
alter table public.users add constraint users_company_website_format
  check (
    company_website is null
    or (char_length(company_website) <= 200 and company_website ~* '^https?://')
  );

-- A birthday in the future is a typo, not a fact.
alter table public.users drop constraint if exists users_birthdate_past;
alter table public.users add constraint users_birthdate_past
  check (birthdate is null or birthdate < current_date);


-- =============================================================================
-- 2. TIMEZONE VALIDATION
--
-- A CHECK constraint cannot subquery pg_timezone_names, so the real validation
-- is a trigger. The browser picker only offers genuine IANA zones; this is what
-- stops a direct PostgREST call storing rubbish that the "their local time"
-- display would then have to survive.
-- =============================================================================

create or replace function public.guard_user_timezone()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.timezone is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.timezone is not distinct from old.timezone then
    return new;
  end if;

  if not exists (
    select 1 from pg_timezone_names z where z.name = new.timezone
  ) then
    raise exception 'Unknown timezone: %', new.timezone
      using errcode = '22023';
  end if;

  return new;
end;
$$;

comment on function public.guard_user_timezone() is
  'Rejects a users.timezone that is not a real IANA zone. Skipped when the value is unchanged, so an old row with a since-removed zone can still be edited.';

drop trigger if exists users_guard_timezone on public.users;
create trigger users_guard_timezone
  before insert or update on public.users
  for each row execute function public.guard_user_timezone();


-- =============================================================================
-- 3. AVATAR STORAGE
--
-- Public to read (avatars appear all over the portal, including in emails'
-- absence), but each user may only write inside a folder named after their own
-- id: avatars/{user_id}/{uuid}.{ext}.
--
-- comment-attachments (009) lets ANY authenticated user write ANY path and is
-- world-readable — repeating that here would let anyone overwrite anyone's
-- face. Size and MIME limits are enforced in the upload component.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars: owner inserts" on storage.objects;
create policy "avatars: owner inserts"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: owner updates" on storage.objects;
create policy "avatars: owner updates"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars: owner deletes" on storage.objects;
create policy "avatars: owner deletes"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
--
-- Every existing row has onboarded_at null, so every current user meets the
-- onboarding screen once on their next sign-in. That is intended.
--
-- Manual checks after applying:
--   - update users set timezone = 'Mars/Olympus' where id = auth.uid() → rejected.
--   - update users set timezone = 'Asia/Manila' → accepted.
--   - Upload to avatars/{someone-else-id}/x.png → rejected by RLS.
--   - update users set role = 'admin' as a client → still rejected by 016's guard.
-- =============================================================================
