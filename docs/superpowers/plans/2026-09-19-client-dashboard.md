# Client Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client signing in sees their projects with progress and team, their own open requests, recent shared messages, and what is due — instead of the empty provider dashboard they get today.

**Architecture:** `dashboard/page.tsx` becomes a role router; the admin and provider bodies move verbatim into `src/components/modules/dashboard/`, and a new `ClientDashboard` joins them. One data function does all the reads with explicit column lists, so `budget` and `employment_type` can never reach a client's payload.

**Tech Stack:** Next.js 15.5 App Router (Server Components), React 19, TypeScript strict, Supabase + RLS, Tailwind via CSS tokens.

**Spec:** `docs/superpowers/specs/2026-09-19-client-dashboard-design.md`

## Global Constraints

- **No test framework exists in this repo, by standing decision.** Do not add one. Each task's gate is `npx tsc --noEmit` exiting 0 plus its named check.
- **`npx tsc --noEmit` stays at zero errors.** `strict`, `noUncheckedIndexedAccess` and **`exactOptionalPropertyTypes`** are on — an optional prop that may receive `undefined` must be typed `?: T | undefined`.
- **No `any`.** Use `unknown` and narrow, or a typed cast through `unknown` for a Supabase embed result.
- **Never `select('*')` on `projects` or `users` in client-facing code.** `projects` carries `budget`; `users` carries `email`, `employment_type`, `bio` and `location`. Explicit column lists only — this is the constraint the last two branches had to retrofit after review.
- **Never hardcode colors, sizes or fonts.** Tailwind token classes only.
- **Mobile and desktop classes in the same pass.**
- **Every interactive element:** hover, `active:` press cue, `focus-visible:ring`. Nothing here mutates, so there is no pending state or toast to add.
- **Imports:** primitives from `@/components/ui`.
- **No migration.** This feature adds no table, column or policy. If a task seems to need one, stop and report — something has been misread.
- **The admin and provider dashboards move files and change nothing else.** Same queries, same markup, same behaviour. A "while I'm here" improvement to either is out of scope and should be rejected in review.
- **Commits** authored `Matthew Kim <weblikhadigital@gmail.com>`, ending `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Stage files by explicit path; never `git add -A` (untracked `.superpowers/` must not be committed; `tsconfig.tsbuildinfo` stays unstaged).
- **Branch:** create `feature/client-dashboard` from `main` before Task 1.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/components/modules/dashboard/AdminDashboard.tsx` | **Create.** The existing admin dashboard, moved verbatim. |
| `src/components/modules/dashboard/ProviderDashboard.tsx` | **Create.** The existing provider dashboard, moved verbatim. |
| `src/components/modules/dashboard/dashboard-shared.ts` | **Create.** The one value both moved files share (`dateLabel`). |
| `src/app/(portal)/dashboard/page.tsx` | **Rewrite.** A role router, nothing else. |
| `src/components/modules/dashboard/client-data.ts` | **Create.** `loadClientDashboard()` — every read, with explicit columns. |
| `src/components/modules/dashboard/ClientDashboard.tsx` | **Create.** The screen. |
| `src/components/modules/dashboard/ClientProjectCard.tsx` | **Create.** One project: status, progress, next deadline, team. |
| `src/app/(portal)/dashboard/loading.tsx` | **Rewrite.** Skeleton shaped like the client layout. |
| `CLAUDE.md`, `MEMORY.md` | **Modify.** Structure, stage status, backlog. |

---

## Task 1: Move the two existing dashboards out, unchanged

**Files:**
- Create: `src/components/modules/dashboard/dashboard-shared.ts`
- Create: `src/components/modules/dashboard/AdminDashboard.tsx`
- Create: `src/components/modules/dashboard/ProviderDashboard.tsx`
- Rewrite: `src/app/(portal)/dashboard/page.tsx`

**Interfaces:**
- Produces:

```ts
// dashboard-shared.ts
export const dateLabel: string

// AdminDashboard.tsx
export async function AdminDashboard(props: { supabase: SupabaseServerClient }): Promise<JSX.Element>
// ProviderDashboard.tsx
export async function ProviderDashboard(props: { supabase: SupabaseServerClient; userId: string; userName: string }): Promise<JSX.Element>
// where SupabaseServerClient = Awaited<ReturnType<typeof createClient>> from '@/lib/supabase/server'
```

