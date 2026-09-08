# Weblikha Portal — Claude Code Context

This file is read by Claude Code at the start of every session.
It contains everything needed to understand the codebase without reading every file.

Session memory (current state, working rules, backlog) is in @MEMORY.md

---

## What this project is

An internal agency management portal for **Weblikha Digital Inc.** — a Webflow agency based in the Philippines.

**Users:** Admin (Matthew Kim), service providers (devs, designers, SEO specialists), and
invited **clients**. The client portal is mid-build — see "Client portal" below and @MEMORY.md
for exactly which stages are done.
**In scope now:** Dashboard, Projects (with phases/task-lists, todos, comments, messages, members), Team performance & leaderboard, Revenue, Rewards, Settings (approval queue + project templates), in-app notifications, web push (push-only service worker + VAPID, opt-in via the bell), client portal.
**Not yet in scope:** Moxie integration, time tracking.
**Direction:** Matthew is turning this into a productized service — custom apps tailored per client. Client intake forms live in `docs/client-intake-forms.md`. The original plan doc is `AGENCY_PORTAL_PLAN.md`.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15, App Router, React 19 |
| Language | TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`) |
| Styling | Tailwind CSS — all values come from CSS tokens (see below) |
| Backend | Supabase (PostgreSQL + Auth + RLS), `@supabase/ssr` |
| Server state | TanStack Query v5 (client) + Server Components/Server Actions |
| Charts | Recharts |
| Rich text | TipTap (StarterKit, Link, Image, Mention, Placeholder) — task comments |
| Drag & drop | @dnd-kit (core, sortable, utilities) — task ordering |
| Sanitization | dompurify — comment HTML |
| Email | resend — approval notifications |
| Icons | lucide-react |
| Utilities | clsx, tailwind-merge (via `cn()`), date-fns |

---

## Project structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/           Server Component (reads ?error/?sent) + LoginForm client half
│   │   ├── set-password/    Where an invited client lands from the invite email
│   │   └── pending/         Shown to signed-in but not-yet-approved users
│   ├── (portal)/            Authenticated pages — PortalShell layout applied here
│   │   ├── layout.tsx       Checks auth + approval, fetches user, renders PortalShell
│   │   ├── dashboard/       Eagle's eye view (KPI cards)
│   │   ├── projects/        Project list + [id] detail (tabs: todos, messages, team)
│   │   │   └── actions.ts   Server Actions: tasks, comments, messages, members, claim
│   │   ├── team/            Performance & leaderboard + members management
│   │   │   └── actions.ts   Server Actions: admin points, member edits
│   │   ├── clients/         Client management (admin only) — page pending, actions done
│   │   │   └── actions.ts   Server Actions: invite, resend, assign projects, revoke
│   │   ├── revenue/         Revenue charts & per-project breakdown (admin only)
│   │   ├── rewards/         Incentive/loyalty rewards view
│   │   └── settings/        Approval queue + project template builder
│   │       └── actions.ts   Server Actions: approveUser (Resend email), templates
│   ├── auth/
│   │   ├── callback/route.ts    OAuth code exchange
│   │   ├── magic-link/route.ts  Magic-link sign-in
│   │   └── signout/route.ts     Sign out
│   ├── layout.tsx           Root layout — fonts, global CSS, providers
│   ├── page.tsx             Root redirect
│   └── globals.css          Imports tokens.css, Tailwind directives, base reset
│
├── components/
│   ├── ui/                  Primitives — barrel-export from index.ts
│   │   ├── index.ts         Button, Badge (+statusLabel), StatCard, Avatar, Input, Textarea
│   │   ├── confirm-dialog.tsx   confirmDialog() + <ConfirmHost/> — NOT in barrel, import directly
│   │   └── toast.tsx            toast() + host — NOT in barrel, import directly
│   ├── layout/             PortalShell, sidebar, MobileNav, MobileTabBar, NotificationsBell
│   └── modules/            Feature-specific components
│       ├── projects/       ProjectCard, ProjectTabs(+Layout), TodosTab, TodoItem,
│       │                   MessagesTab, TeamTab, CommentEditor, CommentBody, NewProjectModal
│       ├── team/           TeamTabs, TeamPerformanceTable, MembersTab
│       ├── auth/           LoginForm (password + Google + magic-link fallback)
│       └── settings/       ApprovalQueue, TemplateBuilder
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts        Browser client (use in 'use client' components)
│   │   ├── server.ts        Server client (use in Server Components, Route Handlers)
│   │   └── admin.ts         SERVICE ROLE — bypasses RLS. Server Actions only, never
│   │                        imported from a client component. Callers must check admin.
│   ├── site-url.ts          getSiteUrl() — NEXT_PUBLIC_SITE_URL → VERCEL_URL → localhost.
│   │                        Every emailed link is built from this.
│   └── utils.ts             cn(), formatPeso(), formatDate(), formatDateShort(),
│                            formatRelative(), daysUntil(), isOverdue(), clamp(),
│                            percent(), getInitials(), truncate()
│
├── types/
│   └── index.ts             All TypeScript interfaces matching the DB schema
│
└── styles/
    └── tokens.css           CSS custom properties — single source of truth for design
```

