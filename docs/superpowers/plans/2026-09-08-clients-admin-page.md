# Client Portal Stage 2 — `/clients` Admin Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin-only `/clients` page so clients can be invited, monitored, assigned projects, and revoked — unblocking every later stage of the client portal.

**Architecture:** A Server Component (`page.tsx`) runs the admin guard and four reads, derives each client's status server-side, and hands a flat `ClientRow[]` to a single client component (`ClientList`) that owns all interactivity. Two modals share one `ProjectPicker`. All five mutations are existing Server Actions in `clients/actions.ts`, which this plan does not modify.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Tailwind via CSS tokens, Supabase (`@supabase/ssr` + service role for the auth read), lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-08-clients-admin-page-design.md`

## Global Constraints

- **No test framework exists in this repo.** `npm run check` = `next lint && tsc --noEmit`. There is no vitest/jest/playwright and this plan does not add one. Every task's gate is `npx tsc --noEmit` plus a named manual check.
- **Never hardcode colors, sizes, or font values.** All design values come from `src/styles/tokens.css` via Tailwind classes (`bg-bg-surface-1`, `text-secondary`, `border-subtle`).
- **Mobile and desktop in the same pass.** Every component ships both responsive class sets. Never defer mobile.
- **Every destructive action** uses `confirmDialog({...})` from `@/components/ui/confirm-dialog`. Never native `confirm()`/`alert()`.
- **Every interactive element** gets hover, `focus-visible:ring`, an `active:` press cue, a pending state that disables it in flight, and a `toast` outcome.
- **Import UI primitives from the barrel:** `import { Button, Badge, Avatar } from '@/components/ui'`. `confirmDialog` and `toast` are imported directly from their own files — they are not in the barrel.
- **No `any`.** Use `unknown` and narrow. Prefix unused params with `_`.
- **`tsc --noEmit` baseline is zero errors.** Keep it there.
- **Commit as** `Matthew Kim <weblikhadigital@gmail.com>` — the only verified email on the GitHub account. Vercel blocks deploys from others.
- **Branch:** `feature/clients-admin-page` (already created; the spec commit `4d6a29e` is on it).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/app/(portal)/clients/setup-state.ts` | **Create.** Reads `last_sign_in_at` per client via the service role. Sole reason a service-role import appears outside a Server Action. |
| `src/app/(portal)/clients/page.tsx` | **Create.** Admin guard, four reads, membership grouping, status derivation. No interactivity. |
| `src/app/(portal)/clients/loading.tsx` | **Create.** Skeleton matching the header + card rows. |
| `src/components/modules/clients/ClientList.tsx` | **Create.** `'use client'`. Renders rows, owns optimistic state and modal open/close. |
| `src/components/modules/clients/ProjectPicker.tsx` | **Create.** Presentational checkbox list. No data fetching, no actions — both modals render it. |
| `src/components/modules/clients/ManageProjectsModal.tsx` | **Create.** Wraps `ProjectPicker`, saves via `setClientProjects`. |
| `src/components/modules/clients/InviteClientModal.tsx` | **Create.** Email + name + optional projects, submits `inviteClient`. |
| `src/types/index.ts` | **Modify.** Add `ClientSetupStatus`, `PickerProject`, `ClientRow`. |
| `src/components/layout/sidebar.tsx:37-42` | **Modify.** One `ADMIN_NAV` entry. |
| `src/lib/supabase/admin.ts:1-18` | **Modify.** Widen the header comment to admit Server Components. |

`MobileNav` renders `<Sidebar user={user} />` inside its drawer, so the single `ADMIN_NAV` entry exposes Clients on mobile automatically. `MobileTabBar` is deliberately **not** touched — see the spec.

---

## Task 1: Route, data layer, and nav

**Files:**
- Create: `src/app/(portal)/clients/setup-state.ts`
- Create: `src/app/(portal)/clients/page.tsx`
- Create: `src/app/(portal)/clients/loading.tsx`
- Create: `src/components/modules/clients/ClientList.tsx`
- Modify: `src/types/index.ts`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/lib/supabase/admin.ts`