- [ ] **Step 1: Branch**

```bash
git checkout main
git pull --ff-only
git checkout -b feature/client-dashboard
```

Expected: `Switched to a new branch 'feature/client-dashboard'`.

- [ ] **Step 2: Read the file you are about to split**

Run: `cat "src/app/(portal)/dashboard/page.tsx"`

It is ~234 lines: imports, a module-level `dateLabel`, a default export that branches on role, then `AdminDashboard` and `ProviderDashboard`. Note which imports each function actually uses — you are about to divide them.

- [ ] **Step 3: Extract the shared date label**

Create `src/components/modules/dashboard/dashboard-shared.ts`:

```ts
/**
 * Computed once per server start, not per request — matching the behaviour this
 * had as a module-level constant in dashboard/page.tsx. On a long-lived server
 * the date can go stale until the next deploy; that was true before this move
 * and is deliberately not changed here.
 */
export const dateLabel = new Date().toLocaleDateString('en-PH', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
})
```

- [ ] **Step 4: Move the admin dashboard verbatim**

Create `src/components/modules/dashboard/AdminDashboard.tsx` containing the `AdminDashboard` function **exactly as it is today** — same queries, same JSX, same helper values. Add only:

- a file header comment saying it was moved from `dashboard/page.tsx` in this change and that nothing else changed,
- `export` on the function,
- the imports it needs (`createClient` type usage, `StatCard`, `Badge`, `Link`, `formatPeso`, `percent`, `ProjectStatus`, `dateLabel` from `./dashboard-shared`) — copy only the ones it actually references.

Type the `supabase` prop as `Awaited<ReturnType<typeof createClient>>`, exactly as it is now.

- [ ] **Step 5: Move the provider dashboard verbatim**

Create `src/components/modules/dashboard/ProviderDashboard.tsx` the same way: the `ProviderDashboard` function unchanged, exported, with its own imports and the same header note.

- [ ] **Step 6: Reduce the page to a router**

Replace the entire contents of `src/app/(portal)/dashboard/page.tsx` with:

```tsx
/**
 * DASHBOARD PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * A role router, nothing more. Each role's dashboard is a separate component
 * under components/modules/dashboard/ — three unrelated screens in one file was
 * the thing that made this page hard to work in.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminDashboard } from '@/components/modules/dashboard/AdminDashboard'
import { ProviderDashboard } from '@/components/modules/dashboard/ProviderDashboard'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, name, role')
    .eq('id', authUser.id)
    .single()

  if (!profile) redirect('/login?error=profile_missing')

  if (profile.role === 'admin') {
    return <AdminDashboard supabase={supabase} />
  }

  return (
    <ProviderDashboard
      supabase={supabase}
      userId={profile.id}
      userName={profile.name ?? ''}
    />
  )
}
```

Note the profile read narrowed from `select('*')` to three columns — the page only ever used `role` and `name`, and this is the file being rewritten anyway. The client branch arrives in Task 3.

- [ ] **Step 7: Prove nothing changed**

Run: `npx tsc --noEmit`
Expected: exits 0.

Run: `npm run build`
Expected: success.

Run: `git diff --stat`
Expected: `page.tsx` shrinks by roughly 200 lines; the three new files hold them. Read your own diff and confirm that **no line of the admin or provider bodies changed** apart from the added `export` and imports. If you found yourself improving something in them, undo it.

- [ ] **Step 8: Commit**