Layout note: **PortalShell** renders the sidebar on desktop and swaps to **MobileNav** / **MobileTabBar** (bottom tab bar) on mobile. `confirmDialog` and `toast` hosts are mounted inside PortalShell.

---

## Design system — critical rules

**Never hardcode colors, sizes, or font values in components.**
All design values live in `src/styles/tokens.css` as CSS custom properties.
Tailwind is configured to map those tokens to utility classes. Enforced by the
`design-token-auditor` agent.

### Token → Tailwind class pattern

| Token | Tailwind class |
|---|---|
| `--color-brand` | `bg-brand`, `text-brand`, `border-brand` |
| `--color-bg-surface-1` | `bg-bg-surface1` |
| `--color-text-secondary` | `text-secondary` |
| `--color-border-subtle` | `border-subtle` |
| `--color-success` | `bg-success`, `text-success` |

### Brand palette (from weblikha.com)

- **Yellow accent:** `#FDD33C` (`--color-brand`)
- **Near-black base:** `#101010` (`--color-bg-base`)
- **Card surface:** `#1A1A1A` (`--color-bg-surface-1`)
- **Elevated surface:** `#1E1E1E` (`--color-bg-surface-2`)
- **Green (success/on-track):** `#33D656`
- **Red (danger/at-risk):** `#F95B3B`
- **Heading font:** Bricolage Grotesque (loaded via next/font)
- **Body font:** Inter (loaded via next/font)

### Adding a new design token

1. Add `--color-<name>: <value>;` to `src/styles/tokens.css`
2. Add `<name>: 'var(--color-<name>)'` to `tailwind.config.ts` under `theme.extend.colors`
3. Use `bg-<name>`, `text-<name>` in components — done.

---

## Database schema

Postgres on Supabase. All tables have Row Level Security enabled. Schema is built up
across `supabase/migrations/001` → `013` (see the migration log below). The
authoritative TypeScript mirror is `src/types/index.ts` — update it whenever a column
changes.

### Core tables

```
users               id, email, name, role (admin|provider|client), specialty,
                    skills text[] (skills[0] = primary; specialty is legacy),
                    employment_type (in-house|outsource), avatar_url, approved, timestamps
projects            id, name, client_name, status (discovery|in_progress|review|
                    completed|archived), start_date, end_date, budget, description, created_by
project_members     id, project_id, user_id, role_in_project, joined_at  (join table)
task_lists          id, project_id, name, position, created_by, created_at, updated_at
                    (phases within a project; created_by drives the client badge)
tasks               id, project_id, task_list_id, assignee_id (nullable → claimable),
                    title, description, status (pending|in_progress|done), due_date,
                    completed_at, points_value (default 60; 0 for client-filed),
                    position, created_by
task_comments       id, task_id, author_id, body (rich-text HTML), mentions uuid[], timestamps
messages            id, project_id, author_id, title, body, is_client_visible, timestamps
performance_periods user_id, period_month, period_year, task_points, deadline_points,
                    admin_points, total_points (generated), admin_note, timestamps
revenue_entries     id, project_id, type (income|expense), amount, date, note
notifications       id, user_id, actor_id, type (mention|task_assigned|client_task|
                    client_message), project_id, task_id, comment_id, read_at, created_at
push_subscriptions  id, user_id, endpoint (unique), p256dh, auth, user_agent, timestamps
                    (one row per browser/device; owner-only RLS — server reads use
                    the service-role admin client in src/lib/supabase/admin.ts)

client_projects     VIEW over projects WITHOUT budget/created_by/updated_at.
                    security_invoker, so caller RLS still applies. Client-facing
                    screens read this — RLS is row-level, so querying `projects`
                    directly hands a client the budget column.
```

