# Editing Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Only the author may edit a message, reply or task comment, and only for a configurable window after posting (default 15 minutes) — removing the admin power to silently rewrite other people's words.

**Architecture:** Migration 023 adds a single-row `app_settings` table and a `within_edit_window(created_at)` helper, then rewrites the update policies on `messages`, `task_comments` and `message_replies` in terms of it, splitting two `FOR ALL` admin policies into read/insert/delete so no admin update path remains. The portal layout reads the setting once and provides it through a React context, so the three Edit buttons and the Settings card all use the same number.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript strict, Supabase Postgres + RLS, Tailwind via CSS tokens.

**Spec:** `docs/superpowers/specs/2026-09-18-edit-window-design.md`

## Global Constraints

- **No test framework exists in this repo, by standing decision.** Do not add one. Each task's gate is `npx tsc --noEmit` exiting 0 plus its named check.
- **`npx tsc --noEmit` stays at zero errors.** `strict`, `noUncheckedIndexedAccess` and **`exactOptionalPropertyTypes`** are on — an optional prop that may receive `undefined` must be typed `?: T | undefined`.
- **No `any`.** Use `unknown` and narrow, or a typed cast through `unknown` for Supabase results.
- **Never hardcode colors, sizes or fonts in components.** Tailwind token classes only.
- **Mobile and desktop classes in the same pass.**
- **Every destructive action uses `confirmDialog`.** Nothing in this plan is destructive; delete rules are untouched.
- **Every interactive element:** hover, `active:` press cue, `focus-visible:ring`, pending state that disables it in flight, toast outcome.
- **Imports:** primitives from `@/components/ui`; `confirmDialog`, `toast`, `withToast` directly from their files.
- **Service-role client (`@/lib/supabase/admin`) is never imported from a `'use client'` module.** `'use server'` files export only async functions.
- **The window applies to everyone, admins included.** One rule, no role exemption.
- **Deleting is not time-limited.** Authors delete their own whenever; admins delete anything. Do not touch a delete policy.
- **Window bounds: 1–1440 minutes, default 15.** The same bounds are enforced in the database check constraint, in `editWindowError()` and in the Settings input.
- **Every SQL function** pins `set search_path = public, pg_temp`. Migrations idempotent: `drop … if exists` / `create or replace` / `if not exists`.
- **Commits** authored `Matthew Kim <weblikhadigital@gmail.com>`, ending `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Stage files by explicit path; never `git add -A` (untracked `.superpowers/` must not be committed; `tsconfig.tsbuildinfo` stays unstaged).
- **Branch:** create `feature/edit-window` from `main` before Task 1. Migration 023 is applied by Matthew in Task 5, before the branch merges.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/023_edit_window.sql` | **Create.** `app_settings`, `within_edit_window()`, rewritten update policies, split admin `FOR ALL` policies. |
| `src/types/index.ts` | **Modify.** `AppSettings`. |
| `src/lib/messages.ts` | **Modify.** Window bounds, `editWindowError()`, `canEditWithin()`. |
| `src/app/(portal)/projects/message-actions.ts` | **Modify.** `updateMessage` distinguishes "not yours" from "expired". |
| `src/app/(portal)/projects/message-reply-actions.ts` | **Modify.** Same for `updateReply`. |
| `src/app/(portal)/projects/actions.ts` | **Modify.** Same for `updateTaskComment`. |
| `src/app/(portal)/settings/actions.ts` | **Modify.** `updateEditWindow`. |
| `src/components/layout/EditWindowProvider.tsx` | **Create.** Context + `useEditWindow()`. |
| `src/app/(portal)/layout.tsx` | **Modify.** Read the setting, pass it to `PortalShell`. |
| `src/components/layout/PortalShell.tsx` | **Modify.** Wrap children in the provider. |
| `src/components/modules/settings/EditWindowCard.tsx` | **Create.** The admin control. |
| `src/app/(portal)/settings/page.tsx` | **Modify.** Load the setting, render the card. |
| `src/components/modules/projects/MessageDetailModal.tsx` | **Modify.** Gate Edit. |
| `src/components/modules/projects/MessageReplyThread.tsx` | **Modify.** Gate Edit. |
| `src/components/modules/projects/TodoItem.tsx` | **Modify.** Gate comment Edit. |
| `CLAUDE.md`, `MEMORY.md` | **Modify.** Migration log, schema, RLS summary, stage notes. |

