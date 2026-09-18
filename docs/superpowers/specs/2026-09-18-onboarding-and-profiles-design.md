# Onboarding and Profiles — Design

**Date:** 2026-09-18
**Status:** Approved, ready for an implementation plan
**Scope:** One sub-project. The Stage 4 client dashboard is separate work with its own spec.

---

## 1. Why

The portal knows three things about a person: their name, their email, and their role. A client
in another country has no timezone, so "due Friday" is ambiguous and nobody knows whether 9pm
here is a reasonable time to message them. Nobody has a photo, so every avatar is initials. There
is no way for anyone to correct their own details, because there is no profile page at all —
`avatar_url` has existed on `users` since migration 001 and nothing in the app has ever written
to it.

This adds the missing "my account" surface: a short, required onboarding on first sign-in, and a
profile page to edit afterwards.

### Decisions taken during design

| Question | Decision | Why |
|---|---|---|
| Is onboarding blocking? | **Required once**, then never again | A skippable form on a busy day is a form nobody fills in — and the timezone is the one field the app actually reasons about. Kept to four fields so it costs under a minute. |
| What is required? | **Timezone, phone, and company for clients.** Avatar optional in the wizard; everything else optional on the profile page | Timezone is the only field with behaviour attached; phone is the fallback when email fails; company identifies a client. A required avatar means a camera-roll round trip standing between a new client and what they signed in to see. |
| What does the timezone do? | **Shows other people's local time** on the Team tab, a project's Team tab and the client list | Answers the real question — is it reasonable to message this person now. Small, self-contained, and it uses the data the moment it is collected. |
| How is the gate enforced? | **A redirect in `(portal)/layout.tsx`** | Exactly how the approval gate already sends unapproved users to `/pending`. One checkpoint, impossible to route around. A modal is dismissible; middleware would be a second checkpoint that can disagree with the first. |
| What decides "onboarded"? | **An `onboarded_at` timestamp**, not "are the fields filled" | Otherwise clearing your own phone number drags you back into the wizard. |
| Password UI? | **None** | Clients set a password from the invite link (`/auth/confirm` → `/set-password`) and recover it through "Forgot password", which lands on the same screen. Both are tested in production. Team members sign in with Google and have no password at all, so a password card would be dead space for them. |

Out of scope: viewing someone else's profile page (the Team tab already lists people), admin
editing of another person's profile, notification preferences, a second factor, email changes
(migration 016 deliberately blocks them — `public.users.email` mirrors `auth.users.email` and the
invite lookups key off it), and anything to do with the client dashboard.

---

## 2. Data model — migration `024_user_profiles.sql`

All new columns on `public.users`, all nullable. A half-filled profile is a normal state.

| Column | Type | Notes |
|---|---|---|
| `phone` | text | `char_length(btrim(phone)) between 5 and 30` when present |
| `birthdate` | date | Past dates only; no year restriction |
| `timezone` | text | IANA name, e.g. `Asia/Manila`. `char_length between 3 and 64` |
| `job_title` | text | ≤ 80 chars |
| `location` | text | Free text, "Cebu, Philippines". ≤ 120 chars |
| `bio` | text | ≤ 500 chars |
| `company` | text | Clients. ≤ 120 chars |
| `company_website` | text | Clients. ≤ 200 chars, must start `http://` or `https://` when present |
| `onboarded_at` | timestamptz | Null until onboarding completes. The gate reads only this |

**Timezone validation.** A `CHECK` cannot subquery `pg_timezone_names`, so the constraint is a
length check and the real validation is a `BEFORE INSERT OR UPDATE` trigger that rejects a value
`pg_timezone_names` does not contain. The browser picker only offers real zones; the trigger is
what stops a direct API call from storing rubbish the "their local time" display would then choke
on.

**No new RLS policies.** `users: update own profile` already exists, and migration 016's
`guard_user_privileged_columns()` blacklists `role`, `approved` and `email` — everything else is
self-editable by design, which is exactly what these columns want. The guard needs no change, and
this migration must not touch it.

### Avatar storage

A new `avatars` bucket: public to read, with insert, update and delete each scoped to objects
whose path begins with the caller's own user id (`storage.foldername(name)[1] = auth.uid()::text`).
Files land at `{user_id}/{uuid}.{ext}`.