**Interfaces:**
- Consumes: `createAdminClient()` from `@/lib/supabase/admin`; `createClient()` from `@/lib/supabase/server`; `User`, `Project` from `@/types`.
- Produces:
  - `fetchClientSetupState(userIds: string[]): Promise<Map<string, string | null>>`
  - `type ClientSetupStatus = 'active' | 'invite_pending' | 'revoked'`
  - `type PickerProject = Pick<Project, 'id' | 'name' | 'status'>`
  - `interface ClientRow { user: User; projects: PickerProject[]; status: ClientSetupStatus }`
  - `<ClientList rows={ClientRow[]} allProjects={PickerProject[]} />` — Task 2 adds its actions, Tasks 3–4 add its modals.

- [ ] **Step 1: Add the derived types**

Append to `src/types/index.ts`, after the `ClientProject` block:

```ts
// ── Client admin page (derived, not DB-backed) ────────────────────────────────

/** Where a client is in onboarding. Derived in clients/page.tsx — see
 *  setup-state.ts for why this is read from auth.users rather than stored. */
export type ClientSetupStatus = 'active' | 'invite_pending' | 'revoked'

/** The project shape the assignment pickers need — no budget, no description. */
export type PickerProject = Pick<Project, 'id' | 'name' | 'status'>

/** One row of the /clients table, assembled server-side so the client
 *  component never has to join memberships to projects itself. */
export interface ClientRow {
  user:     User
  projects: PickerProject[]
  status:   ClientSetupStatus
}
```

- [ ] **Step 2: Write the setup-state module**

Create `src/app/(portal)/clients/setup-state.ts`:

```ts
/**
 * CLIENT SETUP STATE (SERVICE ROLE READ)
 * ─────────────────────────────────────────────────────────────────────────────
 * Answers "has this client ever signed in?" — the signal that separates an
 * invite nobody clicked from a live account. `last_sign_in_at` becomes non-null
 * the moment the invite link is exchanged at /auth/callback.
 *
 * WHY THIS IS NOT IN actions.ts: every export in a 'use server' file becomes a
 * callable RPC endpoint. This helper is not something the browser should be
 * able to invoke, so it lives in a plain module imported only by page.tsx.
 *
 * There is no `server-only` package in this repo to enforce that at compile
 * time. Two runtime guards stand in: createAdminClient() throws if called in
 * the browser, and it reads SUPABASE_SERVICE_ROLE_KEY, which has no
 * NEXT_PUBLIC_ prefix and is therefore undefined in a client bundle.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Maps each user id to its `last_sign_in_at`, or null if they have never
 * signed in — or if the lookup failed. Degrading a failed lookup to null is
 * deliberate: it surfaces as "Invite pending", which prompts the admin to
 * resend. The opposite default would quietly claim an account is live.
 */
export async function fetchClientSetupState(
  userIds: string[],
): Promise<Map<string, string | null>> {
  if (userIds.length === 0) return new Map()

  const admin = createAdminClient()

  const entries = await Promise.all(
    userIds.map(async (id): Promise<readonly [string, string | null]> => {
      const { data, error } = await admin.auth.admin.getUserById(id)
      if (error || !data.user) return [id, null] as const
      return [id, data.user.last_sign_in_at ?? null] as const
    }),
  )

  return new Map(entries)
}
```

- [ ] **Step 3: Write the page**