---

## Task 1: Migration 023, types and shared rules

**Files:**
- Create: `supabase/migrations/023_edit_window.sql`
- Modify: `src/types/index.ts`
- Modify: `src/lib/messages.ts`

**Interfaces:**
- Produces: table `public.app_settings`; function `public.within_edit_window(timestamptz)`; TypeScript `AppSettings`; and

```ts
// src/lib/messages.ts
export const EDIT_WINDOW_DEFAULT_MINUTES = 15
export const EDIT_WINDOW_MIN_MINUTES = 1
export const EDIT_WINDOW_MAX_MINUTES = 1440
export function editWindowError(minutes: number): string | null
export function canEditWithin(createdAt: string, windowMinutes: number): boolean
```

- [ ] **Step 1: Branch**

```bash
git checkout main
git pull --ff-only
git checkout -b feature/edit-window
```

Expected: `Switched to a new branch 'feature/edit-window'`. Local `main` may be ahead of `origin/main`; that is expected and comes along with the branch.

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/023_edit_window.sql`:

```sql
-- =============================================================================
-- WEBLIKHA PORTAL — EDITING WINDOW
-- Migration: 023_edit_window.sql
--
-- Two problems, one rule: the AUTHOR, and only the author, may edit — and only
-- for a while after posting.
--
--   1. app_settings — one row, one number: how many minutes after posting an
--      author may still edit. Admin-editable, default 15.
--   2. within_edit_window(created_at) — the rule, in one place.
--   3. messages: 004's "messages: admin all" (FOR ALL) let an admin rewrite a
--      client's post. Split into read / insert-own / delete-any: no admin
--      update path remains. The per-role author-update policies collapse into
--      one role-agnostic policy carrying the window.
--   4. task_comments: 008 has the same FOR ALL hole. Same split, and 009's
--      author-update policy gains the window.
--   5. message_replies (022): update policy gains the window.
--
-- Deleting is deliberately NOT time-limited: an author deletes their own
-- whenever, an admin deletes anything. A delete is visible — the row is gone —
-- whereas a late edit rewrites history silently. No delete policy is touched.
--
-- Apply with: npx supabase db push --db-url $env:DB_URL   (dev first, then prod)
-- Safe to re-run.
-- =============================================================================


-- =============================================================================
-- 1. THE SETTING
--
-- One row, forever: `check (id = 1)` makes a second row impossible, so there is
-- never a "which settings row?" question. Single-purpose columns rather than a
-- generic key/value store — a second setting becomes a second column, and keeps
-- its own type, constraint and comment.
-- =============================================================================

create table if not exists public.app_settings (
  id                  smallint     primary key default 1 check (id = 1),
  edit_window_minutes integer      not null default 15,
  updated_at          timestamptz  not null default now()
);

comment on table public.app_settings is
  'Agency-wide portal settings. Exactly one row (id = 1).';
comment on column public.app_settings.edit_window_minutes is
  'Minutes after posting during which an author may still edit their message, reply or task comment. Mirrors EDIT_WINDOW_MIN/MAX_MINUTES in src/lib/messages.ts.';

alter table public.app_settings
  drop constraint if exists app_settings_edit_window_bounds;
alter table public.app_settings
  add constraint app_settings_edit_window_bounds
  check (edit_window_minutes between 1 and 1440);

insert into public.app_settings (id) values (1)
on conflict (id) do nothing;

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

-- Every approved user reads it: the UI needs the number to decide whether to
-- render an Edit button.
drop policy if exists "app_settings: approved read" on public.app_settings;
create policy "app_settings: approved read"
  on public.app_settings for select
  using (public.is_approved_member());

drop policy if exists "app_settings: admin updates" on public.app_settings;
create policy "app_settings: admin updates"
  on public.app_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- No insert or delete policy: the row is created here and is not replaceable.


-- =============================================================================
-- 2. THE RULE
--
-- SECURITY DEFINER so the check never depends on the caller being able to read
-- app_settings — a future tightening of that read policy must not silently
-- disable editing for everyone. Falls back to 15 if the row is somehow missing.
-- =============================================================================