```bash
git add src/components/modules/dashboard/dashboard-shared.ts src/components/modules/dashboard/AdminDashboard.tsx src/components/modules/dashboard/ProviderDashboard.tsx "src/app/(portal)/dashboard/page.tsx"
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Split the dashboard page into per-role components

Admin and provider move verbatim; the page becomes a router so a third
dashboard does not make one file three unrelated screens.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: The client's data

**Files:**
- Create: `src/components/modules/dashboard/client-data.ts`

**Interfaces:**
- Produces:

```ts
export interface ClientTeamMember { id: string; name: string; avatar_url: string | null; role: UserRole; job_title: string | null; timezone: string | null }
export interface ClientProjectSummary {
  id: string; name: string; status: ProjectStatus; end_date: string | null
  totalTasks: number; doneTasks: number
  nextDue: { id: string; title: string; due_date: string } | null
  team: ClientTeamMember[]
}
export interface ClientRequest { id: string; title: string; status: TaskStatus; project_id: string; project_name: string; due_date: string | null }
export interface ClientDeadline { id: string; title: string; due_date: string; project_id: string; project_name: string; overdue: boolean }
export interface ClientMessagePreview { id: string; title: string; project_id: string; created_at: string; author_name: string }
export interface ClientDashboardData {
  projects: ClientProjectSummary[]
  requests: ClientRequest[]
  overdue: ClientDeadline[]
  upcoming: ClientDeadline[]
  messages: ClientMessagePreview[]
}
export async function loadClientDashboard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<ClientDashboardData>
```

- [ ] **Step 1: Write the module**

Create `src/components/modules/dashboard/client-data.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import type { ProjectStatus, TaskStatus, UserRole } from '@/types'