Create `src/app/(portal)/clients/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClientList } from '@/components/modules/clients/ClientList'
import { fetchClientSetupState } from './setup-state'
import type { ClientRow, ClientSetupStatus, PickerProject, User } from '@/types'

export const metadata: Metadata = { title: 'Clients' }

function deriveStatus(
  approved:     boolean,
  lastSignInAt: string | null,
): ClientSetupStatus {
  if (!approved)     return 'revoked'
  if (!lastSignInAt) return 'invite_pending'
  return 'active'
}

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user!.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: clientsRaw } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'client')
    .order('name', { ascending: true })

  const clients = (clientsRaw ?? []) as User[]

  // Every project, including archived ones. Filtering archived here would drop
  // the chip for a client already assigned to one; the picker filters instead.
  const { data: projectsRaw } = await supabase
    .from('projects')
    .select('id, name, status')
    .order('name', { ascending: true })

  const allProjects = (projectsRaw ?? []) as PickerProject[]
  const clientIds   = clients.map(c => c.id)

  const memberships = clientIds.length > 0
    ? (await supabase
        .from('project_members')
        .select('user_id, project_id')
        .in('user_id', clientIds)).data ?? []
    : []

  const setupState = await fetchClientSetupState(clientIds)

  const projectsById = new Map(allProjects.map(p => [p.id, p]))
  const byUser       = new Map<string, PickerProject[]>()

  for (const m of memberships) {
    const project = projectsById.get(m.project_id)
    if (!project) continue
    byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), project])
  }

  const rows: ClientRow[] = clients.map(c => ({
    user:     c,
    projects: byUser.get(c.id) ?? [],
    status:   deriveStatus(c.approved, setupState.get(c.id) ?? null),
  }))

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-semibold text-primary">Clients</h1>
          <p className="text-sm text-secondary mt-1">
            Invite clients, assign them projects, and manage portal access.
          </p>
        </div>
      </div>

      <ClientList rows={rows} allProjects={allProjects} />
    </div>
  )
}
```

- [ ] **Step 4: Write the presentational client list**

Create `src/components/modules/clients/ClientList.tsx`. Tasks 2–4 extend this file; this step is rows and status only.

```tsx
'use client'
/**
 * CLIENT LIST
 * ─────────────────────────────────────────────────────────────────────────────
 * One card per client: name, email, status, assigned-project chips, actions.
 * Cards rather than a table so the same markup works on a phone — the row
 * stacks vertically below sm and lays out horizontally above it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Avatar, Badge } from '@/components/ui'
import type { BadgeProps } from '@/components/ui'
import type { ClientRow, ClientSetupStatus, PickerProject } from '@/types'

interface ClientListProps {
  rows:        ClientRow[]
  allProjects: PickerProject[]
}

const STATUS_META: Record<
  ClientSetupStatus,
  { label: string; variant: BadgeProps['variant'] }
> = {
  active:         { label: 'Active',         variant: 'success' },
  invite_pending: { label: 'Invite pending', variant: 'warning' },
  revoked:        { label: 'Revoked',        variant: 'danger'  },
}

export function ClientList({ rows, allProjects: _allProjects }: ClientListProps) {
  if (rows.length === 0) {
    return (
      <div className="card px-6 py-12 flex flex-col items-center text-center gap-2">
        <p className="text-sm font-medium text-primary">No clients yet</p>
        <p className="text-sm text-secondary max-w-xs">
          Invite a client to give them access to the projects you assign them.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {rows.map(({ user, projects, status }) => {
        const meta = STATUS_META[status]
        return (
          <div
            key={user.id}
            className="card px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Avatar name={user.name} src={user.avatar_url} size="sm" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-primary truncate">{user.name}</p>
                <Badge variant={meta.variant}>{meta.label}</Badge>
              </div>
              <p className="text-2xs text-secondary truncate">{user.email}</p>

              <div className="flex items-center gap-1 flex-wrap mt-1.5">
                {projects.length === 0
                  ? <span className="text-2xs text-tertiary">No projects assigned</span>
                  : projects.map(p => (
                      <span
                        key={p.id}
                        className="text-2xs text-secondary bg-bg-surface-3 px-2 py-0.5 rounded-full"
                      >
                        {p.name}
                      </span>
                    ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: Write the loading skeleton**

Create `src/app/(portal)/clients/loading.tsx`:

```tsx
export default function ClientsLoading() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl animate-pulse">
      <div className="mb-6 space-y-2">
        <div className="h-5 w-20 bg-bg-surface-3 rounded" />
        <div className="h-3 w-72 bg-bg-surface-3 rounded" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="card px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <div className="size-8 rounded-full bg-bg-surface-3 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-32 bg-bg-surface-3 rounded" />
              <div className="h-2.5 w-44 bg-bg-surface-3 rounded" />
              <div className="h-4 w-52 bg-bg-surface-3 rounded-full" />
            </div>
            <div className="h-7 w-32 bg-bg-surface-3 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Add the nav entry**