This deliberately does **not** reuse `comment-attachments`, whose policies let any authenticated
user write to any path and make the whole bucket world-readable (backlog #18). Repeating that
shape for profile photos would mean any signed-in user could overwrite anyone's face.

Limits enforced in the Server Action, not the bucket: 2 MB, and `image/jpeg`, `image/png` or
`image/webp` only.

---

## 3. The onboarding screen — `/onboarding`

Lives in the `(auth)` route group beside `/pending` and `/set-password`, so it renders outside the
portal shell. A page inside `(portal)` would be caught by the same gate that sent the user there
and redirect to itself forever.

One screen, no steps:

- **Heading:** "Welcome to the Weblikha portal" and one line — "A few details so the team knows
  who you are and when you're around."
- **Avatar** (optional): a circular initials placeholder with "Add a photo". Upload happens
  immediately on pick, so a slow connection does not block submit.
- **Phone** (required)
- **Timezone** (required): a `<select>` of `Intl.supportedValuesOf('timeZone')`, pre-selected from
  `Intl.DateTimeFormat().resolvedOptions().timeZone`, so the common case is confirming, not
  choosing. Falls back to a plain sorted list if the browser lacks `supportedValuesOf`.
- **Company** (required, clients only)
- **Finish** → `/dashboard`.

The layout gate and the action both key off `onboarded_at`, and `completeOnboarding` is the only
thing that sets it.

**Everyone currently in the database has `onboarded_at` null**, so every existing user — Matthew
included — meets this screen once on their next sign-in after deploy. That is how the data gets
collected, and it is worth expecting rather than being surprised by.

---

## 4. The profile page — `/profile`

Inside `(portal)`, in the nav under the signed-in user. One form, one Save button, disabled until
something changes:

- **Photo** — current avatar, "Change photo", "Remove".
- **About you** — name, job title, birthday, location, bio.
- **Contact** — phone; email shown read-only with a note that it cannot be changed here.
- **Company** — clients only: company, company website.
- **Preferences** — timezone.

Validation mirrors the database constraints through one shared module, so the client catches what
the server enforces (production Next.js redacts thrown Server Action messages, so anything a
person can fix must be caught client-side first). Save shows a toast; failures surface inline.

No password card, and no "delete my account" — account removal is an admin action through
`/clients` or the team page, and inventing a self-service path would cut across the revoke
behaviour that already exists.

---

## 5. Where the data shows up

Collecting a field and never showing it is how a profile page rots. Each new field earns a place:

- **Local time** — `Manila · 9:04 PM` beside a person on the Team page, a project's Team tab, and
  the admin client list. Computed per render with `Intl.DateTimeFormat` in the viewer's browser;
  no ticking clock, no server work. Nothing renders when a timezone is missing.
- **Job title** — under the name in those same three places.
- **Avatar** — nothing to build. The `Avatar` component already prefers `avatar_url` and falls
  back to initials; it has simply never had a URL to use.
- **Birthday** — `🎂 Mar 14` on the Team page. Day and month only, never the year: it is the part
  people act on, and it keeps a date of birth off a shared screen.
- **Company and phone** — on the admin client list, where "who is this and how do I reach them"
  is the actual question.

Bio and location appear on the profile page itself for now; they are the two fields with no
obvious second home, and inventing one would be scope for its own sake.

---

## 6. Verification

No test framework exists in this repo, by standing decision. Gates: `npx tsc --noEmit`,
`npm run lint`, `npm run build`, the schema / RLS / UI-convention / design-token agents, and a
manual checklist:

1. A fresh client invite → set password → lands on `/onboarding`, not the dashboard.
2. Onboarding cannot be skipped by typing `/dashboard`, `/projects` or `/settings` into the URL.
3. Timezone is pre-selected correctly; submitting stores the IANA name.
4. A client sees the Company field; a provider and an admin do not.
5. After finishing, signing out and back in goes straight to the dashboard.
6. `/profile` saves every field, and a reload shows the saved values.
7. Avatar upload appears in the sidebar, on the Team page and on message board posts.
8. Uploading someone else's avatar path through the API directly is rejected.
9. A 3 MB image and a PDF are both refused with a readable message.
10. Team page shows local time and birthday for people who have them, and nothing for those who
    do not.
11. A client cannot change their own role, approval or email through the profile form or the API.
12. A user with no timezone set (a legacy row, before their first sign-in) breaks nothing.

## 7. Deploy order

Apply 024 to dev, run the checklist, apply to prod, **then** merge. The portal layout reads
`onboarded_at`; on a database without 024 that column does not exist, the gate query errors, and
every authenticated page fails. This is the same ordering every migration in this project has
followed since 020.