### Template tables (project scaffolding from Settings)

```
project_templates       id, name, description, created_by
template_task_lists     id, template_id, name, position
template_tasks          id, template_task_list_id, title, description, points_value, position
```

`applyTemplate` clones a template's phases + tasks onto a new project.

### Key business logic (in SQL triggers / RPCs)

- **`award_task_points`** fires when `tasks.status` flips to `'done'`. Upserts the
  assignee's `performance_periods` row, adding `task_points` (+`points_value`, default 60)
  and `deadline_points` (+30 if completed on or before `due_date`). Completion integrity
  fixed in migration 008. **Migration 014 gates the deadline bonus on `points_value > 0`** —
  otherwise a zero-point client-filed task still paid out the flat +30. Corollary: triage a
  client task (0 → 60) BEFORE it is completed, never after, or the reversal maths mismatches.
- **`handle_new_auth_user`** fires on `auth.users` insert — auto-creates the `public.users`
  row (defaults `approved = false`, migration 003).
- **`set_updated_at`** keeps `updated_at` current on updated rows.
- **Reorder RPCs** (migrations 010/012) handle task `position` ordering for @dnd-kit.
- **Claim RPC** (migration 011) lets a provider claim an unassigned task. Migration 014
  narrowed this to `provider` only — clients are project members now, and the original
  policy would have let them claim team work.
- **Notifications** (migration 013) inserted on @mention and task-assignment events.
- RLS uses `is_admin()` / `get_user_role()` / `is_project_member(pid)` /
  `is_member_of(pid, uid)` helpers — never inline subqueries. `is_member_of` validates
  *another* user (e.g. an assignee a client picked); `is_project_member` validates self.

### Migration log

```
001 initial schema          002 projects feature (task_lists, messages, client role)
003 user approval gate       004 schema normalization/optimization
005 todos & task-list templates   006 employment_type
007 user skills (multi-value)     008 task comments + completion fix
009 rich-text comments, editing, mentions, attachments
010 task ordering            011 claim unassigned tasks
012 reorder task RPC         013 in-app notifications
014 web push subscriptions          014 client collaboration (created_by, client
                                        RLS, points fix, client_projects view)
015 client privilege fixes          016 privilege hardening (admin self-promotion)
017 read scope fixes                018 client delete + definer hardening
```

**⚠️ TWO MIGRATIONS ARE NUMBERED 014.** `014_push_subscriptions.sql` and
`014_client_collaboration.sql` were written on branches that did not see each other.
`supabase db push` orders by filename, so this is ambiguous and must be resolved before
the CLI is used again. Renumbering is not free: 014 (client collaboration), 015 and 016
were applied **by hand** to dev and prod under these names, so a rename moves the repo
without moving either database. Decide deliberately, then record what each environment
actually has.

```
```

### Incentive point system

Points accumulate monthly per team member:
- **Task completion:** `points_value` per closed task (default 60)
- **Deadline adherence:** +30 pts per task closed on time
- **Admin bonus:** Manual input by admin (can be negative for deductions)
- **Total:** `total_points` generated column = sum of all three

Threshold for loyalty incentive: **1,000 pts/month**. Admin views/overrides `admin_points`
(+`admin_note`) via the Team Performance screen. The Rewards page surfaces this to members.

### RLS summary