In `src/components/layout/sidebar.tsx`, add `UserPlus` to the existing `lucide-react` import, then add one entry to `ADMIN_NAV` below Team:

```ts
const ADMIN_NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects',  href: '/projects',  icon: Folder },
  { label: 'Team',      href: '/team',      icon: Users },
  { label: 'Clients',   href: '/clients',   icon: UserPlus },
  { label: 'Revenue',   href: '/revenue',   icon: BarChart3 },
] as const
```

Do **not** touch `MobileTabBar.tsx`. It already carries five tabs; a sixth is too cramped to tap. `MobileNav` renders `<Sidebar>` in its drawer, so mobile gets Clients from this change alone.

- [ ] **Step 7: Widen the admin-client header comment**

In `src/lib/supabase/admin.ts`, replace the line reading
`* Bypasses Row Level Security. Use ONLY in Server Actions and Route Handlers,`
with:

```
 * Bypasses Row Level Security. Use ONLY in Server Actions, Route Handlers, and
 * admin-guarded Server Components (see (portal)/clients/setup-state.ts),
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0, no output. If `noUncheckedIndexedAccess` flags a `Map.get()` result, keep the `?? null` / `?? []` fallbacks rather than asserting non-null.

- [ ] **Step 9: Manual check**

Run `npm run dev`, sign in as admin, open `/clients`.
Expected: Clients appears in the sidebar between Team and Revenue; the page renders one card per client with a status badge, or the empty state if there are none. Narrow the window below `sm` — cards stack and nothing overflows horizontally.

- [ ] **Step 10: Commit**

```bash
git add "src/app/(portal)/clients" src/components/modules/clients src/types/index.ts src/components/layout/sidebar.tsx src/lib/supabase/admin.ts
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Clients page: route, data layer, and nav entry

Reads last_sign_in_at through the service role to tell an unclicked invite
apart from a live account. Clients is a sidebar entry only — the mobile tab
bar is already at five and MobileNav renders the sidebar in its drawer.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Row actions — resend, revoke, restore

**Files:**
- Modify: `src/components/modules/clients/ClientList.tsx`

**Interfaces:**
- Consumes: `ClientRow`, `ClientSetupStatus` from Task 1; `resendClientInvite(userId: string)`, `revokeClientAccess(userId: string)`, `restoreClientAccess(userId: string)` from `@/app/(portal)/clients/actions`; `withToast(action, fallbackMessage)` and `toast` from `@/components/ui/toast`; `confirmDialog(opts)` from `@/components/ui/confirm-dialog`.
- Produces: `ClientList` with working row actions. Tasks 3–4 add modal triggers to the same action bar.

- [ ] **Step 1: Add imports and optimistic state**

Replace the import block at the top of `ClientList.tsx` with:

```tsx
'use client'
import { useOptimistic, useState, useTransition } from 'react'
import { Mail, Ban, RotateCcw } from 'lucide-react'
import { Avatar, Badge, Button } from '@/components/ui'
import type { BadgeProps } from '@/components/ui'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import { toast, withToast } from '@/components/ui/toast'
import {
  resendClientInvite,
  revokeClientAccess,
  restoreClientAccess,
} from '@/app/(portal)/clients/actions'
import type { ClientRow, ClientSetupStatus, PickerProject } from '@/types'
```

- [ ] **Step 2: Add the optimistic reducer inside the component**

Insert at the top of the `ClientList` function body, before the `rows.length === 0` check:

```tsx
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  // Only `status` moves optimistically. Project chips are handled in Task 3.
  const [optimisticRows, patchStatus] = useOptimistic(
    rows,
    (state: ClientRow[], patch: { id: string; status: ClientSetupStatus }) =>
      state.map(r => (r.user.id === patch.id ? { ...r, status: patch.status } : r)),
  )
```

Then change the empty-state check and the `.map` to read from `optimisticRows` instead of `rows`.

- [ ] **Step 3: Add the three handlers**

