# Project Memory — Weblikha Portal

Consolidated session memory. Imported into Claude Code via `@MEMORY.md` in CLAUDE.md.
Last synced 2026-09-08.

---

## Current focus: the client portal

Mid-build. Stages 1 and 2 are done and the invite flow is tested end to end on dev.
**Stage 3 (the message board) is the next thing to build**, and Stage 4's client dashboard
is still missing — see the table below for exactly what of Stage 4 already landed.

### Stage status

| Stage | What | Status |
|---|---|---|
| — | Migration 014 (client collab) + types | ✅ Applied by hand to **dev and prod**. Not in `schema_migrations` (SQL Editor); written idempotently, safe to re-run |
| 1 | Invite + set-password auth | ✅ Done and **tested end to end on dev** — invite → email → `/auth/confirm` → set password → dashboard |
| 2 | `/clients` admin page + nav | ✅ Done |
| 3 | Message board | ⬜ Not started — still a read-only shell, see below |
| 4 | Client dashboard + project view | 🟡 Partial: client nav set, `/rewards` guard, to-do capability gates, Team tab names-and-roles-only, "empty to-do list" query fix. **The client dashboard itself is not built.** |
| — | Verification pass | 🟡 Migrations 017 + 018 written and reviewed but **applied nowhere** |

