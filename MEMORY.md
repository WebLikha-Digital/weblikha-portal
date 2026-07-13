# Project Memory — Weblikha Portal

Consolidated from Cowork session memory (last synced 2026-07-08). Imported into Claude Code via `@MEMORY.md` in CLAUDE.md.

---

## Current state

### Production deploy (as of 2026-07-03)
Live on Vercel with separate production Supabase project `vhsuyouczctnkvnnjzgg` (dev project `tydreidoqzndxjftpyzd` for local dev via .env.local). Prod keys live only in Vercel env vars; service role scoped to Production. A `supabase-keepalive-ping` scheduled task pings both projects every 3 days.

**Done:** All 10 migrations applied to prod via `supabase db push` (required replacing `uuid_generate_v4()` with `gen_random_uuid()` in migrations 001/002/005 — CLI search_path doesn't see the extensions schema). Google OAuth enabled on prod (reused dev's Google Cloud OAuth client, added prod callback URI). Supabase Site URL + redirect URLs set to the Vercel domain.

**Post-launch checklist — all resolved (2026-07-13):**
- Admin bootstrap in prod, RLS smoke test, points trigger test, Vercel Preview env vars → dev Supabase: confirmed done by Matthew.
- "Failing CI check" on `d8f6bf3` investigated: it was a Vercel "Deployment was blocked" status, caused by the commit being authored as `matthew.rufino@gmail.com` (unverified email on the `web-likha` GitHub account — the incident behind standing rule #6). All later commits use `weblikhadigital@gmail.com` and deploy fine; the old red X is historical, no action needed.

**Done 2026-07-04:** `master` renamed to `main` locally and on GitHub (duplicate branch deleted). Claude Code agents (`.claude/agents/`) committed to repo.

**Business context:** Matthew is turning this into a productized service — custom apps tailored per client. Client intake forms live in `docs/client-intake-forms.md`.

---

## Working rules (Matthew's standing feedback)

### Confirm all deletions
Every destructive action (tasks, comments, phases, members, templates, anything) must confirm first via `confirmDialog({ title, message?, confirmLabel? })` from `@/components/ui/confirm-dialog` (promise-based, returns boolean; `<ConfirmHost/>` mounted in PortalShell). Never native `confirm()`/`alert()` — the browser dialog looks jarring on mobile/PWA. Make handlers async, await the dialog before optimistic state + server action. Error surfacing uses the toast from `@/components/ui/toast`.

### Build mobile and desktop simultaneously
Every component gets mobile and desktop Tailwind classes in the same pass (e.g. `grid-cols-2 md:grid-cols-4`, `hidden md:flex`). Never defer mobile to a later pass — portal must be mobile-ready from day one (PWA + responsive). Only mobile-specific component is `BottomNav` (replaces sidebar on mobile).

### Schema review before every feature
Before starting any new feature, review the Supabase schema:

1. **Normalization** — no transitive dependencies or redundant columns that could go out of sync
2. **Indexes** — FK columns and filter columns on hot query paths
3. **updated_at** — new tables get `updated_at` + `set_updated_at` trigger
4. **RLS consistency** — use `is_admin()` / `get_user_role()` helpers, not inline subqueries
5. **Data integrity triggers** — if two FKs on one table could disagree (e.g. `tasks.project_id` vs `task_lists.project_id`), add a consistency trigger

(Migration 004 was a cleanup pass fixing exactly these categories.)

### Skeleton loaders on every page
Every new page route MUST get a `loading.tsx` sibling in the same pass — skeleton approximation of the page using `animate-pulse` + `bg-bg-surface-3` divs, matching the rough structure (header, stat cards, table rows) to avoid layout shift.

### Interaction feedback on every interactive element (added 2026-07-08)
Every interactive element (buttons, links, rows, toggles) must give visible, subtle, seamless feedback that the action registered:

1. **Hover + press** — `transition-colors duration-150` minimum; subtle press cue like `active:scale-95` or an `active:` background shift
2. **Keyboard focus** — `focus-visible:ring` styles using token colors
3. **Async actions** — pending state (spinner/label swap) + disabled while in flight; no silent buttons, no double-submit
4. **Outcome confirmation** — mutations confirm success/failure (toast from `@/components/ui/toast` or inline state change), never silent completion
5. **Taste** — ~150ms ease-out; nothing flashy or slow

Prefer baking these states into `@/components/ui` primitives so features inherit them. Enforced as rule #8 in the `ui-convention-checker` agent (`.claude/agents/ui-convention-checker.md`).

---

## Backlog / roadmap

### Next up: approval email via Resend
When admin approves a team member in Settings, email them. Plan: call Resend API inside the `approveUser` Server Action in `src/app/(portal)/settings/actions.ts` right after the DB update. Steps: sign up at resend.com → `npm install resend` → `RESEND_API_KEY` in .env.local → ~3 lines in `approveUser`. Free tier: 3,000 emails/month.

### In-app notifications
First trigger: notify a member when @mentioned in a task comment. Groundwork done: `task_comments.mentions uuid[]` column (migration 009) stores mentioned user IDs on create/edit — no HTML parsing needed. Insert point: `createTaskComment` / `updateTaskComment` in `src/app/(portal)/projects/actions.ts`. Planned shape: `notifications` table + inserts on events (mentions, task assignment, approval), bell/dropdown UI in Topbar. Pairs with PWA service worker for push later. Client tagging planned later.

### AI features (parked until non-AI roadmap ships)
Parked until Revenue, Rewards, Resend email, notifications, message compose, and service worker ship. Agreed favorite: **AI project scaffolding** — describe a project in a sentence at creation, Claude generates phases/tasks with due dates + point values, admin reviews before applying (reuses `applyTemplate` machinery). Runners-up: weekly per-project digest to message board; comment-thread summarizer. Needs `ANTHROPIC_API_KEY` server-side; Sonnet for scaffolding, Haiku for digests.

---

### Git commit email
Always commit as `weblikhadigital@gmail.com` (name "Matthew Kim") — it's the only verified email on the connected GitHub account, and Vercel blocks production deploys from unmatched author emails.

---

## Environment notes

### Known typecheck baseline
Repo has 7 pre-existing tsc errors (dashboard/page.tsx, team/page.tsx, lib/supabase/server.ts; exactOptionalPropertyTypes-related) — not caused by new work.

### Cowork-only: sandbox mount sync bug
(Applies only to Claude Cowork sessions, not Claude Code CLI.) Files edited via Edit/Write appear NUL-padded to the old byte length in the Linux sandbox mount; real files on disk are correct. Workarounds: detect NULs with `tr -d -c '\000' < file | wc -c`; strip with `perl -0777 -pe 's/\x00+\z//'`; fix mount view with `rm -f` + `cp`; for git commits use `GIT_INDEX_FILE=/tmp/gitindex` with `git read-tree HEAD && git add -A`, verify staged blobs NUL-free, then restore `.git/index`. `next lint` can't run in sandbox (SWC blocked) — run `npm run check` locally. No GitHub credentials in sandbox — `git push` must be run locally.