/**
 * CLIENT DASHBOARD DATA
 * ─────────────────────────────────────────────────────────────────────────────
 * Every read the client dashboard needs, as the signed-in client under their own
 * RLS. No service-role client, no new policies.
 *
 * EXPLICIT COLUMN LISTS, never select('*'):
 *   - `projects` carries `budget`, and RLS is row-level — the "member or admin"
 *     policy hands a member the whole row (CLAUDE.md, "Budget caveat").
 *   - `users` carries email, employment_type, bio and location. The Team tab
 *     deliberately shows names and roles only.
 * Widening either list is a privacy regression, not a convenience.
 *
 * One task query serves progress, requests and deadlines — same rows, different
 * filtering, and a client's project set is small.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const UPCOMING_DAYS   = 14
const MESSAGE_LIMIT   = 5
const REQUEST_LIMIT   = 6
const DEADLINE_LIMIT  = 6

export interface ClientTeamMember {
  id:         string
  name:       string
  avatar_url: string | null
  role:       UserRole
  job_title:  string | null
  timezone:   string | null
}

export interface ClientProjectSummary {
  id:         string
  name:       string
  status:     ProjectStatus
  end_date:   string | null
  totalTasks: number
  doneTasks:  number
  nextDue:    { id: string; title: string; due_date: string } | null
  team:       ClientTeamMember[]
}

export interface ClientRequest {
  id:           string
  title:        string
  status:       TaskStatus
  project_id:   string
  project_name: string
  due_date:     string | null
}

export interface ClientDeadline {
  id:           string
  title:        string
  due_date:     string
  project_id:   string
  project_name: string
  overdue:      boolean
}

export interface ClientMessagePreview {
  id:          string
  title:       string
  project_id:  string
  created_at:  string
  author_name: string
}

export interface ClientDashboardData {
  projects: ClientProjectSummary[]
  requests: ClientRequest[]
  overdue:  ClientDeadline[]
  upcoming: ClientDeadline[]
  messages: ClientMessagePreview[]
}

const EMPTY: ClientDashboardData = {
  projects: [], requests: [], overdue: [], upcoming: [], messages: [],
}

interface ProjectRow {
  id:       string
  name:     string
  status:   ProjectStatus
  end_date: string | null
  members:  { user: ClientTeamMember | null }[] | null
}

interface TaskRow {
  id:         string
  project_id: string
  title:      string
  status:     TaskStatus
  due_date:   string | null
  created_by: string | null
}

interface MessageRow {
  id:         string
  title:      string
  project_id: string
  created_at: string
  author:     { name: string } | null
}

export async function loadClientDashboard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<ClientDashboardData> {
  // Membership first: RLS on `projects` already limits rows, but going through
  // project_members matches how the projects page reads and keeps the `.in()`
  // filters below explicit.
  const { data: memberRows } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('user_id', userId)

  const projectIds = (memberRows ?? []).map((r: { project_id: string }) => r.project_id)
  if (projectIds.length === 0) return EMPTY

  const [projectsRes, tasksRes, messagesRes] = await Promise.all([
    supabase
      .from('projects')
      .select(`
        id, name, status, end_date,
        members: project_members(user: users(id, name, avatar_url, role, job_title, timezone))
      `)
      .in('id', projectIds)
      .neq('status', 'archived')
      .order('created_at', { ascending: false }),
    supabase
      .from('tasks')
      .select('id, project_id, title, status, due_date, created_by')
      .in('project_id', projectIds),
    supabase
      .from('messages')
      .select('id, title, project_id, created_at, author: users(name)')
      .in('project_id', projectIds)
      .eq('is_client_visible', true)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_LIMIT),
  ])

  if (projectsRes.error) console.error('[client-dashboard] projects fetch failed:', projectsRes.error)
  if (tasksRes.error)    console.error('[client-dashboard] tasks fetch failed:', tasksRes.error)
  if (messagesRes.error) console.error('[client-dashboard] messages fetch failed:', messagesRes.error)

  const projectRows = (projectsRes.data ?? []) as unknown as ProjectRow[]
  const taskRows    = (tasksRes.data    ?? []) as unknown as TaskRow[]
  const messageRows = (messagesRes.data ?? []) as unknown as MessageRow[]

  const nameById = new Map(projectRows.map(p => [p.id, p.name]))

  const now       = new Date()
  const todayKey  = now.toISOString().slice(0, 10)
  const horizon   = new Date(now.getTime() + UPCOMING_DAYS * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10)

  const projects: ClientProjectSummary[] = projectRows.map(project => {
    const tasks = taskRows.filter(t => t.project_id === project.id)
    const dated = tasks
      .filter(t => t.status !== 'done' && t.due_date !== null)
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    const next = dated[0]

    return {
      id:         project.id,
      name:       project.name,
      status:     project.status,
      end_date:   project.end_date,
      totalTasks: tasks.length,
      doneTasks:  tasks.filter(t => t.status === 'done').length,
      nextDue:    next && next.due_date
        ? { id: next.id, title: next.title, due_date: next.due_date }
        : null,
      team: (project.members ?? [])
        .map(m => m.user)
        .filter((u): u is ClientTeamMember => u !== null),
    }
  })

  const requests: ClientRequest[] = taskRows
    .filter(t => t.created_by === userId && t.status !== 'done')
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
    .slice(0, REQUEST_LIMIT)
    .map(t => ({
      id:           t.id,
      title:        t.title,
      status:       t.status,
      project_id:   t.project_id,
      project_name: nameById.get(t.project_id) ?? '',
      due_date:     t.due_date,
    }))

  const dated = taskRows
    .filter((t): t is TaskRow & { due_date: string } => t.status !== 'done' && t.due_date !== null)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))

  const toDeadline = (t: TaskRow & { due_date: string }, overdue: boolean): ClientDeadline => ({
    id:           t.id,
    title:        t.title,
    due_date:     t.due_date,
    project_id:   t.project_id,
    project_name: nameById.get(t.project_id) ?? '',
    overdue,
  })

  // Date strings compare correctly as ISO text, which also sidesteps the
  // timezone question: a due date is a calendar day, not an instant.
  const overdue  = dated.filter(t => t.due_date <  todayKey).map(t => toDeadline(t, true)).slice(0, DEADLINE_LIMIT)
  const upcoming = dated
    .filter(t => t.due_date >= todayKey && t.due_date <= horizon)
    .map(t => toDeadline(t, false))
    .slice(0, DEADLINE_LIMIT)

  const messages: ClientMessagePreview[] = messageRows.map(m => ({
    id:          m.id,
    title:       m.title,
    project_id:  m.project_id,
    created_at:  m.created_at,
    author_name: m.author?.name ?? 'Someone',
  }))

  return { projects, requests, overdue, upcoming, messages }
}
```

- [ ] **Step 2: Confirm the type names exist**

Run: `grep -n "export type ProjectStatus\|export type TaskStatus\|export type UserRole" src/types/index.ts`
Expected: all three. If any is named differently, use the real name and record it in your report.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit` — expected exit 0. Nothing imports this module yet.
Run: `npm run lint` — expected: only the pre-existing `confirm-dialog.tsx` warning.

- [ ] **Step 4: Commit**

```bash
git add src/components/modules/dashboard/client-data.ts
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Client dashboard data, with explicit column lists

budget and employment_type cannot reach a client payload from here; one task
query serves progress, requests and deadlines.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The screen

**Files:**
- Create: `src/components/modules/dashboard/ClientProjectCard.tsx`
- Create: `src/components/modules/dashboard/ClientDashboard.tsx`
- Modify: `src/app/(portal)/dashboard/page.tsx`

**Interfaces:**
- Consumes: everything from `client-data.ts` (Task 2); `PersonMeta` is **not** used here (it is for rows with a name beside them, not avatar stacks).
- Produces:

```ts
export function ClientProjectCard(props: { project: ClientProjectSummary }): JSX.Element
export async function ClientDashboard(props: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId: string
  userName: string
}): Promise<JSX.Element>
```

- [ ] **Step 1: Write the project card**

Create `src/components/modules/dashboard/ClientProjectCard.tsx`:

```tsx
import Link from 'next/link'
import { Avatar, Badge } from '@/components/ui'
import { formatDateShort, percent } from '@/lib/utils'
import type { ClientProjectSummary } from './client-data'

/**
 * One project on the client dashboard: where it stands, how far along it is,
 * what lands next, and who is on it.
 */