Insert after the optimistic reducer:

```tsx
  function handleResend(row: ClientRow) {
    setBusyId(row.user.id)
    startTransition(async () => {
      await withToast(
        async () => {
          await resendClientInvite(row.user.id)
          toast.success(`Sent a fresh setup link to ${row.user.email}.`)
        },
        'Could not resend the invite.',
      )
      setBusyId(null)
    })
  }

  async function handleRevoke(row: ClientRow) {
    const count = row.projects.length
    const ok = await confirmDialog({
      title: `Revoke access for ${row.user.name}?`,
      message:
        `They'll be signed out of the portal and removed from ` +
        `${count} assigned project${count === 1 ? '' : 's'}. Restoring them later ` +
        `does not restore project access — you'll need to reassign projects deliberately.`,
      confirmLabel: 'Revoke access',
    })
    if (!ok) return

    setBusyId(row.user.id)
    startTransition(async () => {
      patchStatus({ id: row.user.id, status: 'revoked' })
      await withToast(
        async () => {
          await revokeClientAccess(row.user.id)
          toast.success(`${row.user.name} no longer has portal access.`)
        },
        'Could not revoke access.',
      )
      setBusyId(null)
    })
  }

  function handleRestore(row: ClientRow) {
    setBusyId(row.user.id)
    startTransition(async () => {
      patchStatus({ id: row.user.id, status: 'invite_pending' })
      await withToast(
        async () => {
          await restoreClientAccess(row.user.id)
          toast.success(`${row.user.name} can sign in again. Reassign their projects.`)
        },
        'Could not restore access.',
      )
      setBusyId(null)
    })
  }
```

Note the restore patch targets `invite_pending`, not `active`: `restoreClientAccess` only flips `approved`, and the true status depends on `last_sign_in_at`, which this component does not carry. The server revalidation that follows corrects it either way — the optimistic value just must not overstate access.

- [ ] **Step 4: Add the action bar to the row**

Inside the `.map`, after the closing `</div>` of the `flex-1 min-w-0` block, add:

```tsx
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {status === 'invite_pending' && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Mail className="size-3.5" />}
                  loading={busyId === user.id}
                  onClick={() => handleResend({ user, projects, status })}
                >
                  Resend
                </Button>
              )}
              {status === 'revoked' ? (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<RotateCcw className="size-3.5" />}
                  loading={busyId === user.id}
                  onClick={() => handleRestore({ user, projects, status })}
                >
                  Restore
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Ban className="size-3.5" />}
                  loading={busyId === user.id}
                  onClick={() => handleRevoke({ user, projects, status })}
                  className="text-tertiary hover:text-danger hover:bg-danger/10"
                >
                  Revoke
                </Button>
              )}
            </div>
```

`Button` already carries hover, `focus-visible:ring-brand`, `active:scale`, and a `loading` spinner that disables the button, so no extra interaction styling is needed.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Manual check**

On `/clients`: Revoke opens the styled confirm dialog (not a browser dialog), the copy names the project count and states that restoring does not restore project access, Cancel leaves the row untouched, and confirming flips the badge to Revoked and swaps the button to Restore. Resend shows a spinner and a success toast. Every button is disabled while in flight.

- [ ] **Step 7: Commit**

```bash
git add src/components/modules/clients/ClientList.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Clients page: resend, revoke, and restore row actions

Revoke is gated on confirmDialog and its copy states that restoring does not
restore project access, since revoke deletes project_members rows.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Project picker and the manage-projects modal

**Files:**
- Create: `src/components/modules/clients/ProjectPicker.tsx`
- Create: `src/components/modules/clients/ManageProjectsModal.tsx`
- Modify: `src/components/modules/clients/ClientList.tsx`

**Interfaces:**
- Consumes: `PickerProject` from Task 1; `setClientProjects(userId: string, projectIds: string[])` from `@/app/(portal)/clients/actions`.
- Produces:
  - `<ProjectPicker projects={PickerProject[]} selectedIds={Set<string>} onToggle={(id: string) => void} />`
  - `<ManageProjectsModal row={ClientRow} allProjects={PickerProject[]} onClose={() => void} />`

