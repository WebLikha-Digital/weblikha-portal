# Weblikha Portal — Claude Code Context

This file is read by Claude Code at the start of every session.
It contains everything needed to understand the codebase without reading every file.

---

## What this project is

An internal agency management portal for **Weblikha Digital Inc.** — a Webflow agency based in the Philippines.

**Users:** Admin (Matthew Kim) + service providers (devs, designers, SEO specialists).
**Not yet in scope:** Client-facing features, Moxie integration, time tracking.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15, App Router, React 19 |
| Language | TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`) |
| Styling | Tailwind CSS — all values come from CSS tokens (see below) |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Server state | TanStack Query v5 |
| Charts | Recharts |
| Icons | lucide-react |
| Utilities | clsx, tailwind-merge (via `cn()`), date-fns |

---

## Project structure

```
src/
├── app/
│   ├── (auth)/login/        Login page (no sidebar)
│   ├── (portal)/            Authenticated pages — sidebar layout applied here
│   │   ├── layout.tsx       Checks auth, fetches user, renders Sidebar
│   │   ├── dashboard/       Eagle's eye view
│   │   ├── projects/        Project list + [id] detail
│   │   ├── team/            Performance & leaderboard
│   │   └── revenue/         Revenue charts & per-project breakdown
│   ├── layout.tsx           Root layout — fonts, global CSS only
│   └── globals.css          Imports tokens.css, Tailwind directives, base reset
│
├── components/
│   ├── ui/                  Primitive components (Button, Badge, StatCard, Avatar, Input)
│   │   └── index.ts         Barrel export — always import from here
│   ├── layout/              Sidebar, Topbar
│   └── modules/             Feature-specific components (ProjectsTable, RevenueChart, etc.)
│       ├── projects/
│       ├── team/
│       └── revenue/
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts        Browser client (use in 'use client' components)
│   │   └── server.ts        Server client (use in Server Components, Route Handlers)
│   └── utils.ts             cn(), formatPeso(), formatDate(), getInitials(), etc.
│
├── types/
│   └── index.ts             All TypeScript interfaces matching the DB schema
│
└── styles/
    └── tokens.css           CSS custom properties — single source of truth for design
```

---

## Design system — critical rules

**Never hardcode colors, sizes, or font values in components.**
All design values live in `src/styles/tokens.css` as CSS custom properties.
Tailwind is configured to map those tokens to utility classes.

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

6 tables. All have Row Level Security enabled.

```
users               id, email, name, role (admin|provider), specialty, avatar_url
projects            id, name, client_name, status, start_date, end_date, budget, description
project_members     project_id, user_id, role_in_project  (join table)
tasks               id, project_id, assignee_id, title, status, due_date, points_value, completed_at
performance_periods user_id, period_month, period_year, task_points, deadline_points, admin_points, total_points (generated)
revenue_entries     id, project_id, type (income|expense), amount, date, note
```

### Key business logic (in SQL triggers)

- **`award_task_points`** fires when `tasks.status` flips to `'done'`.
  It upserts `performance_periods` for the assignee, adding `task_points` (+60 default)
  and `deadline_points` (+30 if completed on or before `due_date`).
- **`handle_new_auth_user`** fires on `auth.users` insert — auto-creates the `public.users` row.
- **`set_updated_at`** fires on `performance_periods` update — keeps `updated_at` current.

### Incentive point system

Points accumulate monthly per team member:
- **Task completion:** `points_value` per closed task (default 60)
- **Deadline adherence:** +30 pts per task closed on time
- **Admin bonus:** Manual input by admin (can be negative for deductions)
- **Total:** `total_points` generated column = sum of all three

Threshold for loyalty incentive: **1,000 pts/month**.
Admin can view and override `admin_points` via the Team Performance screen.

### RLS summary

- `admin` role: full access to all tables
- `provider` role: own user row + assigned projects + own tasks + own performance
- Revenue table: **admin only** — providers never see financial data

---

## Supabase clients — which to use where

| Context | Import |
|---|---|
| Server Component | `import { createClient } from '@/lib/supabase/server'` then `await createClient()` |
| Client Component / hook | `import { createClient } from '@/lib/supabase/client'` then `createClient()` |
| Route Handler | Server client |

**Never use the service role key in the browser.** It bypasses RLS.

---

## Code patterns to follow

### Server Components first
Pages are Server Components by default. Only add `'use client'` when you need:
- React hooks (useState, useEffect)
- Browser APIs
- Event handlers

### Data fetching
- **Server Components:** `await supabase.from(...).select(...)` directly in the component
- **Client Components:** TanStack Query hooks in `src/hooks/`

### Component imports
Always import UI primitives from the barrel:
```typescript
import { Button, Badge, StatCard } from '@/components/ui'
```

### Utility functions
Use `cn()` for conditional classes, `formatPeso()` for currency, `formatDate()` for dates.
These are all in `src/lib/utils.ts`.

### TypeScript
- All entities are typed in `src/types/index.ts`
- No `any` types — use `unknown` and narrow if needed
- Prefix unused parameters with `_` to satisfy the linter

---

## Adding a new feature

1. **Design:** Mock it in Claude Design (Cowork) using the existing tokens
2. **Types:** Add new interfaces to `src/types/index.ts` if needed
3. **DB:** Add a migration in `supabase/migrations/` (prefix with next number)
4. **API:** Create a Route Handler or Server Action if the operation is write-heavy
5. **Component:** Build in `src/components/modules/<feature>/`
6. **Page:** Wire up in `src/app/(portal)/<route>/page.tsx`
7. **Nav:** Add to the `NAV_ITEMS` array in `src/components/layout/sidebar.tsx`

---

## Running the project

```bash
# Install dependencies
npm install

# Copy env vars
cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

# Run Supabase migration (in Supabase Dashboard SQL Editor, or via CLI)
# supabase db push

# Start dev server
npm run dev

# Type check
npm run typecheck

# Lint
npm run lint
```

---

## GitHub workflow

```
main    → production (Vercel auto-deploys)
dev     → staging
feature/* → PR into dev
```

CI runs on every PR: lint + typecheck (see `.github/workflows/ci.yml`).
PRs must pass CI before merging.