export function ClientProjectCard({ project }: { project: ClientProjectSummary }) {
  const done  = project.doneTasks
  const total = project.totalTasks
  const pct   = total === 0 ? 0 : percent(done, total)

  return (
    <Link
      href={`/projects/${project.id}`}
      className="card block p-4 transition-colors duration-150 hover:bg-bg-surface-2 active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate text-sm font-medium text-primary">{project.name}</h3>
        <Badge status={project.status} />
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-2xs text-tertiary">
          <span>{total === 0 ? 'No tasks yet' : `${done} of ${total} tasks done`}</span>
          {total > 0 && <span>{pct}%</span>}
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-surface-3">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-2xs text-secondary">
          {project.nextDue
            ? <>Next: {project.nextDue.title} · {formatDateShort(project.nextDue.due_date)}</>
            : 'Nothing scheduled'}
        </span>

        {project.team.length > 0 && (
          <span className="flex -space-x-1.5" aria-label="Project team">
            {project.team.slice(0, 4).map(member => (
              <Avatar key={member.id} name={member.name} src={member.avatar_url} size="xs" />
            ))}
            {project.team.length > 4 && (
              <span className="flex size-6 items-center justify-center rounded-full bg-bg-surface-3 text-2xs text-tertiary">
                +{project.team.length - 4}
              </span>
            )}
          </span>
        )}
      </div>
    </Link>
  )
}
```

All three helpers used here were checked against the real files when this plan was written: `percent(part, total)` returns a **number** (already rounded, `0` when total is 0), `formatDateShort(isoString)` returns e.g. `Mar 14`, and `Badge` takes a `status` prop typed `ProjectStatus`. Use them as written; if any disagrees with the code you see, follow the code and record the deviation.

- [ ] **Step 2: Write the dashboard**

Create `src/components/modules/dashboard/ClientDashboard.tsx`:

```tsx
import Link from 'next/link'
import { StatCard } from '@/components/ui'
import { formatDateShort, formatRelative } from '@/lib/utils'
import type { createClient } from '@/lib/supabase/server'
import { dateLabel } from './dashboard-shared'
import { loadClientDashboard } from './client-data'
import { ClientProjectCard } from './ClientProjectCard'

