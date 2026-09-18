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
--   2. public.user_private — phone and birthdate live here, NOT on users. See
--      the section below for why: 013's directory policy makes every column
--      of `users` readable by any approved member, and those two are not
--      agency-wide information the way a job title or a timezone is.
--   3. A timezone trigger, because a CHECK cannot consult pg_timezone_names.
--   4. An `avatars` storage bucket whose writes are scoped to each user's own
--      folder — deliberately NOT how comment-attachments (009) was set up —
--      with a size and MIME allowlist enforced at the bucket level, not just
--      in the upload component.
--
-- NO new RLS policies on users: "users: update own profile" already exists,
-- and 016's guard_user_privileged_columns() blocks role/approved/email.
-- Everything added to users here is meant to be self-editable. Do not touch
-- that guard.
--
-- Apply with: npx supabase db push --db-url $env:DB_URL   (dev first, then prod)
-- Safe to re-run.
-- =============================================================================


-- =============================================================================
-- 1. PROFILE COLUMNS
-- Limits mirror src/lib/profile.ts — change them together.
-- =============================================================================

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

-- Columns that predate this migration on a database where it was already
-- (mis-)applied once: phone and birthdate never belonged on users (see § 2
-- below) — drop them here so a re-run of this file also repairs that.
alter table public.users drop constraint if exists users_phone_length;
alter table public.users drop constraint if exists users_birthdate_past;
alter table public.users drop column if exists phone;
alter table public.users drop column if exists birthdate;


-- =============================================================================
-- 2. SENSITIVE PROFILE DATA — public.user_private
--
-- Why this is not on `users`: migration 013 added "users: approved members
-- read directory" — select on ALL COLUMNS of ALL ROWS, for any approved user.
-- That policy is load-bearing (mention lists, member/assignee pickers) and is
-- not row-level narrowable, so any column added to `users` is readable
-- agency-wide, teammate and client alike, the moment it exists. A phone
-- number and a full date of birth are not that kind of information — unlike
-- timezone, job_title, location, bio, company and company_website, which are
-- shown to colleagues by design (PersonMeta, the client list) and carry no
-- comparable exposure. Column-level REVOKE cannot fix this either: it applies
-- to the `authenticated` role as a whole, so it would also block an admin
-- reading a client's phone number and a person reading their own.
--
-- Splitting the two sensitive columns into their own table, gated by their
-- own RLS, is the only fix that keeps `users` readable for mentions/pickers
-- while keeping phone and birthdate readable only by their owner and admins.
-- =============================================================================

create table if not exists public.user_private (
  user_id    uuid        primary key references public.users(id) on delete cascade,
  phone      text,
  birthdate  date,
  updated_at timestamptz not null default now()
);

comment on table public.user_private is
  'Phone and birthdate, split out of users because 013''s "approved members read directory" policy makes every users column readable by any approved member — see the header of this migration.';
comment on column public.user_private.phone is
  'Mirrors the old users.phone: 5-30 chars after btrim, when present. Owner + admin read/write only.';
comment on column public.user_private.birthdate is
  'Mirrors the old users.birthdate: must be in the past, when present. Owner + admin read/write only.';

alter table public.user_private drop constraint if exists user_private_phone_length;
alter table public.user_private add constraint user_private_phone_length
  check (phone is null or char_length(btrim(phone)) between 5 and 30);

-- A birthday in the future is a typo, not a fact.
alter table public.user_private drop constraint if exists user_private_birthdate_past;
alter table public.user_private add constraint user_private_birthdate_past
  check (birthdate is null or birthdate < current_date);

drop trigger if exists user_private_set_updated_at on public.user_private;
create trigger user_private_set_updated_at
  before update on public.user_private
  for each row execute function public.set_updated_at();

alter table public.user_private enable row level security;

-- Owner or admin, full stop — no directory-style read for anyone else.
drop policy if exists "user_private: owner or admin select" on public.user_private;
create policy "user_private: owner or admin select"
  on public.user_private for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_private: owner or admin insert" on public.user_private;
create policy "user_private: owner or admin insert"
  on public.user_private for insert
  with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_private: owner or admin update" on public.user_private;
create policy "user_private: owner or admin update"
  on public.user_private for update
  using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

-- No delete policy: the row goes with the user via ON DELETE CASCADE.


-- =============================================================================
-- 3. TIMEZONE VALIDATION
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
-- 4. AVATAR STORAGE
--
-- Public to read (avatars appear all over the portal, including in emails'
-- absence), but each user may only write inside a folder named after their own
-- id: avatars/{user_id}/{uuid}.{ext}.
--
-- comment-attachments (009) lets ANY authenticated user write ANY path and is
-- world-readable — repeating that here would let anyone overwrite anyone's
-- face. The browser-side checks in AvatarUploader are a convenience only;
-- file_size_limit and allowed_mime_types below are what actually survive a
-- direct API call.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true,
  2097152, -- 2 MB, in bytes
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  file_size_limit     = excluded.file_size_limit,
  allowed_mime_types   = excluded.allowed_mime_types;

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
--   - As a signed-in client, `select phone from user_private where user_id =
--     '<some other user>'` → 0 rows; the same query with your own id → your row
--     (or 0 rows if you have never saved one).
--   - As an admin, the same query against another user's id → their row.
--   - As a signed-in client, `select * from users where id = '<some other
--     user>'` still returns their row (013's directory policy) but it has no
--     phone/birthdate columns to leak.
--   - Upload to avatars/{someone-else-id}/x.png → rejected by RLS.
--   - Upload a 3 MB file, or a .gif, to your own avatars/{your-id}/ folder →
--     rejected by the bucket's file_size_limit / allowed_mime_types.
--   - update users set role = 'admin' as a client → still rejected by 016's
--     guard.
-- =============================================================================
