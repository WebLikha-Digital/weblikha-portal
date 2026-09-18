# Onboarding and Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every user completes a short required onboarding on first sign-in (timezone, phone, company for clients, optional photo), can edit their details afterwards on a profile page, and those details show up where people already look.

**Architecture:** Migration 024 adds nullable profile columns to `users`, a timezone-validating trigger, and an `avatars` storage bucket whose writes are scoped to each user's own folder. `(portal)/layout.tsx` gains one redirect — no `onboarded_at` sends the user to `/onboarding`, which lives in the `(auth)` group outside the portal shell. A shared validation module keeps the client and the Server Actions enforcing identical rules.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript strict, Supabase Postgres + RLS + Storage, Tailwind via CSS tokens, `Intl` for timezones and local time.

**Spec:** `docs/superpowers/specs/2026-09-18-onboarding-and-profiles-design.md`

## Global Constraints

- **No test framework exists in this repo, by standing decision.** Do not add one. Each task's gate is `npx tsc --noEmit` exiting 0 plus its named check.
- **`npx tsc --noEmit` stays at zero errors.** `strict`, `noUncheckedIndexedAccess` and **`exactOptionalPropertyTypes`** are on — an optional prop that may receive `undefined` must be typed `?: T | undefined`.
- **No `any`.** Use `unknown` and narrow, or a typed cast through `unknown` for Supabase results.
- **Never hardcode colors, sizes or fonts in components.** Tailwind token classes only. The `AVATAR_COLORS` hex list in `src/components/ui/avatar.tsx` is pre-existing and out of scope.
- **Mobile and desktop classes in the same pass.** The onboarding screen and profile page are both phone-first: a client may well open the invite on a phone.
- **Every destructive action uses `confirmDialog`** from `@/components/ui/confirm-dialog`. "Remove photo" is destructive; a plain Save is not.
- **Every interactive element:** hover, `active:` press cue, `focus-visible:ring`, pending state that disables it in flight, toast outcome.
- **Imports:** primitives from `@/components/ui`; `confirmDialog`, `toast`, `withToast` directly from their files.
- **Service-role client (`@/lib/supabase/admin`) is never imported from a `'use client'` module.** `'use server'` files export only async functions.
- **Field limits, enforced identically in the DB check, the shared validator and the input's `maxLength`:** phone 5–30, timezone 3–64, job title ≤ 80, location ≤ 120, bio ≤ 500, company ≤ 120, company website ≤ 200 and must start `http://` or `https://`, birthdate in the past.
- **Avatar limits, enforced in the upload component:** 2 MB, `image/jpeg`, `image/png`, `image/webp` only.
- **Do not touch `guard_user_privileged_columns()` (016).** It already blocks self-changes to `role`, `approved` and `email`; the new columns are meant to be self-editable.
- **No password UI anywhere in this feature.** The invite link and the forgot-password email already cover it.
- **Every SQL function** pins `set search_path = public, pg_temp`. Migrations idempotent: `drop … if exists` / `create or replace` / `if not exists`.
- **Commits** authored `Matthew Kim <weblikhadigital@gmail.com>`, ending `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Stage files by explicit path; never `git add -A` (untracked `.superpowers/` must not be committed; `tsconfig.tsbuildinfo` stays unstaged).
- **Branch:** create `feature/onboarding-profiles` from `main` before Task 1. Migration 024 is applied by Matthew in Task 7, before the branch merges.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/024_user_profiles.sql` | **Create.** Profile columns + checks, timezone trigger, `avatars` bucket + owner-scoped policies. |
| `src/types/index.ts` | **Modify.** New `User` fields. |
| `src/lib/profile.ts` | **Create.** Limits, `profileDraftError`, `onboardingDraftError`, `timezoneOptions`, `detectTimezone`, `formatLocalTime`, `formatBirthday`. |
| `src/app/(auth)/onboarding/actions.ts` | **Create.** `completeOnboarding`. |
| `src/app/(auth)/onboarding/page.tsx` | **Create.** Server half: reads the profile, redirects if already onboarded. |
| `src/components/modules/profile/OnboardingForm.tsx` | **Create.** The one-screen form. |
| `src/components/modules/profile/AvatarUploader.tsx` | **Create.** Pick, upload, remove — shared by onboarding and profile. |
| `src/components/modules/profile/ProfileForm.tsx` | **Create.** The profile page form. |
| `src/app/(portal)/profile/actions.ts` | **Create.** `updateProfile`, `setAvatarUrl`. |
| `src/app/(portal)/profile/page.tsx` | **Create.** Server half. |
| `src/app/(portal)/profile/loading.tsx` | **Create.** Skeleton (standing rule #3). |
| `src/app/(portal)/layout.tsx` | **Modify.** The onboarding redirect. |
| `src/components/layout/sidebar.tsx` | **Modify.** Link the user block to `/profile`. |
| `src/components/layout/MobileNav.tsx` | **Modify.** Same link in the drawer. |
| `src/components/modules/profile/PersonMeta.tsx` | **Create.** Local-time / job-title / birthday chips. |
| `src/components/modules/team/MembersTab.tsx` | **Modify.** Show them. |
| `src/components/modules/clients/ClientList.tsx` | **Modify.** Company, phone, local time. |
| `src/components/modules/projects/TeamTab.tsx` | **Modify.** Job title + local time. |
| `CLAUDE.md`, `MEMORY.md` | **Modify.** Migration log, schema, structure, stage notes. |

---

## Task 1: Migration 024 and types

**Files:**
- Create: `supabase/migrations/024_user_profiles.sql`
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: `users.phone|birthdate|timezone|job_title|location|bio|company|company_website|onboarded_at`; function `public.guard_user_timezone()`; storage bucket `avatars`; TypeScript `User` carrying the same fields.

- [ ] **Step 1: Branch**

```bash
git checkout main
git pull --ff-only
git checkout -b feature/onboarding-profiles
```

Expected: `Switched to a new branch 'feature/onboarding-profiles'`.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/024_user_profiles.sql`:

```sql
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
```

- [ ] **Step 3: Extend the User type**

In `src/types/index.ts`, replace the `User` interface with:

```ts
export interface User {
  id:              string
  email:           string
  name:            string
  role:            UserRole
  specialty:       Specialty        // legacy primary skill — prefer skills[0]
  skills:          string[]         // ordered; first element is primary display skill
  employment_type: EmploymentType
  avatar_url:      string | null
  approved:        boolean
  // Profile (migration 024). All optional — a half-filled profile is normal.
  phone:           string | null
  birthdate:       string | null    // ISO date (YYYY-MM-DD)
  timezone:        string | null    // IANA zone, e.g. Asia/Manila
  job_title:       string | null
  location:        string | null
  bio:             string | null
  company:         string | null    // clients only
  company_website: string | null    // clients only
  onboarded_at:    string | null    // null → /onboarding
  created_at:      string
  updated_at:      string
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0. Every new field is nullable and nothing constructs a `User` literal outside Supabase reads — if an error does appear, report the file rather than casting it away.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/024_user_profiles.sql src/types/index.ts
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Migration 024: profile columns, timezone validation, avatars bucket

Avatar writes are scoped to each user's own folder — the shape
comment-attachments (009) should have had. No new RLS on users: 016's guard
already blocks role/approved/email and everything here is self-editable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Shared profile rules

**Files:**
- Create: `src/lib/profile.ts`

**Interfaces:**
- Produces:

```ts
export const PHONE_MIN = 5, PHONE_MAX = 30, JOB_TITLE_MAX = 80,
             LOCATION_MAX = 120, BIO_MAX = 500, COMPANY_MAX = 120, WEBSITE_MAX = 200
export interface OnboardingDraft { phone: string; timezone: string; company: string }
export interface ProfileDraft {
  name: string; phone: string; timezone: string; jobTitle: string
  location: string; bio: string; birthdate: string; company: string; companyWebsite: string
}
export function onboardingDraftError(draft: OnboardingDraft, isClient: boolean): string | null
export function profileDraftError(draft: ProfileDraft, isClient: boolean): string | null
export function detectTimezone(): string
export function timezoneOptions(): string[]
export function formatLocalTime(timezone: string | null, now?: Date): string | null
export function formatBirthday(birthdate: string | null): string | null
```

- [ ] **Step 1: Write the module**

Create `src/lib/profile.ts`:

```ts
/**
 * PROFILE — SHARED RULES
 * ─────────────────────────────────────────────────────────────────────────────
 * Used by the onboarding screen, the profile form and the Server Actions, so
 * the browser validates exactly what the server enforces. Production Next.js
 * redacts thrown Server Action messages, so anything a person can fix must be
 * caught client-side by these functions first.
 *
 * The numeric limits mirror the CHECK constraints in migration 024 — change
 * them together.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const PHONE_MIN     = 5
export const PHONE_MAX     = 30
export const JOB_TITLE_MAX = 80
export const LOCATION_MAX  = 120
export const BIO_MAX       = 500
export const COMPANY_MAX   = 120
export const WEBSITE_MAX   = 200

export interface OnboardingDraft {
  phone:    string
  timezone: string
  company:  string
}

export interface ProfileDraft {
  name:           string
  phone:          string
  timezone:       string
  jobTitle:       string
  location:       string
  bio:            string
  birthdate:      string   // '' or YYYY-MM-DD
  company:        string
  companyWebsite: string
}

/** Digits, spaces and the usual separators. Deliberately not a strict E.164 check. */
const PHONE_RE = /^[+()\-.\s\d]+$/

function phoneError(phone: string): string | null {
  const value = phone.trim()
  if (value.length < PHONE_MIN || value.length > PHONE_MAX) {
    return `A phone number is between ${PHONE_MIN} and ${PHONE_MAX} characters.`
  }
  if (!PHONE_RE.test(value)) return 'A phone number can only contain digits, spaces, + ( ) - and .'
  return null
}

function timezoneError(timezone: string): string | null {
  if (!timezone.trim()) return 'Pick your timezone.'
  if (timezone.length < 3 || timezone.length > 64) return 'That timezone is not valid.'
  return null
}

export function onboardingDraftError(draft: OnboardingDraft, isClient: boolean): string | null {
  const phone = phoneError(draft.phone)
  if (phone) return phone

  const timezone = timezoneError(draft.timezone)
  if (timezone) return timezone

  if (isClient) {
    const company = draft.company.trim()
    if (!company) return 'Tell us which company you work for.'
    if (company.length > COMPANY_MAX) return `A company name is at most ${COMPANY_MAX} characters.`
  }
  return null
}

export function profileDraftError(draft: ProfileDraft, isClient: boolean): string | null {
  if (!draft.name.trim()) return 'Your name cannot be empty.'
  if (draft.name.trim().length > 100) return 'Your name is at most 100 characters.'

  const phone = phoneError(draft.phone)
  if (phone) return phone

  const timezone = timezoneError(draft.timezone)
  if (timezone) return timezone

  if (draft.jobTitle.trim().length > JOB_TITLE_MAX) {
    return `A job title is at most ${JOB_TITLE_MAX} characters.`
  }
  if (draft.location.trim().length > LOCATION_MAX) {
    return `A location is at most ${LOCATION_MAX} characters.`
  }
  if (draft.bio.trim().length > BIO_MAX) return `A bio is at most ${BIO_MAX} characters.`

  if (draft.birthdate) {
    const date = new Date(`${draft.birthdate}T00:00:00`)
    if (Number.isNaN(date.getTime())) return 'That birthday is not a valid date.'
    if (date >= new Date()) return 'A birthday has to be in the past.'
  }

  if (isClient) {
    const company = draft.company.trim()
    if (!company) return 'Tell us which company you work for.'
    if (company.length > COMPANY_MAX) return `A company name is at most ${COMPANY_MAX} characters.`

    const site = draft.companyWebsite.trim()
    if (site) {
      if (site.length > WEBSITE_MAX) return `A website address is at most ${WEBSITE_MAX} characters.`
      if (!/^https?:\/\//i.test(site)) return 'A website address has to start with http:// or https://'
    }
  }
  return null
}

/** The browser's own zone, used to pre-select the picker. */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Every IANA zone the browser knows. `supportedValuesOf` is widely available but
 * not universal, so fall back to a short list covering the agency and the
 * regions its clients are in rather than shipping an empty picker.
 */
export function timezoneOptions(): string[] {
  const fallback = [
    'Asia/Manila', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Dubai', 'Asia/Kolkata',
    'Australia/Sydney', 'Australia/Perth', 'Europe/London', 'Europe/Berlin',
    'Europe/Madrid', 'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'America/Toronto', 'Pacific/Auckland', 'UTC',
  ]
  try {
    const supported = Intl.supportedValuesOf?.('timeZone')
    if (supported && supported.length > 0) return [...supported]
  } catch {
    // fall through
  }
  return fallback
}

/** "9:04 PM" in that person's zone, or null when we don't know it. */
export function formatLocalTime(timezone: string | null, now: Date = new Date()): string | null {
  if (!timezone) return null
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour:     'numeric',
      minute:   '2-digit',
    }).format(now)
  } catch {
    return null
  }
}

/** "Mar 14" — day and month only. A year of birth does not belong on a shared screen. */
export function formatBirthday(birthdate: string | null): string | null {
  if (!birthdate) return null
  const date = new Date(`${birthdate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0. If `Intl.supportedValuesOf` is not in the TypeScript lib for this target, keep the optional call (`Intl.supportedValuesOf?.(…)`) and add a narrow declaration in this file rather than widening `tsconfig`; report what you did.

- [ ] **Step 3: Commit**

```bash
git add src/lib/profile.ts
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Shared profile validation, timezone and local-time helpers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Avatar uploader

**Files:**
- Create: `src/components/modules/profile/AvatarUploader.tsx`

**Interfaces:**
- Consumes: migration 024's `avatars` bucket (Task 1).
- Produces:

```ts
export function AvatarUploader(props: {
  name: string
  userId: string
  value: string | null
  onChange: (url: string | null) => void
  disabled?: boolean | undefined
}): JSX.Element
```

- [ ] **Step 1: Write the component**

Create `src/components/modules/profile/AvatarUploader.tsx`:

```tsx
'use client'
/**
 * AVATAR UPLOADER
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared by the onboarding screen and the profile form. Uploads straight to the
 * `avatars` bucket from the browser, then hands the public URL back through
 * onChange — the caller decides when to persist it.
 *
 * Migration 024 scopes writes to `avatars/{user_id}/…`, so the path below is
 * not a convention: a path with anyone else's id is rejected by RLS.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useRef, useState } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { Avatar } from '@/components/ui'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED   = ['image/jpeg', 'image/png', 'image/webp']

interface AvatarUploaderProps {
  name:      string
  userId:    string
  value:     string | null
  onChange:  (url: string | null) => void
  disabled?: boolean | undefined
}

export function AvatarUploader({
  name, userId, value, onChange, disabled = false,
}: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!ALLOWED.includes(file.type)) {
      toast.error('Photos have to be a JPEG, PNG or WebP.')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('That photo is over 2 MB. Try a smaller one.')
      return
    }

    setBusy(true)
    try {
      const supabase = createClient()
      const ext  = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${userId}/${crypto.randomUUID()}.${ext}`

      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, file, { contentType: file.type })
      if (error) {
        toast.error(`Could not upload that photo: ${error.message}`)
        return
      }

      const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
      onChange(url)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const ok = await confirmDialog({
      title:        'Remove your photo?',
      message:      'Your initials will be shown instead.',
      confirmLabel: 'Remove',
    })
    if (ok) onChange(null)
  }

  const button =
    'inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-subtle text-xs ' +
    'text-secondary hover:text-primary hover:border-[var(--color-border-default)] ' +
    'active:opacity-80 transition-colors duration-150 focus-visible:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} src={value} size="xl" />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={button}
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy
            ? <><Loader2 className="size-3.5 animate-spin" /> Uploading…</>
            : <><Upload className="size-3.5" /> {value ? 'Change photo' : 'Add a photo'}</>}
        </button>

        {value && (
          <button
            type="button"
            className={button}
            disabled={disabled || busy}
            onClick={() => { void remove() }}
          >
            <X className="size-3.5" /> Remove
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={e => { void handleFile(e) }}
        className="hidden"
      />
    </div>
  )
}
```

- [ ] **Step 2: Confirm the Avatar size exists**

Run: `grep -n "xl:" src/components/ui/avatar.tsx`
Expected: a line defining an `xl` size. If there is none, use the largest size the file does define and say so in your report — do not add a size variant.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit` — expected exit 0.
Run: `npm run lint` — expected: only the pre-existing `confirm-dialog.tsx` warning.

- [ ] **Step 4: Commit**

```bash
git add src/components/modules/profile/AvatarUploader.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Avatar uploader, writing to each user's own folder

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Onboarding screen and the gate

**Files:**
- Create: `src/app/(auth)/onboarding/actions.ts`
- Create: `src/app/(auth)/onboarding/page.tsx`
- Create: `src/components/modules/profile/OnboardingForm.tsx`
- Modify: `src/app/(portal)/layout.tsx`

**Interfaces:**
- Consumes: `onboardingDraftError`, `detectTimezone`, `timezoneOptions` (Task 2); `AvatarUploader` (Task 3).
- Produces: `completeOnboarding(input: { phone: string; timezone: string; company: string; avatarUrl: string | null }): Promise<void>`.

- [ ] **Step 1: Write the Server Action**

Create `src/app/(auth)/onboarding/actions.ts`:

```ts
'use server'
/**
 * ONBOARDING ACTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Sets the profile fields collected on first sign-in and stamps onboarded_at,
 * which is the only thing (portal)/layout.tsx checks. Nothing else writes it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { onboardingDraftError } from '@/lib/profile'

export async function completeOnboarding(input: {
  phone:     string
  timezone:  string
  company:   string
  avatarUrl: string | null
}): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  const isClient = profile?.role === 'client'

  const problem = onboardingDraftError(input, isClient)
  if (problem) throw new Error(problem)

  const { data, error } = await supabase
    .from('users')
    .update({
      phone:        input.phone.trim(),
      timezone:     input.timezone,
      company:      isClient ? input.company.trim() : null,
      avatar_url:   input.avatarUrl,
      onboarded_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Could not save your details. Try again.')

  revalidatePath('/', 'layout')
}
```

- [ ] **Step 2: Write the form**

Create `src/components/modules/profile/OnboardingForm.tsx`:

```tsx
'use client'
/**
 * ONBOARDING FORM
 * ─────────────────────────────────────────────────────────────────────────────
 * One screen, four fields, most of them pre-filled or optional. The timezone is
 * pre-selected from the browser, so the common case is confirming rather than
 * choosing from 400 zones.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import {
  COMPANY_MAX, PHONE_MAX, detectTimezone, onboardingDraftError, timezoneOptions,
} from '@/lib/profile'
import { AvatarUploader } from './AvatarUploader'
import { completeOnboarding } from '@/app/(auth)/onboarding/actions'

interface OnboardingFormProps {
  userId:    string
  name:      string
  isClient:  boolean
  avatarUrl: string | null
}

export function OnboardingForm({ userId, name, isClient, avatarUrl }: OnboardingFormProps) {
  const router = useRouter()
  const zones  = useMemo(() => timezoneOptions(), [])

  const [avatar,   setAvatar]   = useState<string | null>(avatarUrl)
  const [phone,    setPhone]    = useState('')
  const [timezone, setTimezone] = useState(() => detectTimezone())
  const [company,  setCompany]  = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const problem = onboardingDraftError({ phone, timezone, company }, isClient)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        await completeOnboarding({ phone, timezone, company, avatarUrl: avatar })
        toast.success('Welcome aboard.')
        router.replace('/dashboard')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5 text-left">
      {error && (
        <div role="alert" className="rounded-md bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <AvatarUploader
        name={name}
        userId={userId}
        value={avatar}
        onChange={setAvatar}
        disabled={isPending}
      />

      <Input
        label="Phone number"
        id="onboarding-phone"
        value={phone}
        onChange={e => setPhone(e.target.value)}
        maxLength={PHONE_MAX}
        placeholder="+63 912 345 6789"
        disabled={isPending}
        autoComplete="tel"
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="onboarding-timezone" className="text-xs font-medium text-secondary">
          Timezone
        </label>
        <select
          id="onboarding-timezone"
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
          disabled={isPending}
          className="h-10 rounded-md border border-[var(--color-border-default)] bg-bg-surface-1 px-3 text-sm text-primary focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
        >
          {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
        </select>
        <p className="text-2xs text-tertiary">
          So the team can see when you&apos;re around. We&apos;ve guessed from your browser.
        </p>
      </div>

      {isClient && (
        <Input
          label="Company"
          id="onboarding-company"
          value={company}
          onChange={e => setCompany(e.target.value)}
          maxLength={COMPANY_MAX}
          placeholder="Acme Inc."
          disabled={isPending}
          autoComplete="organization"
        />
      )}

      <Button type="submit" size="md" loading={isPending} className="w-full">
        Finish
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: Write the page**

Create `src/app/(auth)/onboarding/page.tsx`:

```tsx
/**
 * ONBOARDING PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Deliberately in the (auth) group, outside the portal shell: a page inside
 * (portal) would be caught by the same gate that sent the user here and
 * redirect to itself forever.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingForm } from '@/components/modules/profile/OnboardingForm'

export const metadata: Metadata = { title: 'Welcome' }

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, name, role, avatar_url, approved, onboarded_at')
    .eq('id', authUser.id)
    .single()

  if (!profile) redirect('/login?error=profile_missing')
  if (profile.role !== 'admin' && !profile.approved) redirect('/pending')
  if (profile.onboarded_at) redirect('/dashboard')

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://cdn.prod.website-files.com/6829ba317137e68337ab4113/6829e463f9165ea007955225_Weblikha-Logo.svg"
            alt="Weblikha"
            className="mx-auto h-12 w-auto"
          />
        </div>

        <div className="card p-6 sm:p-8">
          <h1 className="text-lg font-display font-semibold text-primary">
            Welcome to the Weblikha portal
          </h1>
          <p className="mt-1 mb-6 text-sm text-secondary">
            A few details so the team knows who you are and when you&apos;re around.
          </p>

          <OnboardingForm
            userId={profile.id}
            name={profile.name}
            isClient={profile.role === 'client'}
            avatarUrl={profile.avatar_url}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add the gate**

In `src/app/(portal)/layout.tsx`, find the approval gate:

```tsx
  // Approval gate — admins always pass, providers/clients must be approved
  if (profile.role !== 'admin' && !profile.approved) {
    redirect('/pending')
  }
```

and add directly below it:

```tsx
  // Onboarding gate — everyone completes it once. Keyed on the timestamp alone,
  // so clearing a profile field later does not send someone back here.
  if (!profile.onboarded_at) {
    redirect('/onboarding')
  }
```

- [ ] **Step 5: Typecheck, lint, build**

Run: `npx tsc --noEmit` — expected exit 0.
Run: `npm run lint` — expected: only the pre-existing `confirm-dialog.tsx` warning.
Run: `npm run build` — expected success, with `/onboarding` listed among the routes.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(auth)/onboarding/actions.ts" "src/app/(auth)/onboarding/page.tsx" src/components/modules/profile/OnboardingForm.tsx "src/app/(portal)/layout.tsx"
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Required onboarding on first sign-in

One screen — photo, phone, timezone, and company for clients — gated by the
portal layout the same way the approval check already gates /pending.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Profile page

**Files:**
- Create: `src/app/(portal)/profile/actions.ts`
- Create: `src/app/(portal)/profile/page.tsx`
- Create: `src/app/(portal)/profile/loading.tsx`
- Create: `src/components/modules/profile/ProfileForm.tsx`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/MobileNav.tsx`

**Interfaces:**
- Consumes: `profileDraftError`, `timezoneOptions`, limits (Task 2); `AvatarUploader` (Task 3).
- Produces: `updateProfile(draft: ProfileDraft & { avatarUrl: string | null }): Promise<void>`.

- [ ] **Step 1: Write the Server Action**

Create `src/app/(portal)/profile/actions.ts`:

```ts
'use server'
/**
 * PROFILE ACTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Self-service edits only. Migration 016's guard_user_privileged_columns()
 * rejects any attempt to change role, approved or email here, so this action
 * does not need to re-check them — but it must never pass them through either.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { profileDraftError, type ProfileDraft } from '@/lib/profile'

export async function updateProfile(
  draft: ProfileDraft & { avatarUrl: string | null },
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  const isClient = profile?.role === 'client'

  const problem = profileDraftError(draft, isClient)
  if (problem) throw new Error(problem)

  const blank = (value: string) => (value.trim() === '' ? null : value.trim())

  const { data, error } = await supabase
    .from('users')
    .update({
      name:            draft.name.trim(),
      phone:           blank(draft.phone),
      timezone:        draft.timezone,
      job_title:       blank(draft.jobTitle),
      location:        blank(draft.location),
      bio:             blank(draft.bio),
      birthdate:       draft.birthdate || null,
      company:         isClient ? blank(draft.company) : null,
      company_website: isClient ? blank(draft.companyWebsite) : null,
      avatar_url:      draft.avatarUrl,
    })
    .eq('id', user.id)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Could not save your profile. Try again.')

  // The sidebar and every avatar in the portal read this row.
  revalidatePath('/', 'layout')
}
```

- [ ] **Step 2: Write the form**

Create `src/components/modules/profile/ProfileForm.tsx`:

```tsx
'use client'
/**
 * PROFILE FORM
 * ─────────────────────────────────────────────────────────────────────────────
 * One form, one Save, disabled until something changes. Email is read-only:
 * public.users.email mirrors auth.users.email and the invite lookups key off
 * it, so migration 016 blocks changing it here.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState, useTransition } from 'react'
import { Button, Input, Textarea } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import {
  BIO_MAX, COMPANY_MAX, JOB_TITLE_MAX, LOCATION_MAX, PHONE_MAX, WEBSITE_MAX,
  profileDraftError, timezoneOptions, type ProfileDraft,
} from '@/lib/profile'
import { updateProfile } from '@/app/(portal)/profile/actions'
import { AvatarUploader } from './AvatarUploader'
import type { User } from '@/types'

interface ProfileFormProps {
  user: User
}

export function ProfileForm({ user }: ProfileFormProps) {
  const zones = useMemo(() => timezoneOptions(), [])
  const isClient = user.role === 'client'

  const initial: ProfileDraft = useMemo(() => ({
    name:           user.name,
    phone:          user.phone           ?? '',
    timezone:       user.timezone        ?? '',
    jobTitle:       user.job_title       ?? '',
    location:       user.location        ?? '',
    bio:            user.bio             ?? '',
    birthdate:      user.birthdate       ?? '',
    company:        user.company         ?? '',
    companyWebsite: user.company_website ?? '',
  }), [user])

  const [draft, setDraft]   = useState<ProfileDraft>(initial)
  const [avatar, setAvatar] = useState<string | null>(user.avatar_url)
  const [error, setError]   = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const dirty =
    avatar !== user.avatar_url ||
    (Object.keys(initial) as (keyof ProfileDraft)[]).some(key => draft[key] !== initial[key])

  function set<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const problem = profileDraftError(draft, isClient)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        await updateProfile({ ...draft, avatarUrl: avatar })
        toast.success('Profile saved.')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save your profile.')
      }
    })
  }

  const sectionTitle = 'text-sm font-medium text-primary'

  return (
    <form onSubmit={submit} className="space-y-8 max-w-2xl">
      {error && (
        <div role="alert" className="rounded-md bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <section className="space-y-3">
        <h2 className={sectionTitle}>Photo</h2>
        <AvatarUploader
          name={draft.name || user.name}
          userId={user.id}
          value={avatar}
          onChange={setAvatar}
          disabled={isPending}
        />
      </section>

      <section className="space-y-4">
        <h2 className={sectionTitle}>About you</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name" id="profile-name" value={draft.name}
            onChange={e => set('name', e.target.value)} maxLength={100} disabled={isPending}
          />
          <Input
            label="Job title" id="profile-job-title" value={draft.jobTitle}
            onChange={e => set('jobTitle', e.target.value)} maxLength={JOB_TITLE_MAX}
            placeholder="Webflow developer" disabled={isPending}
          />
          <Input
            label="Birthday" id="profile-birthdate" type="date" value={draft.birthdate}
            onChange={e => set('birthdate', e.target.value)} disabled={isPending}
          />
          <Input
            label="Location" id="profile-location" value={draft.location}
            onChange={e => set('location', e.target.value)} maxLength={LOCATION_MAX}
            placeholder="Cebu, Philippines" disabled={isPending}
          />
        </div>
        <Textarea
          label="Short bio" id="profile-bio" value={draft.bio} rows={3}
          onChange={e => set('bio', e.target.value)} maxLength={BIO_MAX} disabled={isPending}
        />
      </section>

      <section className="space-y-4">
        <h2 className={sectionTitle}>Contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Phone" id="profile-phone" value={draft.phone}
            onChange={e => set('phone', e.target.value)} maxLength={PHONE_MAX}
            disabled={isPending} autoComplete="tel"
          />
          <Input label="Email" id="profile-email" value={user.email} disabled readOnly />
        </div>
        <p className="text-2xs text-tertiary">
          Your email is how you sign in and can&apos;t be changed here — ask an admin.
        </p>
      </section>

      {isClient && (
        <section className="space-y-4">
          <h2 className={sectionTitle}>Company</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Company" id="profile-company" value={draft.company}
              onChange={e => set('company', e.target.value)} maxLength={COMPANY_MAX}
              disabled={isPending} autoComplete="organization"
            />
            <Input
              label="Website" id="profile-company-website" value={draft.companyWebsite}
              onChange={e => set('companyWebsite', e.target.value)} maxLength={WEBSITE_MAX}
              placeholder="https://acme.com" disabled={isPending}
            />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className={sectionTitle}>Preferences</h2>
        <div className="flex flex-col gap-1 max-w-sm">
          <label htmlFor="profile-timezone" className="text-xs font-medium text-secondary">
            Timezone
          </label>
          <select
            id="profile-timezone"
            value={draft.timezone}
            onChange={e => set('timezone', e.target.value)}
            disabled={isPending}
            className="h-10 rounded-md border border-[var(--color-border-default)] bg-bg-surface-1 px-3 text-sm text-primary focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
          >
            {draft.timezone === '' && <option value="">Pick a timezone</option>}
            {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
          </select>
          <p className="text-2xs text-tertiary">
            Shown to the team so they know your local time.
          </p>
        </div>
      </section>

      <div className="flex items-center gap-3 border-t border-subtle pt-5">
        <Button type="submit" size="md" loading={isPending} disabled={!dirty}>
          Save changes
        </Button>
        {dirty && !isPending && (
          <span className="text-2xs text-tertiary">You have unsaved changes.</span>
        )}
      </div>
    </form>
  )
}
```

Before relying on `Textarea`'s `label` prop, check `src/components/ui/input.tsx` — `Textarea` is exported from the same file. If it does not take `label`, wrap it the way the other forms in this repo do and note the deviation.

- [ ] **Step 3: Write the page and its skeleton**

Create `src/app/(portal)/profile/page.tsx`:

```tsx
/**
 * PROFILE PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Your own details. Viewing someone else's profile is not a thing here — the
 * Team tab already lists people.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileForm } from '@/components/modules/profile/ProfileForm'
import type { User } from '@/types'

export const metadata: Metadata = { title: 'Profile' }

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('*').eq('id', authUser.id).single()
  if (!profile) redirect('/login?error=profile_missing')

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-xl font-display font-semibold text-primary">Profile</h1>
        <p className="text-sm text-secondary mt-1">
          How you appear to the rest of the portal.
        </p>
      </div>

      <ProfileForm user={profile as User} />
    </div>
  )
}
```

Create `src/app/(portal)/profile/loading.tsx`:

```tsx
export default function ProfileLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl animate-pulse">
      <div className="mb-8">
        <div className="h-6 w-32 rounded bg-bg-surface-3" />
        <div className="mt-2 h-4 w-64 rounded bg-bg-surface-3" />
      </div>

      <div className="max-w-2xl space-y-8">
        <div className="flex items-center gap-4">
          <div className="size-16 rounded-full bg-bg-surface-3" />
          <div className="h-8 w-32 rounded bg-bg-surface-3" />
        </div>

        {[0, 1, 2].map(section => (
          <div key={section} className="space-y-4">
            <div className="h-4 w-24 rounded bg-bg-surface-3" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-10 rounded bg-bg-surface-3" />
              <div className="h-10 rounded bg-bg-surface-3" />
            </div>
          </div>
        ))}

        <div className="h-10 w-32 rounded bg-bg-surface-3" />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Link it from the nav**

In `src/components/layout/sidebar.tsx`, replace (around line 220):

```tsx
          <Avatar name={user.name} src={user.avatar_url} size="sm" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-primary">{user.name}</p>
              <p className="text-2xs text-secondary capitalize">{user.role}</p>
            </div>
          )}
```

with:

```tsx
          <Link
            href="/profile"
            title="Your profile"
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2.5 rounded-md transition-colors duration-fast',
              'hover:bg-bg-overlay active:opacity-80 focus-visible:outline-none',
              'focus-visible:ring-2 focus-visible:ring-brand',
              collapsed ? 'justify-center' : 'px-1 py-0.5',
            )}
          >
            <Avatar name={user.name} src={user.avatar_url} size="sm" />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">{user.name}</p>
                <p className="text-2xs text-secondary capitalize">{user.role}</p>
              </div>
            )}
          </Link>
```

The sign-out `<form>` stays where it is, outside the link — a link wrapping a form is invalid HTML. `Link` and `cn` are already imported in this file; confirm before adding either.

Then do the same in `src/components/layout/MobileNav.tsx`: read its drawer user block and wrap the avatar-and-name part in the same `/profile` link, matching that file's own markup rather than pasting the sidebar's classes wholesale. If the drawer closes on navigation via an `onClick`, keep that behaviour on the new link.

- [ ] **Step 5: Typecheck, lint, build**

Run: `npx tsc --noEmit` — expected exit 0.
Run: `npm run lint` — expected: only the pre-existing `confirm-dialog.tsx` warning.
Run: `npm run build` — expected success, `/profile` among the routes.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(portal)/profile/actions.ts" "src/app/(portal)/profile/page.tsx" "src/app/(portal)/profile/loading.tsx" src/components/modules/profile/ProfileForm.tsx src/components/layout/sidebar.tsx src/components/layout/MobileNav.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Profile page, reachable from the user block in both navs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Show the details where people look

**Files:**
- Create: `src/components/modules/profile/PersonMeta.tsx`
- Modify: `src/components/modules/team/MembersTab.tsx`
- Modify: `src/components/modules/clients/ClientList.tsx`
- Modify: `src/components/modules/projects/TeamTab.tsx`

**Interfaces:**
- Consumes: `formatLocalTime`, `formatBirthday` (Task 2).
- Produces:

```ts
export function PersonMeta(props: {
  timezone?: string | null | undefined
  jobTitle?: string | null | undefined
  birthdate?: string | null | undefined
  className?: string | undefined
}): JSX.Element | null
```

- [ ] **Step 1: Write the component**

Create `src/components/modules/profile/PersonMeta.tsx`:

```tsx
'use client'
/**
 * PERSON META
 * ─────────────────────────────────────────────────────────────────────────────
 * The small line under a person's name: what they do, what time it is where
 * they are, and their birthday. Renders nothing when we know none of it, so a
 * half-filled profile leaves no empty scaffolding on screen.
 *
 * Local time is computed in the viewer's browser on render — no ticking clock,
 * no server work. It can be a minute stale, which does not matter for "is it
 * reasonable to message them now".
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBirthday, formatLocalTime } from '@/lib/profile'

interface PersonMetaProps {
  timezone?:  string | null | undefined
  jobTitle?:  string | null | undefined
  birthdate?: string | null | undefined
  className?: string | undefined
}

export function PersonMeta({ timezone, jobTitle, birthdate, className }: PersonMetaProps) {
  const localTime = formatLocalTime(timezone ?? null)
  const birthday  = formatBirthday(birthdate ?? null)
  const title     = jobTitle?.trim() || null

  if (!localTime && !birthday && !title) return null

  // "Asia/Manila" → "Manila"; the city is the part people read.
  const city = timezone ? timezone.split('/').pop()?.replace(/_/g, ' ') : null

  return (
    <span className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-tertiary', className)}>
      {title && <span className="truncate">{title}</span>}

      {localTime && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Clock className="size-3" aria-hidden />
          {city} · {localTime}
        </span>
      )}

      {birthday && <span className="whitespace-nowrap">🎂 {birthday}</span>}
    </span>
  )
}
```

- [ ] **Step 2: Show it on the Team page**

In `src/components/modules/team/MembersTab.tsx`, add the import:

```tsx
import { PersonMeta } from '@/components/modules/profile/PersonMeta'
```

then replace (around line 256):

```tsx
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{user.name}</p>
                    <p className="text-2xs text-tertiary truncate">{user.email}</p>
                  </div>
```

with:

```tsx
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{user.name}</p>
                    <p className="text-2xs text-tertiary truncate">{user.email}</p>
                    <PersonMeta
                      timezone={user.timezone}
                      jobTitle={user.job_title}
                      birthdate={user.birthdate}
                      className="mt-0.5"
                    />
                  </div>
```

These rows are typed `User`, which Task 1 widened, so no prop-type change is needed. Check what `src/app/(portal)/team/page.tsx` selects for them: if it is `select('*')` the fields are already there; if it lists columns, add `timezone, job_title, birthdate`.

- [ ] **Step 3: Show it on the client list**

In `src/components/modules/clients/ClientList.tsx`, add the import:

```tsx
import { PersonMeta } from '@/components/modules/profile/PersonMeta'
```

then replace (around line 133):

```tsx
              <p className="text-2xs text-secondary truncate">{user.email}</p>
```

with:

```tsx
              <p className="text-2xs text-secondary truncate">{user.email}</p>
              <div className="flex flex-wrap items-center gap-x-2 text-2xs text-tertiary">
                {user.company && <span className="truncate">{user.company}</span>}
                {user.phone   && <span className="whitespace-nowrap">{user.phone}</span>}
              </div>
              <PersonMeta timezone={user.timezone} jobTitle={user.job_title} />
```

No birthday here: a client's birthday does not belong on an admin screen. If `ClientRow` in `src/types/index.ts` does not carry the new fields, look at how it is built in `src/app/(portal)/clients/page.tsx` and widen the type to match what the query returns — do not cast.

- [ ] **Step 4: Show it on a project's Team tab**

In `src/components/modules/projects/TeamTab.tsx`, add the import:

```tsx
import { PersonMeta } from '@/components/modules/profile/PersonMeta'
```

then, in the members list (around line 92), replace:

```tsx
                  <p className="text-sm font-medium text-primary">{m.user.name}</p>
                  <p className="text-2xs text-secondary capitalize">{m.user.specialty}</p>
```

with:

```tsx
                  <p className="text-sm font-medium text-primary">{m.user.name}</p>
                  <p className="text-2xs text-secondary capitalize">
                    {m.user.job_title?.trim() || m.user.specialty}
                  </p>
                  <PersonMeta timezone={m.user.timezone} />
```

A job title someone wrote themselves beats the legacy `specialty` enum, and the fallback keeps the line populated for anyone who has not set one.

**No birthday here**, and do not widen what the project page selects: clients can see this tab, and it deliberately shows names and roles only — no `employment_type`. The second list around line 121 is a different block (it already branches on `isClientViewer`); leave it alone.

- [ ] **Step 5: Typecheck, lint, build**

Run: `npx tsc --noEmit` — expected exit 0.
Run: `npm run lint` — expected: only the pre-existing `confirm-dialog.tsx` warning.
Run: `npm run build` — expected success.

- [ ] **Step 6: Commit**

```bash
git add src/components/modules/profile/PersonMeta.tsx src/components/modules/team/MembersTab.tsx src/components/modules/clients/ClientList.tsx src/components/modules/projects/TeamTab.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Show job title, local time and birthdays where people already look

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Docs, verification, apply

**Files:**
- Modify: `CLAUDE.md`
- Modify: `MEMORY.md`

Steps 1–5 are agent work. Steps 6–8 are Matthew's.

- [ ] **Step 1: Update CLAUDE.md**

- Migration log: after `023 editing window …` add `024 user profiles (profile columns, timezone guard, avatars bucket, onboarding gate)`.
- Database schema intro: change the range `001` → `024`.
- Core tables, the `users` row: append `phone, birthdate, timezone, job_title, location, bio, company, company_website, onboarded_at`.
- Project structure: add `modules/profile/  OnboardingForm, ProfileForm, AvatarUploader, PersonMeta`, the `profile/` route under `(portal)`, and `onboarding/` under `(auth)`.
- Under the auth flow: one line that a signed-in user with `onboarded_at` null is redirected to `/onboarding` by the portal layout, the same checkpoint that sends unapproved users to `/pending`.
- RLS summary: a bullet — profile columns are self-editable; 016's guard still blocks role, approval and email; the `avatars` bucket is public to read but each user may only write inside `avatars/{their own id}/`, unlike `comment-attachments`.

- [ ] **Step 2: Update MEMORY.md**

- `Last synced` → `2026-09-18`.
- A new section under the stage notes: **Onboarding and profiles (2026-09-18, migration 024)** — what was built, that the gate keys off `onboarded_at`, that every existing user meets the screen once, and that there is deliberately no password UI because the invite and reset flows cover it.
- "What Matthew still has to do": add `Apply 024 to dev, run the checklist, apply to prod, then merge — and NOTIFY pgrst, 'reload schema' after each, since the storage bucket and new columns are both new to PostgREST's cache.`

- [ ] **Step 3: Full check and build**

Run: `npm run check` — expected exit 0, only the pre-existing lint warning.
Run: `npm run build` — expected success.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md MEMORY.md
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Docs: onboarding, profiles and migration 024

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Review agents**

Dispatch `schema-reviewer` and `rls-security-reviewer` on `024_user_profiles.sql` and the two action files; `ui-convention-checker` and `design-token-auditor` on the four new components, the profile page and its skeleton.

Ask the RLS reviewer specifically: can a user upload into another user's avatar folder; can the profile action be used to change role, approval or email; does the onboarding gate leak anything to an unapproved user; is `avatars` being public-read acceptable given the file names are UUIDs.

Fix Critical and Important findings before Step 6.

- [ ] **Step 6 (Matthew): Apply 024 to dev**

```powershell
$env:DB_URL = Get-Clipboard
$env:DB_URL -replace ':[^:@/]+@', ':***@'
npx supabase migration list --db-url $env:DB_URL
npx supabase db push --db-url $env:DB_URL
npx supabase migration list --db-url $env:DB_URL
Remove-Item Env:DB_URL
```

Expected: masked URL shows `tydreidoqzndxjftpyzd`; the first list shows only 024 unapplied; the last shows 001–024 matched. Then run `NOTIFY pgrst, 'reload schema';` in the SQL editor.

- [ ] **Step 7 (Matthew): Manual checklist on dev**

1. Sign in as yourself → you land on `/onboarding`, not the dashboard.
2. Typing `/dashboard`, `/projects` or `/settings` still lands on `/onboarding`.
3. The timezone is pre-selected to your own; phone rejects `abc`; Finish goes to the dashboard.
4. Sign out and back in → straight to the dashboard, no second onboarding.
5. As a client (use a dev invite), the Company field appears and is required; as a provider it is absent.
6. `/profile` saves every field; reload shows them; the sidebar avatar updates.
7. Upload a 3 MB photo and a PDF → both refused with a readable message.
8. Team page shows local time, job title and birthday for whoever has them, nothing for who doesn't.
9. Client list shows company, phone and local time.
10. A project's Team tab shows job title and local time, and still no employment type for a client viewer.

- [ ] **Step 8 (Matthew): Prod, then merge**

Apply 024 with the prod URL (masked URL must show `vhsuyouczctnkvnnjzgg`), run `NOTIFY pgrst, 'reload schema';`, then merge. The portal layout reads `onboarded_at` on every authenticated page — on a database without 024 that column does not exist and every page errors.