create or replace function public.within_edit_window(created_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select now() < created_at + make_interval(
    mins => coalesce((select s.edit_window_minutes from public.app_settings s where s.id = 1), 15)
  );
$$;

comment on function public.within_edit_window(timestamptz) is
  'True while a row posted at created_at is still editable by its author. Single source of the editing window; used by the update policies on messages, task_comments and message_replies.';


-- =============================================================================
-- 3. MESSAGES
--
-- 004's "messages: admin all" is FOR ALL — that is the policy that let an admin
-- edit a client's post. Replaced by three narrower ones. Admin READ and DELETE
-- are unchanged in effect; only the silent-rewrite power goes away.
-- =============================================================================

drop policy if exists "messages: admin all" on public.messages;

drop policy if exists "messages: admin reads all" on public.messages;
create policy "messages: admin reads all"
  on public.messages for select
  using (public.is_admin());

drop policy if exists "messages: admin inserts own" on public.messages;
create policy "messages: admin inserts own"
  on public.messages for insert
  with check (public.is_admin() and author_id = auth.uid());

drop policy if exists "messages: admin deletes any" on public.messages;
create policy "messages: admin deletes any"
  on public.messages for delete
  using (public.is_admin());

-- One role-agnostic author policy replaces 020's provider and 014's client
-- variants. 020's immutable-columns trigger still blocks is_client_visible,
-- project_id and author_id, so this only ever governs title, body, category
-- and mentions.
drop policy if exists "messages: provider edits own" on public.messages;
drop policy if exists "messages: client edits own"   on public.messages;

drop policy if exists "messages: author updates own in window" on public.messages;
create policy "messages: author updates own in window"
  on public.messages for update
  using (
    author_id = auth.uid()
    and public.within_edit_window(created_at)
  )
  with check (author_id = auth.uid());


-- =============================================================================
-- 4. TASK COMMENTS
-- 008's "task_comments: admin all" is the same FOR ALL hole.
-- =============================================================================

drop policy if exists "task_comments: admin all" on public.task_comments;

drop policy if exists "task_comments: admin reads all" on public.task_comments;
create policy "task_comments: admin reads all"
  on public.task_comments for select
  using (public.is_admin());

drop policy if exists "task_comments: admin inserts own" on public.task_comments;
create policy "task_comments: admin inserts own"
  on public.task_comments for insert
  with check (public.is_admin() and author_id = auth.uid());

drop policy if exists "task_comments: admin deletes any" on public.task_comments;
create policy "task_comments: admin deletes any"
  on public.task_comments for delete
  using (public.is_admin());

drop policy if exists "task_comments: author updates own" on public.task_comments;
create policy "task_comments: author updates own"
  on public.task_comments for update
  using (
    author_id = auth.uid()
    and public.within_edit_window(created_at)
  )
  with check (author_id = auth.uid());


-- =============================================================================
-- 5. MESSAGE REPLIES (022)
-- can_read_message() stays: a reply is still only editable where it is readable.
-- =============================================================================

drop policy if exists "message_replies: update own" on public.message_replies;
create policy "message_replies: update own"
  on public.message_replies for update
  using (
    author_id = auth.uid()
    and public.can_read_message(message_id)
    and public.within_edit_window(created_at)
  )
  with check (
    author_id = auth.uid()
    and public.can_read_message(message_id)
  );


-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
--
-- Note: every row that already exists is older than the window, so nothing
-- created before this migration is editable. That is intended.
--
-- Manual checks after applying:
--   - As admin, PATCH another user's message via PostgREST → 0 rows.
--   - As the author, PATCH your own message posted a minute ago → succeeds.
--   - Set edit_window_minutes to 1, wait, PATCH again → 0 rows.
--   - As a non-admin, PATCH app_settings → rejected.
--   - Admin delete of anyone's message and comment still works.
-- =============================================================================
```

- [ ] **Step 3: Add the type**

In `src/types/index.ts`, directly after the `MessageCategory` interface, add:

```ts
/** Agency-wide portal settings — exactly one row (migration 023). */
export interface AppSettings {
  id:                  number
  edit_window_minutes: number
  updated_at:          string
}
```

- [ ] **Step 4: Add the shared rules**

In `src/lib/messages.ts`, directly after the `CATEGORY_EMOJI_MAX` constant, add:

```ts
// Editing window (migration 023). Mirrors app_settings_edit_window_bounds —
// change them together.
export const EDIT_WINDOW_DEFAULT_MINUTES = 15
export const EDIT_WINDOW_MIN_MINUTES     = 1
export const EDIT_WINDOW_MAX_MINUTES     = 1440
```

and at the end of the file, add:

```ts
/** Returns a human-readable problem with a proposed window, or null. */
export function editWindowError(minutes: number): string | null {
  if (!Number.isInteger(minutes)) return 'Enter a whole number of minutes.'
  if (minutes < EDIT_WINDOW_MIN_MINUTES || minutes > EDIT_WINDOW_MAX_MINUTES) {
    return `The window must be between ${EDIT_WINDOW_MIN_MINUTES} and ${EDIT_WINDOW_MAX_MINUTES} minutes.`
  }
  return null
}

/**
 * Is a row posted at `createdAt` still editable by its author?
 *
 * The browser's clock decides what the UI offers; `within_edit_window()` in the
 * database decides what is allowed. A skewed clock can therefore show an Edit
 * button that fails on save — which the Server Actions report as "The editing
 * window has closed." rather than failing silently.
 */
export function canEditWithin(createdAt: string, windowMinutes: number): boolean {
  const posted = new Date(createdAt).getTime()
  if (Number.isNaN(posted)) return false
  return Date.now() < posted + windowMinutes * 60_000
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0. Nothing consumes the new exports yet.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/023_edit_window.sql src/types/index.ts src/lib/messages.ts
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Migration 023: author-only editing inside a configurable window

Splits the FOR ALL admin policies on messages and task_comments into
read/insert/delete, so no admin update path remains, and puts the window
behind one within_edit_window() helper backed by a single-row app_settings.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Server Actions

**Files:**
- Modify: `src/app/(portal)/projects/message-actions.ts`
- Modify: `src/app/(portal)/projects/message-reply-actions.ts`
- Modify: `src/app/(portal)/projects/actions.ts`
- Modify: `src/app/(portal)/settings/actions.ts`

**Interfaces:**
- Consumes: migration 023's policies (Task 1); `editWindowError` (Task 1).
- Produces:

```ts
// src/app/(portal)/settings/actions.ts
export async function updateEditWindow(minutes: number): Promise<void>
```

- [ ] **Step 1: Message update tells the two failures apart**

In `src/app/(portal)/projects/message-actions.ts`, replace:

```ts
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row) throw new Error('You can only edit your own messages.')
```

with:

```ts
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row) {
    // Zero rows means the RLS USING clause did not match — either it is not
    // yours, or the editing window has closed. Read it back to say which.
    const { data: existing } = await supabase
      .from('messages')
      .select('author_id')
      .eq('id', messageId)
      .maybeSingle()
    throw new Error(
      existing && existing.author_id === user.id
        ? 'The editing window has closed.'
        : 'You can only edit your own messages.',
    )
  }
```

- [ ] **Step 2: Same for replies**

In `src/app/(portal)/projects/message-reply-actions.ts`, replace:

```ts
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('You can only edit your own replies.')
```

with:

```ts
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    // Zero rows: not yours, or out of time. Read it back to say which.
    const { data: existing } = await supabase
      .from('message_replies')
      .select('author_id')
      .eq('id', replyId)
      .maybeSingle()
    throw new Error(
      existing && existing.author_id === user.id
        ? 'The editing window has closed.'
        : 'You can only edit your own replies.',
    )
  }
```

- [ ] **Step 3: Same for task comments**

`updateTaskComment` in `src/app/(portal)/projects/actions.ts` currently only checks `error` — an RLS mismatch silently does nothing, which was already wrong and is now reachable in normal use. Replace:

```ts
  // RLS: only the author (or admin) can update; others match zero rows
  const { error } = await supabase
    .from('task_comments')
    .update({ body: trimmed, mentions })
    .eq('id', commentId)
  if (error) throw new Error(error.message)
```

with:

```ts
  // RLS: only the author, and only inside the editing window (023). A mismatch
  // returns zero rows WITHOUT an error, so check the count and say which.
  const { data, error } = await supabase
    .from('task_comments')
    .update({ body: trimmed, mentions })
    .eq('id', commentId)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error(
      existing && existing.author_id === user.id
        ? 'The editing window has closed.'
        : 'You can only edit your own comments.',
    )
  }
```

The `existing` snapshot read just above this block currently selects `mentions, task_id`. Widen it to include the author:

```ts
  const { data: existing } = await supabase
    .from('task_comments')
    .select('mentions, task_id, author_id')
    .eq('id', commentId)
    .single()
```

- [ ] **Step 4: The settings action**

In `src/app/(portal)/settings/actions.ts`, add at the end of the file:

```ts
/**
 * Sets the agency-wide editing window. RLS restricts this to admins; the
 * row-count check turns a non-admin's silent zero-row update into a real error.
 */
export async function updateEditWindow(minutes: number): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const problem = editWindowError(minutes)
  if (problem) throw new Error(problem)

  const { data, error } = await supabase
    .from('app_settings')
    .update({ edit_window_minutes: minutes })
    .eq('id', 1)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Only admins can change the editing window.')

  revalidatePath('/settings')
  revalidatePath('/projects/[id]', 'page')
}
```

Add `editWindowError` to the file's imports from `@/lib/messages` (create the import line if the file has none), and confirm `redirect` and `revalidatePath` are already imported — they are used by the existing actions in this file.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit` — expected exit 0.
Run: `npm run lint` — expected: only the pre-existing `confirm-dialog.tsx` warning.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(portal)/projects/message-actions.ts" "src/app/(portal)/projects/message-reply-actions.ts" "src/app/(portal)/projects/actions.ts" "src/app/(portal)/settings/actions.ts"
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Say when an edit failed because the window closed

A zero-row update now reports whether the row was not yours or simply out of
time. updateTaskComment gained the row-count check it never had.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The window reaches the components

**Files:**
- Create: `src/components/layout/EditWindowProvider.tsx`
- Modify: `src/app/(portal)/layout.tsx`
- Modify: `src/components/layout/PortalShell.tsx`

**Interfaces:**
- Consumes: `EDIT_WINDOW_DEFAULT_MINUTES` (Task 1).
- Produces:

```ts
export function EditWindowProvider(props: { minutes: number; children: React.ReactNode }): JSX.Element
export function useEditWindow(): number
```

- [ ] **Step 1: Write the provider**

Create `src/components/layout/EditWindowProvider.tsx`:

```tsx
'use client'
/**
 * EDIT WINDOW CONTEXT
 * ─────────────────────────────────────────────────────────────────────────────
 * How many minutes after posting an author may still edit (migration 023).
 * Read once in the portal layout and shared from here, rather than threaded as
 * a prop through project page → tabs layout → tab → card → modal, and again
 * through the todo tree.
 *
 * This only decides what the UI OFFERS. What is allowed is decided by
 * within_edit_window() in the database.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createContext, useContext } from 'react'
import { EDIT_WINDOW_DEFAULT_MINUTES } from '@/lib/messages'

const EditWindowContext = createContext<number>(EDIT_WINDOW_DEFAULT_MINUTES)

interface EditWindowProviderProps {
  minutes:  number
  children: React.ReactNode
}

export function EditWindowProvider({ minutes, children }: EditWindowProviderProps) {
  return (
    <EditWindowContext.Provider value={minutes}>
      {children}
    </EditWindowContext.Provider>
  )
}

/** Minutes an author may still edit. Falls back to the default outside a provider. */
export function useEditWindow(): number {
  return useContext(EditWindowContext)
}
```

- [ ] **Step 2: Read the setting in the layout**

In `src/app/(portal)/layout.tsx`, add to the imports:

```tsx
import { EDIT_WINDOW_DEFAULT_MINUTES } from '@/lib/messages'
```

Then replace:

```tsx
  const user = profile as User

  return <PortalShell user={user}>{children}</PortalShell>
```

with:

```tsx
  const user = profile as User

  // Agency-wide editing window (023). Non-essential to rendering: if it cannot
  // be read, fall back to the default rather than failing every page. The
  // database enforces the real rule either way.
  const { data: settings, error: settingsError } = await supabase
    .from('app_settings')
    .select('edit_window_minutes')
    .eq('id', 1)
    .maybeSingle()
  if (settingsError) {
    console.error('[portal] app_settings fetch failed — using the default window:', settingsError)
  }
  const editWindowMinutes = settings?.edit_window_minutes ?? EDIT_WINDOW_DEFAULT_MINUTES

  return (
    <PortalShell user={user} editWindowMinutes={editWindowMinutes}>
      {children}
    </PortalShell>
  )
```

- [ ] **Step 3: Wrap the shell's children**

In `src/components/layout/PortalShell.tsx`:

Add to the imports:

```tsx
import { EditWindowProvider } from '@/components/layout/EditWindowProvider'
```

Add the prop to `PortalShellProps`:

```tsx
  editWindowMinutes: number
```

and to the destructured parameters: `export function PortalShell({ user, editWindowMinutes, children }: PortalShellProps) {`.

Then replace the bare `{children}` inside `<main>`:

```tsx
        {children}
      </main>
```

with:

```tsx
        <EditWindowProvider minutes={editWindowMinutes}>{children}</EditWindowProvider>
      </main>
```

Do not move `Toaster` or `ConfirmHost`, and do not change `<main>`'s classes — only `{children}` is wrapped.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit` — expected exit 0.
Run: `npm run lint` — expected: only the pre-existing `confirm-dialog.tsx` warning.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/EditWindowProvider.tsx "src/app/(portal)/layout.tsx" src/components/layout/PortalShell.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Share the editing window through the portal shell

Read once in the layout and provided by context, rather than threaded as a
prop through five layers twice over.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: The Settings card and the three Edit buttons

**Files:**
- Create: `src/components/modules/settings/EditWindowCard.tsx`
- Modify: `src/app/(portal)/settings/page.tsx`
- Modify: `src/components/modules/projects/MessageDetailModal.tsx`
- Modify: `src/components/modules/projects/MessageReplyThread.tsx`
- Modify: `src/components/modules/projects/TodoItem.tsx`

**Interfaces:**
- Consumes: `updateEditWindow` (Task 2); `useEditWindow` (Task 3); `canEditWithin`, `editWindowError`, `EDIT_WINDOW_MIN_MINUTES`, `EDIT_WINDOW_MAX_MINUTES` (Task 1).

- [ ] **Step 1: Write the Settings card**

Create `src/components/modules/settings/EditWindowCard.tsx`:

```tsx
'use client'
/**
 * EDITING WINDOW CARD (admins, Settings)
 * ─────────────────────────────────────────────────────────────────────────────
 * One number: how long after posting an author may still edit. The database
 * enforces it (migration 023); this only changes the number.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useTransition } from 'react'
import { Button, Input } from '@/components/ui'
import { toast, withToast } from '@/components/ui/toast'
import {
  EDIT_WINDOW_MAX_MINUTES, EDIT_WINDOW_MIN_MINUTES, editWindowError,
} from '@/lib/messages'
import { updateEditWindow } from '@/app/(portal)/settings/actions'

interface EditWindowCardProps {
  minutes: number
}

export function EditWindowCard({ minutes }: EditWindowCardProps) {
  const [value, setValue] = useState(String(minutes))
  const [isPending, startTransition] = useTransition()

  const parsed  = Number(value)
  const problem = value.trim() === '' ? 'Enter a number of minutes.' : editWindowError(parsed)
  const dirty   = value.trim() !== String(minutes)

  function save() {
    if (problem) {
      toast.error(problem)
      return
    }
    startTransition(async () => {
      await withToast(async () => {
        await updateEditWindow(parsed)
        toast.success('Editing window updated.')
      }, 'Could not update the editing window.')
    })
  }

  return (
    <div className="card p-4 sm:p-5">
      <h3 className="text-sm font-medium text-primary">Editing window</h3>
      <p className="mt-1 text-xs text-secondary">
        How long after posting someone can still edit their own message, reply or comment.
        Deleting is not affected.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Input
            label="Minutes"
            id="edit-window-minutes"
            type="number"
            inputMode="numeric"
            min={EDIT_WINDOW_MIN_MINUTES}
            max={EDIT_WINDOW_MAX_MINUTES}
            value={value}
            onChange={e => setValue(e.target.value)}
            disabled={isPending}
          />
        </div>
        <Button size="md" onClick={save} loading={isPending} disabled={!dirty || problem !== null}>
          Save
        </Button>
      </div>

      {dirty && problem && (
        <p role="alert" className="mt-2 text-2xs text-danger">{problem}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Render it on the Settings page**

In `src/app/(portal)/settings/page.tsx`:

Add to the imports:

```tsx
import { EditWindowCard } from '@/components/modules/settings/EditWindowCard'
import { EDIT_WINDOW_DEFAULT_MINUTES } from '@/lib/messages'
```

After the templates query, add:

```tsx
  const { data: settings } = await supabase
    .from('app_settings')
    .select('edit_window_minutes')
    .eq('id', 1)
    .maybeSingle()
  const editWindowMinutes = settings?.edit_window_minutes ?? EDIT_WINDOW_DEFAULT_MINUTES
```

Then add a section before the templates section in the returned JSX (match the surrounding section markup — the file uses `<section className="mb-10">` with a heading row):

```tsx
      {/* Editing window */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-base font-semibold text-primary">Content</h2>
        </div>
        <EditWindowCard minutes={editWindowMinutes} />
      </section>
```

- [ ] **Step 3: Gate Edit on a message**

In `src/components/modules/projects/MessageDetailModal.tsx`:

Add to the imports:

```tsx
import { canEditWithin, isEdited } from '@/lib/messages'
import { useEditWindow } from '@/components/layout/EditWindowProvider'
```

(replacing the existing `import { isEdited } from '@/lib/messages'` line).

Inside the component, below the existing `canManage` line, add:

```tsx
  const editWindowMinutes = useEditWindow()
  // Only the author, and only inside the window (023). Admins keep Delete.
  const canEdit = message.author_id === currentUserId
    && canEditWithin(message.created_at, editWindowMinutes)
```

Then change the footer so Delete and Edit are gated separately. Replace:

```tsx
        {canManage && (
```

with:

```tsx
        {(canManage || canEdit) && (
```

and wrap the Edit `<Button …>Edit</Button>` element in `{canEdit && ( … )}`. Leave the Delete button gated by `canManage` as it is.

- [ ] **Step 4: Gate Edit on a reply**

In `src/components/modules/projects/MessageReplyThread.tsx`:

Add to the imports:

```tsx
import { canEditWithin, isEdited, replyDraftError } from '@/lib/messages'
import { useEditWindow } from '@/components/layout/EditWindowProvider'
```

(replacing the existing `import { isEdited, replyDraftError } from '@/lib/messages'` line).

Inside the component, next to `const isAdmin = viewerRole === 'admin'`, add:

```tsx
  const editWindowMinutes = useEditWindow()
```

In the `ordered.map(reply => {` body, below `const canDelete = …`, add:

```tsx
          const canEdit   = isAuthor && canEditWithin(reply.created_at, editWindowMinutes)
```

Change the action-row condition from `{canDelete && editingId !== reply.id && (` to:

```tsx
                  {(canDelete || canEdit) && editingId !== reply.id && (
```

and change the Edit button's own guard from `{isAuthor && (` to `{canEdit && (`. Leave Delete gated by `canDelete`.

- [ ] **Step 5: Gate Edit on a task comment**

In `src/components/modules/projects/TodoItem.tsx`:

Add to the imports:

```tsx
import { canEditWithin } from '@/lib/messages'
import { useEditWindow } from '@/components/layout/EditWindowProvider'
```

Inside the component, next to the existing `const isAdmin = viewerRole === 'admin'` line, add:

```tsx
  const editWindowMinutes = useEditWindow()
```

In the comment map, below `const canDelete  = !isTemp && (isAdmin || isAuthor)`, add:

```tsx
            const canEditComment = isAuthor && !isTemp
              && canEditWithin(comment.created_at, editWindowMinutes)
```

Then change the comment's Edit button guard from `{isAuthor && !isTemp && !isEditing && (` to:

```tsx
                    {canEditComment && !isEditing && (
```

Leave the Delete button's `{canDelete && !isEditing && (` guard untouched.

- [ ] **Step 6: Typecheck, lint, build**

Run: `npx tsc --noEmit` — expected exit 0.
Run: `npm run lint` — expected: only the pre-existing `confirm-dialog.tsx` warning.
Run: `npm run build` — expected success.

- [ ] **Step 7: Commit**

```bash
git add src/components/modules/settings/EditWindowCard.tsx "src/app/(portal)/settings/page.tsx" src/components/modules/projects/MessageDetailModal.tsx src/components/modules/projects/MessageReplyThread.tsx src/components/modules/projects/TodoItem.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Show Edit only to the author, only inside the window

Adds the admin control in Settings. An admin now sees Delete and no Edit on
someone else's post, reply or comment.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Docs, verification, apply

**Files:**
- Modify: `CLAUDE.md`
- Modify: `MEMORY.md`

Steps 1–5 are agent work. Steps 6–8 are Matthew's.

- [ ] **Step 1: Update CLAUDE.md**

- Migration log: after the `022 message replies …` entry add `023 editing window (app_settings, within_edit_window, author-only updates)`.
- Database schema intro: change the range `001` → `023`.
- Core tables: add `app_settings        id (always 1), edit_window_minutes, updated_at (agency-wide; admin-editable)`.
- RLS summary: add a bullet — `**Editing:** only the author may edit a message, reply or task comment, and only while within_edit_window(created_at) holds (default 15 minutes, set agency-wide in Settings). Migration 023 removed the FOR ALL admin policies on messages (004) and task_comments (008) that let an admin rewrite other people's words; admins keep read and delete. Deleting is not time-limited.`
- Project structure: under `settings/`, note `EditWindowCard`; under `components/layout/`, add `EditWindowProvider`.

- [ ] **Step 2: Update MEMORY.md**

- `Last synced` → `2026-09-18`.
- Stage 3 section: append `Editing tightened 2026-09-18 (spec docs/superpowers/specs/2026-09-18-edit-window-design.md, migration 023): only the author may edit a post, reply or task comment, and only inside an agency-wide window (default 15 minutes, Settings → Content). Admins lost the FOR ALL write power that let them edit other people's content; they keep delete. Everything posted before 023 is past the window, so it is no longer editable.`
- "What Matthew still has to do": add `Apply 023 to dev, run the checklist, apply to prod, then merge.`

- [ ] **Step 3: Full check and build**

Run: `npm run check` — expected exit 0, only the pre-existing lint warning.
Run: `npm run build` — expected success.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md MEMORY.md
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Docs: editing window and migration 023

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Review agents**

Dispatch `schema-reviewer` and `rls-security-reviewer` on `023_edit_window.sql` and the four changed action files; `ui-convention-checker` and `design-token-auditor` on `EditWindowCard.tsx`, `MessageDetailModal.tsx`, `MessageReplyThread.tsx` and `TodoItem.tsx`.

Ask the RLS reviewer specifically: after splitting the two `FOR ALL` policies, can an admin still read every project's messages and comments, still post their own, and still delete anything; is there any remaining path by which one user can update another's row; does `within_edit_window` behave for a row whose `created_at` is in the future.

Fix Critical and Important findings before Step 6.

- [ ] **Step 6 (Matthew): Apply 023 to dev**

```powershell
$env:DB_URL = Get-Clipboard
$env:DB_URL -replace ':[^:@/]+@', ':***@'
npx supabase migration list --db-url $env:DB_URL
npx supabase db push --db-url $env:DB_URL
npx supabase migration list --db-url $env:DB_URL
Remove-Item Env:DB_URL
```

Expected: masked URL shows `tydreidoqzndxjftpyzd`; the first list shows only 023 unapplied; the last shows 001–023 matched.

- [ ] **Step 7 (Matthew): Manual checklist on dev**

1. As admin, a client's post shows Delete and **no** Edit. Same for a client's task comment and reply.
2. Post a message and edit it straight away — works. Same for a reply and a comment.
3. In Settings → Content, set the window to 1 minute. Wait, reload a project: Edit is gone from your own recent post.
4. Open Edit before expiry, save after it → "The editing window has closed.", and the text does not change.
5. Set it back to 15. A post from 5 minutes ago is editable again by its author.
6. Delete still works at any age: your own as author, anyone's as admin.
7. A provider cannot see Settings at all; the approval queue and templates still work for you.
8. Everything posted before 023 (anything from yesterday) shows no Edit for anyone.

- [ ] **Step 8 (Matthew): Prod, then merge**

Apply 023 with the prod URL (masked URL must show `vhsuyouczctnkvnnjzgg`), then merge the PR. The portal layout reads `app_settings`; without 023 it falls back to the default and logs, but the database would not be enforcing the rule the UI is showing.