**Post-launch checklist — all resolved (2026-07-13):**
- Admin bootstrap in prod, RLS smoke test, points trigger test, Vercel Preview env vars → dev Supabase: confirmed done by Matthew.
- "Failing CI check" on `d8f6bf3` investigated: it was a Vercel "Deployment was blocked" status, caused by the commit being authored as `matthew.rufino@gmail.com` (unverified email on the `web-likha` GitHub account — the incident behind standing rule #6). All later commits use `weblikhadigital@gmail.com` and deploy fine; the old red X is historical, no action needed.

### Stage 2 — what to build

Shipped. Admin-only `/clients` route, nav entry below "Team", client rows with derived
setup status (`approved` + `auth.users.last_sign_in_at`, read through the service role in
`clients/setup-state.ts`), invite modal with up-front project assignment, a shared
`ProjectPicker`, resend, and revoke/restore behind `confirmDialog`. Spec and plan are in
`docs/superpowers/`. Clients is deliberately **not** in `MobileTabBar` — it already carries
five tabs; `MobileNav` renders the sidebar in its drawer.

### Stage 3 — the message board does not exist yet

Worth knowing before planning: `MessagesTab.tsx` is a **read-only shell**. The "New message"
buttons have no handlers and there is no `createMessage` Server Action anywhere. "Clients can
post on the message board" means building the board for everyone, from scratch:
`createMessage` / `updateMessage` / `deleteMessage`, a compose modal, and wiring the dead
buttons. Agreed: **visibility is a forced choice on every post** — no default, compose won't
submit until internal or shared is picked. Client posts are locked to shared.

### Stage 4 — client experience

Third nav set (no Revenue / Rewards / Team). Client dashboard carries: project cards with
status + progress, the client's own open requests, recent shared messages, and upcoming +
overdue deadlines. Project detail shows the **full** to-do list including internal tasks,
with "Added by client" badges; template apply hidden; Team tab shows **names and roles only**
(no `employment_type` — in-house vs outsource is agency-internal).

### Decisions already made — don't relitigate

- Password auth (not magic link) because corporate mail scanners burn single-use links;
  magic link kept as the recovery path
- Client-filed tasks are worth **0 points** until an admin triages them
- Clients **can** create phases, **cannot** apply phase templates
- Client-created phases and tasks get an "Added by client" indicator via `created_by`
- Message visibility is a forced choice per post
- Clients see the whole to-do list, including internal tasks

Full rationale and the security decisions are in CLAUDE.md → "Client portal".

### What Matthew still has to do (dev)

Done: 014/015/016 applied to dev and prod · the 016 admin-escalation hotfix applied to prod
by hand · email provider enabled · SMTP → Resend · domain verified in Resend · `.env.local`
filled (the service-role key was still the `.env.local.example` placeholder for a while —
that is what "Invalid API key" on invite meant) · redirect URLs · both email templates
switched to `{{ .TokenHash }}` on dev and prod.

Open:
- **Apply migrations 017 then 018**, dev first, then prod. Nothing has run them; the Team
  tab stays empty and the client phase-delete guard is absent until they do.
- Resolve the duplicate migration 014 numbering (see "Production deploy" below).
- Vercel env vars for prod: `NEXT_PUBLIC_SITE_URL` (**Production scope only** — leave unset
  for Preview so `getSiteUrl()` falls back to `VERCEL_URL` and each preview links to itself),
  `RESEND_API_KEY`, `RESEND_FROM`
- Prod Supabase: add redirect URLs `https://<domain>/**` and
  `https://weblikha-portal-*-<scope>.vercel.app/**`
- Run `npm run check` locally — lint cannot run from the Cowork VM (see Environment notes)

---

## Production deploy (as of 2026-07-03, still current)

Live on Vercel with separate production Supabase project `vhsuyouczctnkvnnjzgg` (dev project
`tydreidoqzndxjftpyzd` for local dev via `.env.local`). Prod keys live only in Vercel env
vars; service role scoped to Production. A `supabase-keepalive-ping` scheduled task pings
both projects every 3 days.

**Migration state (keep this accurate — two files are numbered 014):**

| Environment | Has | Missing |
|---|---|---|
| dev `tydreidoqzndxjftpyzd` | 001–013, 014 client-collab, 015, 016 | **017, 018** |
| prod `vhsuyouczctnkvnnjzgg` | 001–013, 014 push-subscriptions, 014 client-collab, 015, 016 (+ the 016 admin-escalation hotfix applied by hand first) | **017, 018** |

⚠️ `014_push_subscriptions.sql` (from the web-push branch) and `014_client_collaboration.sql`
(from the client-portal branch) share a number. `supabase db push` orders by filename, so
that is ambiguous and unresolved. Renumbering moves the repo but not the databases — 014
client-collab, 015 and 016 were applied by hand under these names. Decide deliberately.

Google OAuth enabled on both (shared Google Cloud OAuth client, prod callback added).
Site URL + redirect URLs set to the Vercel domain.

**Supabase email templates** (Authentication → Emails → Templates) on **both** projects now
use `{{ .TokenHash }}` pointing at `/auth/confirm` — Invite user with `type=invite`, Reset
password with `type=recovery`. Magic Link and Confirm signup deliberately keep their default
`{{ .ConfirmationURL }}` bodies and route through `/auth/callback?code=`. See
`docs/client-invite-email-templates.md`. **Prod templates point at `/auth/confirm`, which
does not exist in production until this branch deploys** — do not send a prod invite before
then.

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
Parked until Revenue, Rewards, Resend email, notifications, message compose, and service worker ship. (As of 2026-07-14 only message compose remains.) Agreed favorite: **AI project scaffolding** — describe a project in a sentence at creation, Claude generates phases/tasks with due dates + point values, admin reviews before applying (reuses `applyTemplate` machinery). Runners-up: weekly per-project digest to message board; comment-thread summarizer. Needs `ANTHROPIC_API_KEY` server-side; Sonnet for scaffolding, Haiku for digests.

---

### Git commit email
Always commit as `weblikhadigital@gmail.com` (name "Matthew Kim") — it's the only verified email on the connected GitHub account, and Vercel blocks production deploys from unmatched author emails.

---

## Environment notes

### Typecheck baseline is now clean
The repo used to carry 7 pre-existing `exactOptionalPropertyTypes` errors (dashboard/page.tsx,
team/page.tsx, lib/supabase/server.ts). As of 2026-09-08 `npx tsc --noEmit` reports **zero**
errors. Keep it there.

### Supabase CLI is a devDependency, not global
`supabase db push` fails on Windows with "not recognized". Use `npx supabase db push`.
**Check `supabase/.temp/project-ref` before pushing** — it has historically pointed at PROD
(`vhsuyouczctnkvnnjzgg`), so a push without relinking targets production.
`npx supabase link --project-ref tydreidoqzndxjftpyzd` switches to dev.

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
