# Project Memory — Weblikha Portal

Consolidated session memory. Imported into Claude Code via `@MEMORY.md` in CLAUDE.md.
Last synced 2026-09-19.

---

## Current focus: the client portal

Stages 1–4 are **done**. Stages 1 and 2 are **deployed to prod, and the invite flow is
tested end to end on both dev and prod**. **Stage 3 (the message board) is fully shipped —
posts, reply threads and the editing window, merged as PRs #6, #7 and #8 and deployed to
production, with migrations 020–023 applied to dev and prod first** — see below. **Stage 4
(the client dashboard) shipped 2026-09-19, no migration** — see the table below for exactly
what of Stage 4 landed, and "Not done yet" at the bottom of this file for the full backlog.

### Stage status

| Stage | What | Status |
|---|---|---|
| — | Migration 014 (client collab) + types | ✅ Applied to **dev and prod**, and recorded in both history tables since the 2026-09-17 cleanup |
| 1 | Invite + set-password auth | ✅ Done and **tested end to end on dev AND prod** — invite → email → `/auth/confirm` → set password → dashboard |
| 2 | `/clients` admin page + nav | ✅ Done, merged (PR #3), deployed to prod |
| 3 | Message board | ✅ Shipped (PRs #6, #7, #8, merged 2026-09-18, prod at `2c52643`): compose/edit/delete, default-internal visibility switch, client posts notify the team, URL deep links, rich text + @mentions + categories, reply threads, author-only editing inside a window |
| 4 | Client dashboard + project view | ✅ Shipped: client nav set, `/rewards` guard, to-do capability gates, Team tab names-and-roles-only, "empty to-do list" query fix, and the client dashboard itself (project cards, open requests, recent shared messages, upcoming/overdue deadlines) — spec `docs/superpowers/specs/2026-09-19-client-dashboard-design.md`, no migration. |
| — | Verification pass | 🟡 015–018 applied to dev **and** prod. PRs #3 and #4 merged; prod deployed at `27ab19d`. The four client-portal findings were fixed in code but **not individually re-tested** against the applied migrations. |

**Post-launch checklist — all resolved (2026-07-13):**
- Admin bootstrap in prod, RLS smoke test, points trigger test, Vercel Preview env vars → dev Supabase: confirmed done by Matthew.
- "Failing CI check" on `d8f6bf3` investigated: it was a Vercel "Deployment was blocked" status, caused by the commit being authored as `matthew.rufino@gmail.com` (unverified email on the `web-likha` GitHub account — the incident behind standing rule #6). All later commits use `weblikhadigital@gmail.com` and deploy fine; the old red X is historical, no action needed.

### Stage 2 — shipped

Shipped. Admin-only `/clients` route, nav entry below "Team", client rows with derived
setup status (`approved` + `auth.users.last_sign_in_at`, read through the service role in
`clients/setup-state.ts`), invite modal with up-front project assignment, a shared
`ProjectPicker`, resend, and revoke/restore behind `confirmDialog`. Spec and plan are in
`docs/superpowers/`. Clients is deliberately **not** in `MobileTabBar` — it already carries
five tabs; `MobileNav` renders the sidebar in its drawer.

### Stage 3 — message board

Shipped — PR #6 merged 2026-09-18, production at `fa602ec`. Spec and plan:
`docs/superpowers/{specs,plans}/2026-09-17-message-board*`. Posts, plus a flat reply
thread per post (migration 022, below). Team members get a "Visible to client" switch, **off by
default**; the submit button reads "Post internally" / "Post to client". Clients have no
switch. Visibility is locked after posting for every role (migration 020 trigger). Client
posts notify approved admins and approved project providers (bell + push). The project
page's tab now follows `?tab=`, and `?message=<id>` opens a post.

Extended 2026-09-17 (spec `docs/superpowers/specs/2026-09-17-message-board-richtext-categories-design.md`):
rich-text bodies via a shared `RichTextEditor`/`RichTextBody` also used by task comments;
@mentions of project members and admins with bell, push and email; agency-wide
admin-editable categories that archive rather than delete. Clients are never mentionable or
notified on internal posts. Migration 021.

Replies shipped 2026-09-18 — PR #7, migration 022 (spec
`docs/superpowers/specs/2026-09-18-message-replies-design.md`): a flat thread per post, visibility inherited from the post, notifying the
post's author and everyone already in the thread. Editing a reply notifies nobody, including
for a newly added mention.

Editing tightened 2026-09-18 — PR #8, migration 023 (spec
`docs/superpowers/specs/2026-09-18-edit-window-design.md`): only the author may edit a post, reply or task comment, and only inside an
agency-wide window (default 15 minutes, Settings → Content). Admins lost the FOR ALL write
power that let them edit other people's content; they keep delete. Everything posted before
023 is past the window, so it is no longer editable.

### Stage 4 — client experience (dashboard still to build)

Third nav set (no Revenue / Rewards / Team). Client dashboard carries: project cards with
status + progress, the client's own open requests, recent shared messages, and upcoming +
overdue deadlines. Project detail shows the **full** to-do list including internal tasks,
with "Added by client" badges; template apply hidden; Team tab shows **names and roles only**
(no `employment_type` — in-house vs outsource is agency-internal).

### Onboarding and profiles — shipped (PR #9, merged 2026-09-19, prod at `ee42231`)

Not part of the client-portal stages above — a separate feature, migration 024. Migration `024_user_profiles.sql` adds nullable profile
columns to `users` (`timezone`, `job_title`, `location`, `bio`, `company`,
`company_website`, `onboarded_at`) with CHECK constraints, a `guard_user_timezone()` trigger
rejecting a non-IANA zone, and an `avatars` storage bucket (public read; insert/update/delete
scoped to `avatars/{own id}/…`, size capped at 2 MB and MIME restricted to jpeg/png/webp at
the bucket level, not just in the upload component). No new RLS on `users` — 016's guard
still blocks writing `role`, `approved` or `email` through the same update.

**Privacy fix, same migration, before it was ever applied anywhere:** `phone` and
`birthdate` do NOT live on `users`. 013's "approved members read directory" policy grants
SELECT on every column of `users` to any approved member (load-bearing — mentions, member
pickers), so anything added to `users` is readable agency-wide the moment it exists. A phone
number and a full date of birth are not that kind of information. Both now live in a new
`public.user_private` table (`user_id` PK → `users`, `phone`, `birthdate`, `updated_at`),
readable/writable only by its own owner or an admin. `completeOnboarding` and
`updateProfile` write `users` first, then upsert `user_private` — the two writes are not
atomic, so a failed second write throws rather than reporting success. `ProfileForm` takes
`phone`/`birthdate` as explicit props (read separately by `/profile`'s page from
`user_private`) rather than off its `user: User` prop. `ClientList` and `MembersTab` read the
same way — `ClientRow.phone` and a `birthdateByUser` lookup, threaded down from
`/clients` and `/team`'s page components — instead of off `User`.

`/onboarding` (in `(auth)`) is a one-screen form — photo optional, phone, timezone
pre-filled from the browser, company for clients — gated by a redirect in
`(portal)/layout.tsx` when `onboarded_at` is null, the same checkpoint that sends
unapproved users to `/pending`. `completeOnboarding` runs once and refuses to re-stamp.
Every existing user, not just new signups, meets this screen once on their next sign-in,
since `onboarded_at` is null for all of them until they pass through it.

`/profile` (in `(portal)`, reachable from the sidebar user block) is the one-form, one-Save
edit screen for the same fields plus name, job title, birthday, location and bio — email
stays read-only. There is deliberately no password UI anywhere in either screen: the invite
link and the forgot-password email already cover changing a password.

`PersonMeta` surfaces job title, a formatted local time and birthdays where people already
look: birthdays on the admin-only Team page only; local time and job title on the client
list and a project's Team tab. A client viewer's member query was deliberately not widened,
so clients still see no local time there. Also on this branch: the ungated admin
mention-list query was narrowed to a new `MentionableUser` type, because `select('*')`
against 024's wider `users` row would otherwise have shipped every admin's bio to client
viewers (phone and birthdate were never at risk here — see the privacy fix above, they were
never selectable through `MentionableUser`'s source query in the first place).

**Deploy state:** 024 applied to dev and prod 2026-09-19; PR #9 merged and verified on prod.

### Decisions already made — don't relitigate

- Password auth (not magic link) because corporate mail scanners burn single-use links;
  magic link kept as the recovery path
- Client-filed tasks are worth **0 points** until an admin triages them
- Clients **can** create phases, **cannot** apply phase templates
- Client-created phases and tasks get an "Added by client" indicator via `created_by`
- Message visibility: team toggle **off by default** (replaced "forced choice, no default"
  on 2026-09-17 at Matthew's request); locked after posting; clients always shared
- Clients see the whole to-do list, including internal tasks

Full rationale and the security decisions are in CLAUDE.md → "Client portal".

### What Matthew still has to do (dev)

Done: 014/015/016 applied to dev and prod · the 016 admin-escalation hotfix applied to prod
by hand · email provider enabled · SMTP → Resend · domain verified in Resend · `.env.local`
filled (the service-role key was still the `.env.local.example` placeholder for a while —
that is what "Invalid API key" on invite meant) · redirect URLs · both email templates
switched to `{{ .TokenHash }}` on dev and prod.

Also done 2026-09-08: 017 + 018 applied to dev and prod · PRs #3 and #4 merged · prod
deployed at `27ab19d` · **prod Supabase Site URL corrected** from `http://localhost:3000`
to the Vercel domain (that field is what `{{ .SiteURL }}` renders, so prod invites had been
emailing localhost links) · prod invite verified end to end.

Open — see "Not done yet" at the bottom of this file for the full list. The environment
items specifically:
- Confirm `NEXT_PUBLIC_SITE_URL` is set on Vercel **Production scope only** (leave unset for
  Preview so `getSiteUrl()` falls back to `VERCEL_URL`). If it is unset, prod `redirectTo`
  resolves to the per-deployment hostname, which then depends on the
  `https://weblikha-portal-*-<scope>.vercel.app/**` redirect wildcard being present.
- Run `npm run check` locally — lint cannot run from the Cowork VM (see Environment notes)
- ~~Apply 020 + 021 to dev and prod~~ — done 2026-09-18, both databases, before merging.
  The order mattered: merging first would have shipped a bell query embedding `messages`
  through `notifications.message_id`, which errors on a database without 020/021 and empties
  every user's notification dropdown.
- ~~Apply 022 to dev and prod~~ — done 2026-09-18, tested on dev.
- ~~Apply 023 to dev and prod~~ — done 2026-09-18, tested on dev. (`app_settings` is a new
  table, so `NOTIFY pgrst, 'reload schema';` was needed after applying; when changing the
  window, reload the page — an open tab keeps the old number.)
- ~~Apply 024 to dev and prod~~ — done 2026-09-19, tested on dev, with
  `NOTIFY pgrst, 'reload schema';` after each (the `avatars` bucket, `user_private` and
  the new columns were all new to PostgREST's cache).

---

## Production deploy

Live on Vercel with separate production Supabase project `vhsuyouczctnkvnnjzgg` (dev project
`tydreidoqzndxjftpyzd` for local dev via `.env.local`). Prod keys live only in Vercel env
vars; service role scoped to Production. A `supabase-keepalive-ping` scheduled task pings
both projects every 3 days.

**Migration state:** 001–024 applied on **both** dev and prod (020–023 on 2026-09-18, 024 on 2026-09-19 — each before the branch that needed it merged).

**Migration cleanup (2026-09-17).** Two files had both been numbered 014 — web push and
client collaboration, written on branches that never saw each other. Web push moved to
**`019_push_subscriptions.sql`**. It depends only on 001 and nothing references it, whereas
014–018 cite each other by number throughout their comments, so moving one file was far
cheaper than shifting five.

Verified before repairing: a schema fingerprint query on both databases confirmed every
migration's objects exist (`push_subscriptions` included — an older note here claiming dev
lacked it was wrong). The history tables then turned out to differ:

- **Dev:** no `supabase_migrations.schema_migrations` table at all. Repaired 001–019.
- **Prod:** 001–014 recorded from earlier CLI pushes, with **014 labelled
  `push_subscriptions`**. Repaired 015–019, then `--status reverted 014` + `--status applied
  014` to re-record 014 from the client-collaboration file.

`migration repair` writes only the history table and runs no migration SQL. `migration list`
now matches 001–019 on both.

**Lesson:** the "neither database has a history table" conclusion was first drawn from
running the check on *one* project. Always run environment checks on both — prod and dev
had silently diverged.

**How to run migrations from now on:** see CLAUDE.md → "Applying migrations". In short,
always `--db-url` (never linked mode), and `migration list` before every `db push`.

Google OAuth enabled on both (shared Google Cloud OAuth client, prod callback added).
Site URL + redirect URLs set to the Vercel domain.

**Supabase email templates** (Authentication → Emails → Templates) on **both** projects now
use `{{ .TokenHash }}` pointing at `/auth/confirm` — Invite user with `type=invite`, Reset
password with `type=recovery`. Magic Link and Confirm signup deliberately keep their default
`{{ .ConfirmationURL }}` bodies and route through `/auth/callback?code=`. See
`docs/client-invite-email-templates.md`. `/auth/confirm` is deployed, and a prod invite
has been verified end to end.

`master` → `main` rename done 2026-07-04. Resend approval email shipped (63dc5d1). App icon
v2 shipped (47c81ba). The old "failing CI" mystery was never CI — it was Vercel blocking a
deploy over an unmatched commit author email (see Git commit email below).

**Done 2026-07-14:** Web push shipped to prod (PRs #1 and #2) — migration 014 (`push_subscriptions`, owner-only RLS), push-only service worker, bell opt-in row, pushes on mentions/assignments with recipients validated against project membership + admins, server-only admin client, admins mentionable in comments regardless of roster, dnd-kit hydration fix. VAPID keys in Vercel (Production) + `.env.local` (dev pair). Known follow-ups: migration-013 in-app trigger needs the same membership check; no `pushsubscriptionchange` handler; no "disable push" UI (`deletePushSubscription` action exists unused).

**Business context:** Matthew is turning this into a productized service — custom apps
tailored per client. Client intake forms live in `docs/client-intake-forms.md`. The client
portal is the feature that makes that pitch real.

---

## Working rules (Matthew's standing feedback)

### Confirm all deletions
Every destructive action (tasks, comments, phases, members, templates, anything) must confirm
first via `confirmDialog({ title, message?, confirmLabel? })` from
`@/components/ui/confirm-dialog` (promise-based, returns boolean; `<ConfirmHost/>` mounted in
PortalShell). Never native `confirm()`/`alert()` — the browser dialog looks jarring on
mobile/PWA. Make handlers async, await the dialog before optimistic state + server action.
Error surfacing uses the toast from `@/components/ui/toast`.

### Build mobile and desktop simultaneously
Every component gets mobile and desktop Tailwind classes in the same pass (e.g.
`grid-cols-2 md:grid-cols-4`, `hidden md:flex`). Never defer mobile to a later pass — the
portal must be mobile-ready from day one (PWA + responsive). The only mobile-specific
component is `BottomNav` (replaces the sidebar on mobile).

### Schema review before every feature
Before starting any new feature, review the Supabase schema:

1. **Normalization** — no transitive dependencies or redundant columns that could go out of sync
2. **Indexes** — FK columns and filter columns on hot query paths
3. **updated_at** — new tables get `updated_at` + `set_updated_at` trigger
4. **RLS consistency** — use `is_admin()` / `get_user_role()` / `is_project_member()` /
   `is_member_of()` helpers, not inline subqueries
5. **Data integrity triggers** — if two FKs on one table could disagree (e.g.
   `tasks.project_id` vs `task_lists.project_id`), add a consistency trigger

(Migration 004 was a cleanup pass fixing exactly these categories. Migration 014's review
caught the claim-policy hole and the budget column exposure.)

### Skeleton loaders on every page
Every new page route MUST get a `loading.tsx` sibling in the same pass — a skeleton
approximation using `animate-pulse` + `bg-bg-surface-3` divs, matching the rough structure
(header, stat cards, table rows) to avoid layout shift.

### Interaction feedback on every interactive element
Every interactive element (buttons, links, rows, toggles) must give visible, subtle, seamless
feedback that the action registered:

1. **Hover + press** — `transition-colors duration-150` minimum; a subtle press cue like
   `active:scale-95` or an `active:` background shift
2. **Keyboard focus** — `focus-visible:ring` styles using token colors
3. **Async actions** — pending state (spinner/label swap) + disabled while in flight; no
   silent buttons, no double-submit
4. **Outcome confirmation** — mutations confirm success/failure (toast from
   `@/components/ui/toast` or inline state change), never silent completion
5. **Taste** — ~150ms ease-out; nothing flashy or slow

Prefer baking these states into `@/components/ui` primitives so features inherit them.
Enforced as rule #8 in the `ui-convention-checker` agent.

### Git commit email
Always commit as `weblikhadigital@gmail.com` (name "Matthew Kim") — it's the only verified
email on the connected GitHub account, and Vercel blocks production deploys from unmatched
author emails.

---

## Backlog / roadmap

### After the client portal
- **Revenue page** — `/revenue` is still a "Coming soon" stub. The data layer is finished:
  `revenue_entries` exists, RLS is admin-only, recharts 3.0 is installed and unused, and the
  dashboard already sums income/expense. Highest-value non-client work.
- **Rewards page** — also a stub, and smaller: `performance_periods` is fully populated by
  the trigger, so it's a read-only page (point history, monthly total, progress toward the
  1,000-pt threshold) plus an admin bonus/deduction control.
- Together these are effectively all of Phase 4 in `AGENCY_PORTAL_PLAN.md`.

### Later
- PWA service worker + push notifications
- Client tagging on notifications
- Realtime (replacing the notification bell's polling)

### AI features (parked)
Parked until the non-AI roadmap ships. Agreed favorite: **AI project scaffolding** — describe
a project in a sentence at creation, Claude generates phases/tasks with due dates + point
values, admin reviews before applying (reuses the `applyTemplate` machinery). Runners-up:
weekly per-project digest to the message board; comment-thread summarizer. Needs
`ANTHROPIC_API_KEY` server-side; Sonnet for scaffolding, Haiku for digests.

### Next up (queued 2026-07-14, from Matthew's prod testing)
1. **Notification click should deep-link to the specific task, not just the task list.**
   Both the bell (`openItem` in `src/components/layout/NotificationsBell.tsx` → `/projects/{project_id}?tab=todos`) and the push payload URLs (`notifyMentions` / `notifyAssignment` in `src/app/(portal)/projects/actions.ts`) stop at the list level even though notifications carry `task_id`. Plan: append `&task={task_id}`, have TodosTab read the param and scroll to + expand (open comments of) that task row. Update the mention email link too. Handle the sw.js `notificationclick` focus path (it `client.navigate(url)`s an already-open tab — the param must trigger the scroll on client-side navigation, not just initial load).
2. **Team-member filter dropdown font size too big** — doesn't match surrounding text. Likely cause: the global mobile rule from commit `15362b0` forces 16px `!important` on inputs/selects to stop iOS focus-zoom, which also bloats the desktop dropdown that should be `text-sm`. Fix must keep ≥16px on mobile (or scope the rule) while matching `text-sm` on desktop.

### Next up: approval email via Resend
When admin approves a team member in Settings, email them. Plan: call Resend API inside the `approveUser` Server Action in `src/app/(portal)/settings/actions.ts` right after the DB update. Steps: sign up at resend.com → `npm install resend` → `RESEND_API_KEY` in .env.local → ~3 lines in `approveUser`. Free tier: 3,000 emails/month.

### Notifications — shipped (in-app 2026-07-13, web push 2026-07-14)
In-app bell (migration 013) + web push (migration 014) both live. Remaining notification follow-ups: membership check in the migration-013 trigger, `pushsubscriptionchange` handler, disable-push UI, client tagging later.

### AI features (parked until non-AI roadmap ships)
Parked until Revenue, Rewards, Resend email, notifications, message compose, and service worker ship. (Message compose was built 2026-09-17 on feature/message-board; once merged, the non-AI list is complete.) Agreed favorite: **AI project scaffolding** — describe a project in a sentence at creation, Claude generates phases/tasks with due dates + point values, admin reviews before applying (reuses `applyTemplate` machinery). Runners-up: weekly per-project digest to message board; comment-thread summarizer. Needs `ANTHROPIC_API_KEY` server-side; Sonnet for scaffolding, Haiku for digests.

---

### Git commit email
Always commit as `weblikhadigital@gmail.com` (name "Matthew Kim") — it's the only verified email on the connected GitHub account, and Vercel blocks production deploys from unmatched author emails.

---

## Environment notes

### Typecheck baseline is now clean
The repo used to carry 7 pre-existing `exactOptionalPropertyTypes` errors (dashboard/page.tsx,
team/page.tsx, lib/supabase/server.ts). As of 2026-09-08 `npx tsc --noEmit` reports **zero**
errors. Keep it there.

### Supabase CLI is a devDependency, not global — and use `--db-url`
`supabase db push` fails on Windows with "not recognized". Use `npx supabase …`.

**Do not use linked mode.** `supabase/.temp/project-ref` still points at PROD
(`vhsuyouczctnkvnnjzgg`) while `.env.local` points at dev, and linked mode failed with a 403
at "Initialising login role". Pass `--db-url` with the session-pooler connection string
instead: the URL names its own project, and it connects straight to Postgres. There is no
`supabase/config.toml`; `--db-url` mode does not need one (confirmed with CLI 2.109.0).
Full commands in CLAUDE.md → "Applying migrations".

### Cowork VM cannot lint
Claude Cowork sessions reach this repo through `device_bash`, which runs in a Linux VM with
the folder mounted — real files, edited in place (the old NUL-padding sandbox bug does not
apply to this path, but verify with `tr -d -c '\000' < file | wc -c` if anything looks off).
Two things do **not** work there:
- `next lint` — `node_modules` holds Windows SWC binaries and the VM has no npm registry
  access to fetch the Linux ones. Run `npm run check` locally.
- `npx supabase` — same reason (Windows CLI binary). Matthew runs all CLI commands himself.

`npx tsc --noEmit` **does** work in the VM, since tsc is pure JS.

### Emails: two separate systems
- **Supabase Auth emails** (invite, magic link, password reset) go through Supabase →
  Authentication → SMTP Settings, pointed at Resend. `RESEND_API_KEY` is irrelevant to these.
- **App emails** (approval notice, @mention) use the `resend` npm package and
  `RESEND_API_KEY` / `RESEND_FROM`. Missing key = silently skipped with a console warning.

### Where the 3-second page loads came from (2026-09-19)

Matthew reported the portal feeling slow on both mobile and desktop in prod. It was not the
bundle and not the database: **Vercel functions were running in `iad1` (Washington DC) while the
prod Supabase project is in `ap-southeast-1` (Singapore)** — the default region nobody had
changed. Every server-side query went Manila → Virginia → Singapore → back, roughly 230ms each.

The evidence that made it obvious: in DevTools the dashboard *document* took **3.16s**, while the
browser's own direct calls to Supabase (the notification bell's fetches, Manila → Singapore) took
**91ms and 219ms**. A server slower than the browser it is serving means the server is in the
wrong place.

Switching the Function Region to `sin1` and redeploying took the same page to **972ms** — a 2.2s
saving on every page, with no code change. `vercel.json` now pins `"regions": ["sin1"]` so the
setting is version-controlled; keep it matching the Supabase region if either ever moves.

**Still on the table, if pages need to get faster again** (measured while diagnosing this, not yet
acted on):
- **Nothing in `src/app` uses `Promise.all`.** Queries run strictly in sequence: the project
  detail page issues 11, the projects list 7, team and clients 6 each, plus 3 in the portal
  layout. At `sin1` latency that is far cheaper than it was, but it is still ~14 serial round
  trips to open a project.
- **The profile row is read twice** on a project page — once by `(portal)/layout.tsx`, once by the
  page. React's `cache()` would dedupe it.
- **Over-fetching:** the project page loads project templates for every viewer though only admins
  can apply them.
- **Unused dependencies:** `recharts`, `@tanstack/react-query` and `@tanstack/react-query-devtools`
  are in `dependencies` and imported nowhere. No runtime cost (nothing imports them, so they are
  not bundled), but they slow installs and mislead anyone reading the manifest.
- The notification bell polls every 30s — a battery and data cost on mobile, not a load-time one.

### GitHub org rename broke the Vercel deploy hook (2026-09-08)

The GitHub owner was renamed **`web-likha` → `WebLikha-Digital`**. GitHub silently redirects
the old path, so `git push` and `gh` kept working and nothing looked wrong — but Vercel's Git
integration stayed bound to the old identity and **stopped triggering builds**. PR #3 merged
to `main` and no production deployment fired.

Two things to remember:
- **Reconnecting Vercel does not backfill the commits it missed.** After reconnecting, it
  picked up the *next* push only. Getting the missed merge deployed needed a fresh commit on
  `main` (merging PR #4 served that purpose).
- If a deploy silently doesn't happen, check `gh api repos/<owner>/<repo> --jq .full_name`
  against `git remote -v`. A mismatch means the owner or repo was renamed.

The local remote now points at the canonical `WebLikha-Digital/weblikha-portal`.

---

## Not done yet — backlog for the next session

Ordered roughly by value. Items 1 and 2 are the client portal's remaining stages.

### The client portal's remaining work

1. ~~**Stage 3 — the message board.**~~ Shipped 2026-09-18 (PR #6).
   **Not yet exercised in a browser against the applied migrations** — the
   feature was gated on typecheck, build and review only, so the first real pass over
   formatting, image paste, mentions (incl. a client mentioned on an internal post),
   categories and legacy plain-text posts is still outstanding.
2. ~~**Stage 4 — the client dashboard itself.**~~ Shipped 2026-09-19: project cards with
   status + progress, the client's own open requests, recent shared messages, and upcoming +
   overdue deadlines. `dashboard/page.tsx` is now a role router with a dedicated
   `ClientDashboard`, rather than a client falling through to the provider view.
3. **"Added by client" badge UI.** The data is now there — `created_by` is persisted on
   create and `creator (id, name, role)` is joined in `projects/[id]/page.tsx` — but no badge
   renders. `applyTemplate` also stamps `created_by` now, so template rows are distinguishable
   from pre-014 nulls.
4. **Re-test the four findings from live testing** individually against the applied
   migrations: client sees the to-do list, can add a phase, sees the Team tab populated, and
   has no Rewards in the nav. Fixed in code, verified by review, not each exercised in a browser.

### Migration hygiene — ✅ done 2026-09-17

5. ~~Two migrations numbered 014~~ — web push renumbered to 019.
6. ~~`schema_migrations` unaware of applied migrations~~ — dev had no table (repaired
   001–019); prod had 001–014 with a mislabelled 014 (repaired 015–019, re-recorded 014).
7. ~~CLI linked to PROD~~ — sidestepped: use `--db-url`, never linked mode.

### Known security / correctness gaps, deliberately left

8. ~~**`messages: client deletes own`** lacked `is_project_member`~~ — fixed in migration 020
   and back-ported into 014.
9. **Migration-013's in-app notification trigger has no membership check** — a user can be
   @mentioned on a task in a project they do not belong to. Post-017 the task embed returns
   null and the bell degrades gracefully, but the notification row is still created. (Carried
   over from the web-push work, which fixed the same class of bug for push recipients.)
10. **`004`, `014` and `017` pin `search_path = public`** without `pg_temp`; `001`, `011`,
    `012` and `018` use the safer `= public, pg_temp`. Bodies are fully schema-qualified so
    there is no known exploit — worth normalising house-wide.
11. **`ON DELETE SET NULL` on `tasks.task_list_id` orphans tasks for admins too.** 018's
    trigger only guards the client path. An admin deleting a phase still detaches its tasks,
    which then render nowhere (the UI only shows tasks nested under a phase). A real fix
    reparents or deletes children in `deleteTaskList`, or changes the FK action.
12. **Session fixation on `/auth/confirm`** — `verifyOtp` replaces whatever session is in the
    browser, so clicking a client's invite link while signed in as admin silently switches
    you to that client. Practically handled by "use a private window"; a `getUser()` check
    with an interstitial would close it.

### Carried over from the web-push work

13. Notification click should deep-link to the specific task, not just the task list — the
    bell's `openItem`, the push payload URLs, and the mention email all stop at
    `/projects/{id}?tab=todos` despite notifications carrying `task_id`.
14. No `pushsubscriptionchange` handler; no "disable push" UI (`deletePushSubscription`
    exists and is unused).
15. Team-member filter dropdown font size too large on desktop — likely the global 16px
    `!important` mobile input rule from `15362b0` bleeding into desktop.

### Bigger stubs

16. **Revenue page** — `/revenue` is a "Coming soon" stub. Data layer is finished:
    `revenue_entries` exists, RLS is admin-only, recharts installed and unused, dashboard
    already sums income/expense. Highest-value non-client work.
17. **Rewards page** — also a stub and smaller. `performance_periods` is fully populated by
    the trigger, so it is a read-only page (point history, monthly total, progress toward the
    1,000-pt threshold) plus an admin bonus/deduction control.

### Raised by the 021 review pass (2026-09-18), deliberately deferred

18. **`comment-attachments` storage policies are bucket-wide** (`009`): any authenticated
    user may INSERT at any path and the whole bucket is publicly readable, with no cleanup
    when a comment or message is deleted. Unchanged since 009, but the blast radius grew
    when message images started using the same bucket (`messages/${projectId}/…`). A fix
    scopes the insert policy to paths the caller is authorised for, or moves to signed URLs.
19. **The toolbar's link button uses native `prompt()`** (`RichTextEditor.tsx`), carried over
    from the pre-split comment editor — the same class of thing `confirmDialog` replaced.
    Wants a small inline link form.
20. **Mention dedup depends on trigger-name order.** `messages_notify_client_message` sorts
    before `messages_notify_mentions`, which is what stops a client's post double-notifying a
    mentioned teammate. Renaming either trigger silently reintroduces duplicates; documented
    in 021's comments, with no test to catch it.
21. **`notifications_type_check` is now `NOT VALID`** (021) so applying it takes no full-table
    lock. Existing rows already satisfy the widened list; run `validate constraint` off-peak
    if you want it marked valid.

### Raised by the 022 review pass (2026-09-18), deliberately deferred

22. **Notification deep links trust the caller's `projectId`.** `createMessage` and
    `createReply` build the push/email URL from the `projectId` argument, which RLS never
    checks against the post (it validates the message or reply id instead). A crafted call
    could send real recipients a link to an unrelated project. Both triggers already know the
    true `project_id` — reading it back beside the title would close it for both.
23. **A reply (or post) by a deleted user shows "Edited" forever.** `ON DELETE SET NULL` on
    `author_id` fires the `set_updated_at` trigger, so `updated_at > created_at`. Consistent
    with posts since 002, so not new — but it will look wrong the first time someone notices.
24. **`can_read_message()` (022) requires `approved = true`; the message policies it mirrors
    do not.** A revoked-but-still-signed-in user can read a post directly through PostgREST
    and get zero replies for it. Fail-closed and documented in the migration; the real fix is
    to make approval consistent across 004/020's policies.

### Repo hygiene

25. **`tsconfig.tsbuildinfo` is tracked** — a build artifact that dirties the tree on every
    build. Wants a `.gitignore` entry plus `git rm --cached`.
26. **No test framework at all.** Every change this session was gated on `npx tsc --noEmit`,
    review, and manual checks. Adding one is a real decision that has never been made — not
    something to bolt on mid-feature.