/**
 * CLIENT DASHBOARD
 * ─────────────────────────────────────────────────────────────────────────────
 * What a client sees on sign-in. Before this existed they fell through to the
 * provider dashboard, whose every query filters on the signed-in user as an
 * assignee — so it rendered blank rather than erroring.
 *
 * Read-only: everything links to where the action already lives.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function ClientDashboard({
  supabase,
  userId,
  userName,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId:   string
  userName: string
}) {
  const { projects, requests, overdue, upcoming, messages } =
    await loadClientDashboard(supabase, userId)

  const activeProjects = projects.filter(p =>
    ['in_progress', 'discovery', 'review'].includes(p.status),
  )

  const panelTitle = 'text-sm font-medium text-primary'

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold">
          Welcome, {userName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-xs text-secondary">{dateLabel}</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Active Projects" value={activeProjects.length} />
        <StatCard label="Your Open Requests" value={requests.length} />
        <StatCard
          label="Overdue"
          value={overdue.length}
          valueColor={overdue.length > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* Projects */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className={panelTitle}>Your projects</h2>
          <Link href="/projects" className="text-xs text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">
            View all
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-secondary">
              Your projects will appear here once the team adds you to one.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map(project => (
              <ClientProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>

      {/* Requests + messages */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="border-b border-subtle px-4 py-3">
            <h2 className={panelTitle}>Your requests</h2>
          </div>
          {requests.length === 0 ? (
            <p className="p-6 text-center text-sm text-secondary">
              Nothing open. You can add a request from a project&apos;s to-do list.
            </p>
          ) : (
            <ul>
              {requests.map(request => (
                <li key={request.id} className="border-b border-subtle last:border-b-0">
                  <Link
                    href={`/projects/${request.project_id}?tab=todos`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-bg-surface-2 active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-primary">{request.title}</span>
                      <span className="block truncate text-2xs text-secondary">{request.project_name}</span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-2xs text-tertiary">
                      {request.due_date ? formatDateShort(request.due_date) : 'No date'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-subtle px-4 py-3">
            <h2 className={panelTitle}>Recent messages</h2>
          </div>
          {messages.length === 0 ? (
            <p className="p-6 text-center text-sm text-secondary">
              No messages yet. The team posts updates here.
            </p>
          ) : (
            <ul>
              {messages.map(message => (
                <li key={message.id} className="border-b border-subtle last:border-b-0">
                  <Link
                    href={`/projects/${message.project_id}?tab=messages&message=${message.id}`}
                    className="block px-4 py-2.5 transition-colors duration-150 hover:bg-bg-surface-2 active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                  >
                    <span className="block truncate text-sm text-primary">{message.title}</span>
                    <span className="block truncate text-2xs text-secondary">
                      {message.author_name} · {formatRelative(message.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Deadlines — omitted entirely when there are none */}
      {(overdue.length > 0 || upcoming.length > 0) && (
        <section className="card overflow-hidden">
          <div className="border-b border-subtle px-4 py-3">
            <h2 className={panelTitle}>What&apos;s due</h2>
          </div>
          <ul>
            {[...overdue, ...upcoming].map(item => (
              <li key={item.id} className="border-b border-subtle last:border-b-0">
                <Link
                  href={`/projects/${item.project_id}?tab=todos`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-bg-surface-2 active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-primary">{item.title}</span>
                    <span className="block truncate text-2xs text-secondary">{item.project_name}</span>
                  </span>
                  <span className={`shrink-0 whitespace-nowrap text-2xs ${item.overdue ? 'text-danger' : 'text-tertiary'}`}>
                    {item.overdue ? 'Overdue · ' : ''}{formatDateShort(item.due_date)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Route clients to it**

In `src/app/(portal)/dashboard/page.tsx`, add the import:

```tsx
import { ClientDashboard } from '@/components/modules/dashboard/ClientDashboard'
```

and replace:

```tsx
  if (profile.role === 'admin') {
    return <AdminDashboard supabase={supabase} />
  }

  return (
```

with:

```tsx
  if (profile.role === 'admin') {
    return <AdminDashboard supabase={supabase} />
  }

  if (profile.role === 'client') {
    return (
      <ClientDashboard
        supabase={supabase}
        userId={profile.id}
        userName={profile.name ?? ''}
      />
    )
  }

  return (
```

- [ ] **Step 4: Typecheck, lint, build**

Run: `npx tsc --noEmit` — expected exit 0.
Run: `npm run lint` — expected: only the pre-existing `confirm-dialog.tsx` warning.
Run: `npm run build` — expected success.

- [ ] **Step 5: Confirm no wide select reached the client path**

Run: `grep -n "select('\*')\|select(\"\*\")" src/components/modules/dashboard/*.ts*`
Expected: matches only inside `AdminDashboard.tsx` (admin-only, pre-existing). Any match in `client-data.ts` or `ClientDashboard.tsx` is a defect — fix it before committing.

- [ ] **Step 6: Commit**

```bash
git add src/components/modules/dashboard/ClientProjectCard.tsx src/components/modules/dashboard/ClientDashboard.tsx "src/app/(portal)/dashboard/page.tsx"
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "A dashboard for clients

Projects with progress and team, their own open requests, recent shared
messages and what is due. Replaces the empty provider dashboard a client
used to land on.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Skeleton, docs, verification

**Files:**
- Rewrite: `src/app/(portal)/dashboard/loading.tsx`
- Modify: `CLAUDE.md`
- Modify: `MEMORY.md`

Steps 1–5 are agent work. Step 6 is Matthew's.

- [ ] **Step 1: Reshape the skeleton**

Replace the contents of `src/app/(portal)/dashboard/loading.tsx` with:

```tsx
/**
 * Shaped like the client dashboard — three stat cards, a two-column project
 * grid, then two panels. Clients are the newest and largest group of first
 * paints; the admin and provider layouts are close enough that this does not
 * jump for them either.
 */
export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl animate-pulse">
      <div className="mb-6">
        <div className="h-7 w-48 rounded bg-bg-surface-3" />
        <div className="mt-2 h-3 w-64 rounded bg-bg-surface-3" />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card space-y-3 p-4">
            <div className="h-3 w-20 rounded bg-bg-surface-3" />
            <div className="h-7 w-12 rounded bg-bg-surface-3" />
          </div>
        ))}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card space-y-3 p-4">
            <div className="h-4 w-40 rounded bg-bg-surface-3" />
            <div className="h-1.5 w-full rounded-full bg-bg-surface-3" />
            <div className="flex justify-between">
              <div className="h-3 w-28 rounded bg-bg-surface-3" />
              <div className="h-6 w-16 rounded-full bg-bg-surface-3" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, panel) => (
          <div key={panel} className="card overflow-hidden">
            <div className="border-b border-subtle px-4 py-3">
              <div className="h-4 w-32 rounded bg-bg-surface-3" />
            </div>
            {Array.from({ length: 3 }).map((_, row) => (
              <div key={row} className="flex items-center justify-between gap-3 border-b border-subtle px-4 py-2.5 last:border-b-0">
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-40 rounded bg-bg-surface-3" />
                  <div className="h-3 w-24 rounded bg-bg-surface-3" />
                </div>
                <div className="h-3 w-12 rounded bg-bg-surface-3" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update CLAUDE.md**

- Project structure, under `(portal)/`: change the `dashboard/` line to note it is a role router, and add `modules/dashboard/  AdminDashboard, ProviderDashboard, ClientDashboard, ClientProjectCard, client-data` under `components/modules/`.
- Client portal section: under "Clients can", add that signing in lands them on a dashboard showing their projects with progress and team, their own open requests, recent shared posts and what is due.
- No schema or RLS changes — do not touch the migration log or the RLS summary.

- [ ] **Step 3: Update MEMORY.md**

- `Last synced` → `2026-09-19`.
- Stage status table, Stage 4 row: change from 🟡 Partial to ✅ with a note that the client dashboard shipped, spec `docs/superpowers/specs/2026-09-19-client-dashboard-design.md`, no migration.
- "Not done yet" item 2 (Stage 4): mark it done, keeping the remaining sub-items that are genuinely still open ("Added by client" badge is item 3 and stays).

- [ ] **Step 4: Full check and build**

Run: `npm run check` — expected exit 0, only the pre-existing lint warning.
Run: `npm run build` — expected success.

- [ ] **Step 5: Commit and review agents**

```bash
git add "src/app/(portal)/dashboard/loading.tsx" CLAUDE.md MEMORY.md
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Dashboard skeleton for the client layout, and docs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Then dispatch `rls-security-reviewer` on `client-data.ts` and the dashboard components, and `ui-convention-checker` plus `design-token-auditor` on the three new components and the skeleton. **No `schema-reviewer` — there is no migration.**

Ask the RLS reviewer specifically: can a client see `budget`, `employment_type`, `email`, `phone` or `birthdate` anywhere in this page's payload; can they see a project, task or message they are not entitled to; and does `loadClientDashboard` rely on anything other than the caller's own RLS.

Fix Critical and Important findings before Step 6.

- [ ] **Step 6 (Matthew): Verify on dev, then merge**

**No migration for this one** — nothing to apply, no ordering constraint. Just:

1. Sign in as a client with projects: cards, progress, deadlines and messages all render.
2. Sign in as a client with no projects: the empty state reads as intended.
3. View source as a client: no `budget`, `employment_type`, `email`, `phone` or `birthdate`.
4. Progress matches the project's to-do tab for the same project.
5. A shared message links through and opens; internal posts never appear.
6. The admin and provider dashboards look and behave exactly as before.
7. Phone width: everything stacks, nothing overflows.