- `admin` role: full access to all tables
- `provider` role: own user row + assigned projects + own/claimable tasks + own performance
- `client` role: assigned projects only. May file tasks and phases, edit/delete their own
  while still `pending`, and post messages. Enforced in `WITH CHECK`, not in server actions:
  client tasks are forced to `points_value = 0` and `status = 'pending'` (so a client can
  never mark work done or mint incentive points), an assignee must already be a project
  member, and client messages are forced `is_client_visible = true` (otherwise RLS would
  hide the client's own post from them).
- Revenue table: **admin only** — providers and clients never see financial data
- **Budget caveat:** RLS is row-level. The `projects: member or admin` policy hands any
  member the whole row including `budget`, so client screens must read `client_projects`.

---

## Client portal

Invited clients collaborate on the projects they are assigned to. Agreed behaviour —
these were decisions, not guesses, so don't quietly redesign them:

**Clients can:** file tasks (worth 0 points until an admin triages them), create phases,
assign a task to anyone already on that project, post on the message board, and see the
project's full to-do list including internal tasks.
**Clients cannot:** apply phase templates, mark anything done, reach Revenue or Rewards,
see project budgets, or see `employment_type` (in-house vs outsource) on the Team tab —
that one is agency-internal. The Team tab shows names and roles only.
**Multiple projects per client** — assignment is via `project_members`, not a single FK.
**Client-created phases and tasks carry an "Added by client" badge**, resolved by joining
`created_by` → `users.role`.

### Auth flow

Admin invites by email → Supabase `inviteUserByEmail` (service role) → email arrives via
the Resend SMTP settings → client clicks → `/auth/callback?next=/set-password` exchanges
the code → `/set-password` calls `updateUser({ password })` → `/dashboard`.

Password rather than magic link is deliberate: corporate mail scanners (Mimecast,
Proofpoint, Defender) pre-fetch links, and magic links are single-use, so a scanner burns
the link before the client clicks it. Passwords move that fragility to a single onboarding
email instead of every login. Magic link is kept as the recovery path, and
`/login?error=invite_expired` tells the client exactly what happened.

### Two security decisions worth not undoing

1. **Never read the role from `raw_user_meta_data`.** The obvious implementation of
   "invite carries the role" is to have `handle_new_auth_user` read it — but user metadata
   is writable by the signing-up user, so anyone calling `signUp` with
   `options.data = { role: 'admin' }` would mint an admin. The trigger is untouched;
   `inviteClient` promotes the row afterwards with the service role.
2. **Revoking removes `project_members` rows, not just `approved`.** The approval flag is
   only an app-layer gate in `(portal)/layout.tsx`; RLS keys off membership, so a revoked
   client with a live session could still pull project data through the API. Restoring a
   client therefore does not restore project access — reassign deliberately.

Also hardened while in here: `/auth/magic-link` sets `shouldCreateUser: false`. It had been
open, so anyone hitting that route could mint an account (landing in the approval queue).

---

## Supabase clients — which to use where

| Context | Import |
|---|---|
| Server Component | `import { createClient } from '@/lib/supabase/server'` then `await createClient()` |
| Client Component / hook | `import { createClient } from '@/lib/supabase/client'` then `createClient()` |
| Route Handler / Server Action | Server client |

**Never use the service role key in the browser.** It bypasses RLS. (Enforced by the
`rls-security-reviewer` agent.)

---

## Code patterns to follow

### Server Components first
Pages are Server Components by default. Only add `'use client'` when you need React hooks,
browser APIs, or event handlers.

### Data fetching & mutations
- **Reads (Server Components):** `await supabase.from(...).select(...)` directly in the component.
- **Reads (Client Components):** TanStack Query.
- **Writes:** Server Actions colocated in `actions.ts` next to the route
  (`projects/actions.ts`, `team/actions.ts`, `settings/actions.ts`).

### Component imports
Import UI primitives from the barrel: `import { Button, Badge, StatCard } from '@/components/ui'`.
Exception: `confirmDialog` and `toast` are imported directly from
`@/components/ui/confirm-dialog` and `@/components/ui/toast` (not in the barrel).

### Utility functions
Use `cn()` for conditional classes, `formatPeso()` for currency, `formatDate()` for dates —
all in `src/lib/utils.ts`.

### TypeScript
- All entities are typed in `src/types/index.ts`. No `any` — use `unknown` and narrow.
- Prefix unused parameters with `_` to satisfy the linter.
- Repo carries a known baseline of ~7 pre-existing `exactOptionalPropertyTypes` tsc errors
  (dashboard/page.tsx, team/page.tsx, lib/supabase/server.ts) — not caused by new work.

---

## Standing rules (Matthew's feedback — do these every time)

These are enforced across the codebase; the paired agents check them. Full detail in @MEMORY.md.

1. **Confirm all deletions** — every destructive action uses `confirmDialog({...})` from
   `@/components/ui/confirm-dialog` (promise-based). Never native `confirm()`/`alert()`.
2. **Mobile + desktop in the same pass** — apply both responsive class sets together
   (`grid-cols-2 md:grid-cols-4`, `hidden md:flex`). Never defer mobile.
3. **Skeleton loaders** — every new page route gets a `loading.tsx` sibling using
   `animate-pulse` + `bg-bg-surface-3`, matching the page's rough structure.
4. **Interaction feedback** — every interactive element gets hover/active/focus-visible
   states, async pending state (no double-submit), and outcome confirmation via `toast`.
5. **Schema review before every feature** — check normalization, indexes on FK/filter
   columns, `updated_at` + trigger on new tables, RLS via helpers, integrity triggers.
6. **Git commits** — always author as `Matthew Kim <weblikhadigital@gmail.com>`. It's the
   only verified email on the connected GitHub account; Vercel blocks deploys from others.

---

## Agents (`.claude/agents/`)

Use these proactively:

- **schema-reviewer** — before starting a feature and on any migration change.
- **rls-security-reviewer** — before merging anything touching data access, auth, or migrations.
- **design-token-auditor** — after building/editing UI, catches hardcoded colors/sizes/fonts.
- **ui-convention-checker** — after adding pages/components; checks barrel imports,
  loading.tsx, responsive classes, confirmDialog, Server-Components-first, interaction feedback.
- **pr-reviewer** — full pre-PR pass: runs typecheck + lint, then reviews the diff.

---

## Adding a new feature

1. **Schema review** (run `schema-reviewer`) → add a migration in `supabase/migrations/`
   (next number) if needed.
2. **Types:** update `src/types/index.ts` to match.
3. **Writes:** add Server Actions in the route's `actions.ts`.
4. **Component:** build in `src/components/modules/<feature>/`, mobile + desktop together,
   with a `loading.tsx` for the route.
5. **Page:** wire up in `src/app/(portal)/<route>/page.tsx`.
6. **Nav:** add to the nav items in `src/components/layout/sidebar.tsx` (and mobile nav).
7. **Review:** run `ui-convention-checker`, `design-token-auditor`, `rls-security-reviewer`,
   then `pr-reviewer` before the PR.

---

## Running the project

```bash
npm install

cp .env.local.example .env.local
# All six vars are documented in .env.local.example. SUPABASE_SERVICE_ROLE_KEY is
# required for client invites; NEXT_PUBLIC_SITE_URL is what emailed links are built
# from (getSiteUrl() falls back to VERCEL_URL, then localhost).

# Apply migrations (Supabase Dashboard SQL Editor, or CLI):
# npx supabase db push        <- the CLI is a devDependency, NOT global. Bare
#                                `supabase` is "not recognized" on Windows.
#   WARNING: supabase/.temp/project-ref decides the target and has historically
#   pointed at PROD. Check it before pushing:
#     npx supabase link --project-ref tydreidoqzndxjftpyzd   # dev
#   NOTE: use gen_random_uuid(), not uuid_generate_v4() — the CLI search_path
#   doesn't see the extensions schema (bit us on migrations 001/002/005).

npm run dev         # dev server
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run check       # lint + typecheck (run before every PR)
```

### Environments

- **Dev Supabase project:** `tydreidoqzndxjftpyzd` (used locally via `.env.local`).
- **Prod Supabase project:** `vhsuyouczctnkvnnjzgg`. Prod keys live only in Vercel env vars;
  service role scoped to Production. Migrations 001–013 applied to prod; **014 is dev-only
  so far** and must be applied before the client portal ships.
- **Auth URL config** (Supabase → Authentication → URL Configuration): redirect URLs need a
  `/**` wildcard entry per environment, or Supabase silently ignores `redirectTo` and dumps
  the user on the Site URL. Dev: `http://localhost:3000/**`.
- **Auth SMTP** points at Resend on a verified domain. If the sender is ever reset to
  `onboarding@resend.dev`, Resend only delivers to the account owner and every client
  invite silently fails.
- A `supabase-keepalive-ping` scheduled task pings both projects every 3 days.
- Google OAuth enabled on both (shared Google Cloud OAuth client, prod callback added).

---

## GitHub workflow

```
main    → production (Vercel auto-deploys)
dev     → staging
feature/* → PR into dev
```

CI runs on every PR: lint + typecheck (see `.github/workflows/ci.yml`). PRs must pass CI
before merging. Commit as `weblikhadigital@gmail.com` (see standing rule #6).