- [ ] **Step 1: Write the picker**

Create `src/components/modules/clients/ProjectPicker.tsx`:

```tsx
'use client'
/**
 * PROJECT PICKER
 * ─────────────────────────────────────────────────────────────────────────────
 * Presentational multi-select over projects. Holds no state and calls no
 * actions — both the invite modal and the manage modal own their own selection
 * and render this.
 *
 * Archived projects are hidden unless the client is already assigned to one,
 * so an existing assignment is never silently dropped on save.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { cn } from '@/lib/utils'
import { Badge, statusLabel } from '@/components/ui'
import type { PickerProject } from '@/types'

interface ProjectPickerProps {
  projects:    PickerProject[]
  selectedIds: Set<string>
  onToggle:    (id: string) => void
}

export function ProjectPicker({ projects, selectedIds, onToggle }: ProjectPickerProps) {
  const visible = projects.filter(
    p => p.status !== 'archived' || selectedIds.has(p.id),
  )

  if (visible.length === 0) {
    return (
      <p className="text-sm text-secondary py-3">
        No projects available to assign.
      </p>
    )
  }

  return (
    <div
      className="space-y-1 max-h-64 overflow-y-auto rounded-md border border-subtle p-1"
      role="group"
      aria-label="Assign projects"
    >
      {visible.map(project => {
        const selected = selectedIds.has(project.id)
        return (
          <button
            key={project.id}
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={() => onToggle(project.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left',
              'transition-colors duration-150 active:scale-[0.99]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              selected ? 'bg-brand/10' : 'hover:bg-bg-surface-3',
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-primary truncate">{project.name}</p>
            </div>
            <Badge status={project.status}>{statusLabel[project.status]}</Badge>
            <div className={cn(
              'size-4 rounded border flex items-center justify-center shrink-0 transition-colors',
              selected
                ? 'bg-brand border-brand text-brand-fg'
                : 'border-[var(--color-border-default)]',
            )}>
              {selected && (
                <svg viewBox="0 0 10 8" className="size-2.5" aria-hidden>
                  <path
                    d="M1 4l3 3 5-6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Write the manage-projects modal**

Create `src/components/modules/clients/ManageProjectsModal.tsx`:

```tsx
'use client'
/**
 * MANAGE PROJECTS MODAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Slide-over matching NewProjectModal. Saves the full desired set in one call —
 * setClientProjects reconciles adds and removes itself.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui'
import { toast, withToast } from '@/components/ui/toast'
import { setClientProjects } from '@/app/(portal)/clients/actions'
import { ProjectPicker } from './ProjectPicker'
import type { ClientRow, PickerProject } from '@/types'

interface ManageProjectsModalProps {
  row:         ClientRow
  allProjects: PickerProject[]
  onClose:     () => void
}

export function ManageProjectsModal({ row, allProjects, onClose }: ManageProjectsModalProps) {
  const [selectedIds, setSelected] = useState<Set<string>>(
    () => new Set(row.projects.map(p => p.id)),
  )
  const [isPending, startTransition] = useTransition()

  // Escape closes, matching the confirm dialog's behaviour.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSave() {
    startTransition(async () => {
      await withToast(
        async () => {
          await setClientProjects(row.user.id, [...selectedIds])
          toast.success(`Updated ${row.user.name}'s projects.`)
          onClose()
        },
        'Could not update project assignments.',
      )
    })
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Manage projects for ${row.user.name}`}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-bg-surface-1 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-primary truncate">Manage projects</h2>
            <p className="text-2xs text-secondary truncate">{row.user.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <ProjectPicker
            projects={allProjects}
            selectedIds={selectedIds}
            onToggle={toggle}
          />
          <p className="text-2xs text-secondary mt-2">
            {selectedIds.size} project{selectedIds.size === 1 ? '' : 's'} selected
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-subtle">
          <Button variant="outline" size="md" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button size="md" loading={isPending} onClick={handleSave}>
            {isPending ? 'Saving…' : 'Save projects'}
          </Button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 3: Wire the modal into ClientList**

Add to the imports in `ClientList.tsx`:

```tsx
import { FolderCog } from 'lucide-react'
import { ManageProjectsModal } from './ManageProjectsModal'
```

Add state beside `busyId`:

```tsx
  const [managing, setManaging] = useState<ClientRow | null>(null)
```

Add a trigger as the first child of the action bar built in Task 2:

```tsx
              <Button
                size="sm"
                variant="ghost"
                icon={<FolderCog className="size-3.5" />}
                onClick={() => setManaging({ user, projects, status })}
              >
                Manage projects
              </Button>
```

And render the modal just before the closing `</div>` of the outer `space-y-2` wrapper:

```tsx
      {managing && (
        <ManageProjectsModal
          row={managing}
          allProjects={allProjects}
          onClose={() => setManaging(null)}
        />
      )}
```

Finally, rename the `allProjects: _allProjects` parameter back to `allProjects` in the component signature, since it is now used.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Manual check**

Open Manage projects on a client. The already-assigned projects are pre-checked. Toggle two, Save — the toast fires, the panel closes, and the row's chips reflect the new set after revalidation. Escape and the backdrop both close without saving. On a narrow viewport the panel is full-width and the list scrolls internally.

- [ ] **Step 6: Commit**

```bash
git add src/components/modules/clients
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Clients page: project assignment modal

ProjectPicker hides archived projects unless already assigned, so saving never
silently drops an existing membership.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Invite modal

**Files:**
- Create: `src/components/modules/clients/InviteClientModal.tsx`
- Modify: `src/components/modules/clients/ClientList.tsx`
- Modify: `src/app/(portal)/clients/page.tsx`

**Interfaces:**
- Consumes: `ProjectPicker` from Task 3; `inviteClient(formData: FormData)` from `@/app/(portal)/clients/actions`.
- Produces: `<InviteClientModal allProjects={PickerProject[]} />` — self-contained trigger plus panel.

- [ ] **Step 1: Write the invite modal**

Create `src/components/modules/clients/InviteClientModal.tsx`:

```tsx
'use client'
/**
 * INVITE CLIENT MODAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends a Supabase invite that lands the client on /set-password. Projects can
 * be assigned up front; inviteClient reads them from the `projectIds` fields.
 *
 * Errors render inline rather than as a toast: the panel stays open on failure
 * so a mistyped address can be corrected without retyping the whole form.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState, useTransition } from 'react'
import { X, UserPlus } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import { inviteClient } from '@/app/(portal)/clients/actions'
import { ProjectPicker } from './ProjectPicker'
import type { PickerProject } from '@/types'

export function InviteClientModal({ allProjects }: { allProjects: PickerProject[] }) {
  const [open, setOpen]            = useState(false)
  const [selectedIds, setSelected] = useState<Set<string>>(new Set())
  const [error, setError]          = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function close() {
    setOpen(false)
    setError(null)
    setSelected(new Set())
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSubmit(formData: FormData) {
    setError(null)
    selectedIds.forEach(id => formData.append('projectIds', id))
    const email = String(formData.get('email') ?? '')

    startTransition(async () => {
      try {
        await inviteClient(formData)
        toast.success(`Invite sent to ${email}.`)
        close()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not send the invite.')
      }
    })
  }

  return (
    <>
      <Button
        size="md"
        icon={<UserPlus className="size-4" />}
        onClick={() => setOpen(true)}
      >
        Invite client
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={close} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Invite a client"
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-bg-surface-1 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
              <h2 className="text-base font-semibold text-primary">Invite client</h2>
              <button
                onClick={close}
                className="text-secondary hover:text-primary transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <form id="invite-client-form" action={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {error && (
                <div
                  role="alert"
                  className="rounded-md bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger"
                >
                  {error}
                </div>
              )}

              <Input
                label="Client name"
                id="name"
                name="name"
                type="text"
                required
                placeholder="e.g. Jo Santos"
              />

              <Input
                label="Email address"
                id="email"
                name="email"
                type="email"
                required
                placeholder="jo@acmecorp.com"
              />

              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-secondary">Assign projects</p>
                  <p className="text-2xs text-tertiary mt-0.5">
                    Optional — you can assign projects later.
                  </p>
                </div>
                <ProjectPicker
                  projects={allProjects}
                  selectedIds={selectedIds}
                  onToggle={toggle}
                />
              </div>
            </form>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-subtle">
              <Button variant="outline" size="md" onClick={close} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="invite-client-form"
                size="md"
                loading={isPending}
              >
                {isPending ? 'Sending…' : 'Send invite'}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
```

The submit button sits outside the `<form>` in the footer and is bound to it with `form="invite-client-form"`, which is why the form carries an `id`.

- [ ] **Step 2: Mount the trigger in the page header**

In `src/app/(portal)/clients/page.tsx`, add the import:

```tsx
import { InviteClientModal } from '@/components/modules/clients/InviteClientModal'
```

and place it in the header block, as the second child of the `flex items-start justify-between` div:

```tsx
        <InviteClientModal allProjects={allProjects} />
```

- [ ] **Step 3: Point the empty state at the trigger**

In `ClientList.tsx`, the empty state has no way to act, since the trigger lives in the page header. Update its copy:

```tsx
        <p className="text-sm text-secondary max-w-xs">
          Invite a client with the button above to give them access to the
          projects you assign them.
        </p>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Manual check**

Invite a client with an address that already exists — the panel stays open and shows the action's own message ("… already has a provider account in the portal."), not a generic error. Then invite a fresh address with two projects checked: a success toast fires, the panel closes, and a new row appears as **Invite pending** with both project chips.

- [ ] **Step 6: Commit**

```bash
git add src/components/modules/clients "src/app/(portal)/clients/page.tsx"
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Clients page: invite modal with up-front project assignment

Invite errors render inline so the panel stays open and a mistyped address can
be fixed without retyping the form.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Verification pass

**Files:** None created. Fixes land in the files from Tasks 1–4.

- [ ] **Step 1: Run the full check**

Run: `npm run check`
Expected: lint clean, `tsc --noEmit` exits 0. This must run locally on Windows — `next lint` cannot run in the Cowork VM, which holds Windows SWC binaries and has no registry access to fetch Linux ones.

- [ ] **Step 2: Run the convention agents**

Dispatch, per CLAUDE.md: `ui-convention-checker`, `design-token-auditor`, `rls-security-reviewer`.
Expected findings to confirm are absent: hardcoded hex colors, a missing `loading.tsx`, a destructive action without `confirmDialog`, an interactive element with no pending state, or any service-role import reachable from a `'use client'` module.

- [ ] **Step 3: End-to-end invite test**

This is the first real exercise of Stage 1, which has never been run end to end.

1. Invite a real address you control.
2. Confirm the email arrives. If nothing lands, check Supabase → Authentication → SMTP Settings still points at the verified Resend domain — if the sender has reset to `onboarding@resend.dev`, Resend only delivers to the account owner and every invite silently fails.
3. Click through to `/set-password`, set a password, land on `/dashboard`.
4. Reload `/clients` — the row must flip from **Invite pending** to **Active**.
5. Revoke, confirm the row shows **Revoked** and the client's project chips are gone.
6. Restore, then reassign a project via Manage projects.

- [ ] **Step 4: Mobile pass**

At a 375px viewport: cards stack, no horizontal page scroll, both panels are full-width, the picker scrolls internally, and Clients is reachable from the `MobileNav` drawer while `MobileTabBar` still shows its original five tabs.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A src/
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Clients page: review fixes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Update MEMORY.md**

Mark Stage 2 ✅ in the stage table, note that Stage 1 is now tested end to end, and set Stage 3 (message board) as NEXT. Commit with the same author.

---

## Open item, not blocking

Migration 014 is still **dev-only**. It must be applied to prod (`vhsuyouczctnkvnnjzgg`) before any of the client portal ships, along with the prod redirect URLs and the `NEXT_PUBLIC_SITE_URL` / `RESEND_API_KEY` / `RESEND_FROM` Vercel vars. This plan is safe to build and test entirely against dev.
