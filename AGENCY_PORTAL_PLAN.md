# Weblikha Agency Portal — Project Plan

## What We're Building

An internal agency management portal for tracking projects, team performance, and revenue — with role-based access for admins and service providers (devs, designers, SEO specialists, etc.).

---

## Core Modules

### 1. Project Dashboard (Eagle's Eye View)
- All active projects at a glance (status, progress, deadline, budget)
- Filter by status: Discovery, In Progress, Review, Completed
- Project health indicators (on-track / at-risk / delayed)

### 2. Team & Performance Tracker
- Per-team-member task completion rate, quality scores
- Project contribution history
- Incentive/loyalty scoring system (points, streaks, top performer badges)

### 3. Revenue Tracker
- Per-project: estimated vs. actual revenue, expenses, profit margin
- Agency-wide: monthly/quarterly revenue overview, MRR, pipeline value
- Integration-ready for Moxie (manual input for now, webhook later)

### 4. Admin Panel
- User management (invite service providers, assign roles)
- Project creation and assignment
- Incentive configuration

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend** | Next.js 14 (App Router) + TypeScript | SSR, file-based routing, strong ecosystem |
| **Styling** | Tailwind CSS + shadcn/ui | Fast to build, clean components, accessible |
| **Backend/API** | Next.js API Routes + Supabase | Serverless-friendly, co-located with frontend |
| **Database** | Supabase (PostgreSQL) | Managed Postgres, built-in auth, Row Level Security |
| **Auth** | Supabase Auth | Role-based access (admin / provider), magic link + email/password |
| **Charts** | Recharts | Native React, lightweight, sufficient for dashboards |
| **State** | TanStack Query (React Query) | Server state, caching, background refetch |
| **Version Control** | GitHub | Private repo, branch-based workflow |
| **Deployment** | Vercel | Zero-config Next.js deployment, preview deploys per PR |
| **CI/CD** | GitHub Actions | Run lint + type checks on PRs |

### Why Supabase over a custom backend
- Auth + database + real-time + storage in one platform
- Row Level Security means the DB enforces who can see what (admins see all, providers see only their own)
- Free tier is enough for internal tooling at agency scale
- You can self-host later if needed

---

## Build Phases

### Phase 1 — Design (Week 1–2)
**Tools: Figma + Claude Design**

1. Sketch user flows: admin vs. service provider perspectives
2. Design core screens:
   - Dashboard overview
   - Project detail page
   - Team member profile / performance card
   - Revenue page
3. Build a mini design system (colors, typography, components)
4. Handoff specs for dev

### Phase 2 — Foundation (Week 2–3)
**Tools: Claude Code + GitHub**

1. Initialize Next.js project, push to GitHub
2. Set up Supabase project (database schema, auth)
3. Configure Row Level Security policies
4. Wire up auth (login, protected routes, role detection)

### Phase 3 — Core Features (Week 3–5)
**Tools: Claude Code**

Build in this order (each unblocks the next):
1. Project CRUD (create, view, edit, archive)
2. Team member management + role assignment
3. Task/milestone tracking per project
4. Performance scoring engine
5. Revenue input + per-project P&L

### Phase 4 — Dashboard & Analytics (Week 5–6)
1. Eagle's eye dashboard (charts, KPIs, status summary)
2. Agency revenue overview page
3. Top performers leaderboard

### Phase 5 — Polish & Deploy (Week 6–7)
1. Mobile responsiveness
2. Email notifications (via Supabase Edge Functions + Resend)
3. Production deployment on Vercel
4. Set up GitHub Actions for CI

---

## Database Schema (Draft)

```
users            → id, name, email, role (admin | provider), specialty, created_at
projects         → id, name, client_name, status, start_date, end_date, budget, actual_revenue
project_members  → project_id, user_id, role_in_project, joined_at
tasks            → id, project_id, assignee_id, title, status, due_date, points
performance      → id, user_id, period, tasks_completed, score, incentive_points
revenue_entries  → id, project_id, type (income | expense), amount, date, note
```

---

## Recommended Skills to Install

For Claude to assist more effectively during this build:

| Skill | Use |
|-------|-----|
| **design:design-system** | Audit and document your component library as it grows |
| **design:design-handoff** | Generate dev specs from Figma screens before building |
| **design:design-critique** | Get feedback on dashboard layouts before handoff |
| **design:ux-copy** | Write microcopy for empty states, error messages, CTAs |
| **anthropic-skills:xlsx** | Export revenue data to Excel for finance reviews |
| **anthropic-skills:pdf** | Generate project summary PDFs for client-facing reports (future) |

**Also consider installing these plugins/MCPs:**
- **GitHub MCP** — lets Claude read your repo, open PRs, review diffs directly in Cowork
- **Supabase MCP** — lets Claude query your database and inspect schema
- **Linear MCP** (optional) — track the build itself as tickets

---

## Using Claude Design + Claude Code

**Claude Design** (Cowork's design capability):
- Use it to iterate on wireframes and UI mockups conversationally
- Generate design tokens (colors, spacing) for your Tailwind config
- Critique and refine screens before building

**Claude Code** (terminal-based):
- Primary tool for scaffolding, writing components, and debugging
- Use inside VS Code terminal or standalone
- Let it write the boilerplate (auth setup, API routes, form logic) while you focus on product decisions

---

## Git Workflow

```
main          → production (auto-deploys to Vercel)
dev           → staging branch
feature/*     → feature branches (PR into dev)
```

One GitHub Actions workflow: on every PR → lint + type check + build check.

---

## What's Out of Scope (for now)
- Client-facing portal (noted for future phase)
- Moxie integration (manual input for now)
- Time tracking (can add in Phase 4+)
- Invoice generation (Moxie handles this)
