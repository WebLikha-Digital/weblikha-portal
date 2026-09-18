# Client Portal Stage 3 — Message Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only Messages tab into a working project message board — create, edit and delete posts, a default-internal visibility toggle for the team, and a bell + push notification to the team when a client posts.

**Architecture:** Migration 020 carries all authorisation (RLS rewritten with helpers, provider edit/delete-own, a trigger that locks visibility/project/author, and a trigger that creates `client_message` notifications). Server Actions live in a new `projects/message-actions.ts`; push reads the notification rows the trigger created, so recipients are defined once. The UI is two slide-over modals inside `MessagesTab`, opened through `?tab=messages&message=<id>` so notifications deep-link to the exact post.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Supabase Postgres + RLS, `@supabase/ssr`, Tailwind via CSS tokens, lucide-react, web-push via `src/lib/push.ts`.

**Spec:** `docs/superpowers/specs/2026-09-17-message-board-design.md`

## Global Constraints

- **No test framework exists in this repo, by standing decision.** Do not add vitest/jest/playwright or write test files. Each task's gate is `npx tsc --noEmit` exiting 0 plus the task's named check.
- **`npx tsc --noEmit` baseline is zero errors.** Keep it there. `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on.
- **No `any`.** Use `unknown` and narrow. Prefix unused parameters with `_`.
- **Never hardcode colors, sizes or fonts.** Tailwind classes backed by `src/styles/tokens.css` only (e.g. `bg-bg-surface-1`, `text-secondary`, `border-subtle`, `bg-brand`, `text-brand-fg`). `border-[var(--color-border-default)]` and `bg-black/50` are established repo conventions and acceptable.
- **Mobile and desktop classes in the same pass.** Never defer mobile.
- **Every destructive action uses `confirmDialog({...})`** from `@/components/ui/confirm-dialog`. Never native `confirm()`/`alert()`.
- **Every interactive element:** hover, `active:` press cue, `focus-visible:ring`, a pending state that disables it while in flight, and a `toast` outcome.
- **Imports:** UI primitives from the barrel `@/components/ui` (`Button`, `Input`, `Textarea`, `Avatar`, `Badge`). `confirmDialog` and `toast`/`withToast` import directly from their own files.
- **The service-role client (`@/lib/supabase/admin`) must never be imported from a `'use client'` module.**
- **A `'use server'` file may only export async functions.** Constants, types and pure helpers shared with client code go in `src/lib/messages.ts`.
- **Message limits:** title 1–200 characters, body 1–10,000 characters, both after trimming.
- **Visibility:** team members (`admin` and `provider`) get a "Visible to client" toggle, **off by default**. Clients get no toggle; their posts are always shared. Visibility can never change after posting.
- **Every SQL function** pins `set search_path = public, pg_temp`. Migrations are idempotent: `drop … if exists` before every `create`.
- **Commits must be authored `Matthew Kim <weblikhadigital@gmail.com>`** and end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Branch:** `feature/message-board` (already checked out; the spec commit is on it).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/020_message_board.sql` | **Create.** Lock trigger, policies, `notifications.message_id`, client-post notification trigger. |
| `supabase/migrations/014_client_collaboration.sql` | **Modify.** Back-port the membership clause on `messages: client deletes own`. |
| `src/lib/messages.ts` | **Create.** Limits, `messageDraftError`, `isEdited`. Pure; imported by server and client. |
| `src/lib/url-state.ts` | **Create.** `replaceSearchParams` — update query params without a navigation. |
| `src/app/(portal)/projects/message-actions.ts` | **Create.** `createMessage`, `updateMessage`, `deleteMessage`, push fan-out. |
| `src/app/(portal)/projects/[id]/page.tsx` | **Modify.** Narrow the message author embed. |
| `src/types/index.ts` | **Modify.** `AppNotification.message_id`, narrowed `MessageWithAuthor.author`, widened `NotificationWithMeta`. |
| `src/components/modules/projects/ProjectTabsLayout.tsx` | **Modify.** URL-driven tabs; pass role and user id to `MessagesTab`. |
| `src/components/modules/projects/MessageComposeModal.tsx` | **Create.** Create and edit form. |
| `src/components/modules/projects/MessageDetailModal.tsx` | **Create.** Full post view, edit and delete entry points. |
| `src/components/modules/projects/MessagesTab.tsx` | **Rewrite.** Client component: cards, modals, `?message=` handling. |
| `src/components/layout/NotificationsBell.tsx` | **Modify.** `client_message` rendering and routing. |
| `CLAUDE.md`, `MEMORY.md` | **Modify.** Migration log, RLS summary, replaced visibility decision, stage status. |

---

## Task 1: Migration 020 and notification types

**Files:**
- Create: `supabase/migrations/020_message_board.sql`
- Modify: `supabase/migrations/014_client_collaboration.sql` (policy `messages: client deletes own`)
- Modify: `src/types/index.ts` (`AppNotification`)

**Interfaces:**
- Produces: trigger `messages_guard_immutable_columns`; policies `messages: provider edits own`, `messages: provider deletes own`; column `notifications.message_id uuid null`; trigger `messages_notify_client_message` inserting `type = 'client_message'` rows with `message_id` set; TypeScript `AppNotification.message_id: string | null`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/020_message_board.sql`:

```sql
-- =============================================================================
-- WEBLIKHA PORTAL — MESSAGE BOARD
-- Migration: 020_message_board.sql
--
-- Stage 3 of the client portal. Messages already have a table (002), policies
-- (004, 014, 016), an updated_at trigger (002: set_messages_updated_at) and a
-- (project_id, created_at desc) index (002) — none of those are recreated here.
--
--   1. Lock is_client_visible, project_id and author_id after insert, for every
--      role including admin. Visibility is chosen once, at posting.
--   2. Rewrite 004's provider/client policies with the helper functions.
--   3. Providers can edit and delete their own posts (no policy existed).
--   4. Client delete gains is_project_member — revoking a client deletes their
--      project_members rows, so without it a revoked client with a live session
--      could still delete their old posts.
--   5. notifications.message_id, so a notification can point at a post.
--   6. A client's post notifies every approved admin and every approved provider
--      on the project. This trigger is the single source of truth for
--      recipients; the app reads these rows to decide who gets a push.
--
-- Apply with: npx supabase db push --db-url $env:DB_URL   (dev first, then prod)
-- Safe to re-run: every create is preceded by drop … if exists / create or replace.
-- =============================================================================


-- =============================================================================
-- 1. IMMUTABLE COLUMNS
--
-- A WITH CHECK sees only the NEW row, so it cannot express "unchanged". A
-- BEFORE UPDATE trigger compares OLD and NEW directly.
--
-- auth.uid() IS NULL means no end user is behind the statement (service role,
-- SQL Editor maintenance) — allowed, matching 016's guards.
--
-- author_id changing TO NULL is allowed: that is ON DELETE SET NULL firing when
-- the author's users row is deleted. Blocking it would make those users
-- undeletable.
-- =============================================================================

create or replace function public.guard_message_immutable_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.is_client_visible is distinct from old.is_client_visible then
    raise exception 'Message visibility cannot be changed after posting.'
      using errcode = '42501';
  end if;

  if new.project_id is distinct from old.project_id then
    raise exception 'A message cannot be moved to another project.'
      using errcode = '42501';
  end if;

  if new.author_id is distinct from old.author_id and new.author_id is not null then
    raise exception 'A message''s author cannot be changed.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_message_immutable_columns() is
  'Blocks changes to messages.is_client_visible / project_id / author_id after insert, for every role. Allows service-role statements and ON DELETE SET NULL on author_id.';

drop trigger if exists messages_guard_immutable_columns on public.messages;
create trigger messages_guard_immutable_columns
  before update on public.messages
  for each row execute function public.guard_message_immutable_columns();


-- =============================================================================
-- 2. 004 POLICIES REWRITTEN WITH HELPERS (same meaning)
-- =============================================================================

drop policy if exists "messages: provider reads assigned" on public.messages;
create policy "messages: provider reads assigned"
  on public.messages for select
  using (
    public.get_user_role() = 'provider'
    and public.is_project_member(project_id)
  );

drop policy if exists "messages: provider inserts" on public.messages;
create policy "messages: provider inserts"
  on public.messages for insert
  with check (
    public.get_user_role() = 'provider'
    and author_id = auth.uid()
    and public.is_project_member(project_id)
  );

drop policy if exists "messages: client reads visible" on public.messages;
create policy "messages: client reads visible"
  on public.messages for select
  using (
    public.get_user_role() = 'client'
    and is_client_visible = true
    and public.is_project_member(project_id)
  );


-- =============================================================================
-- 3. PROVIDERS EDIT AND DELETE THEIR OWN POSTS
-- =============================================================================

drop policy if exists "messages: provider edits own" on public.messages;
create policy "messages: provider edits own"
  on public.messages for update
  using (
    public.get_user_role() = 'provider'
    and author_id = auth.uid()
    and public.is_project_member(project_id)
  )
  with check (
    public.get_user_role() = 'provider'
    and author_id = auth.uid()
    and public.is_project_member(project_id)
  );

drop policy if exists "messages: provider deletes own" on public.messages;
create policy "messages: provider deletes own"
  on public.messages for delete
  using (
    public.get_user_role() = 'provider'
    and author_id = auth.uid()
    and public.is_project_member(project_id)
  );


-- =============================================================================
-- 4. CLIENT DELETE REQUIRES MEMBERSHIP (backlog #8)
-- Also back-ported into 014's copy so a hand re-run of 014 cannot revert it.
-- =============================================================================

drop policy if exists "messages: client deletes own" on public.messages;
create policy "messages: client deletes own"
  on public.messages for delete
  using (
    public.get_user_role() = 'client'
    and author_id = auth.uid()
    and public.is_project_member(project_id)
  );


-- =============================================================================
-- 5. NOTIFICATIONS CAN POINT AT A MESSAGE
-- on delete cascade: deleting a post removes its notifications.
-- The 'client_message' type is already allowed by 014's check constraint.
-- =============================================================================

alter table public.notifications
  add column if not exists message_id uuid references public.messages(id) on delete cascade;

create index if not exists idx_notifications_message_id
  on public.notifications(message_id);

comment on column public.notifications.message_id is
  'The message a client_message notification refers to. Null for other types.';


-- =============================================================================
-- 6. A CLIENT POST NOTIFIES THE TEAM
--
-- SECURITY DEFINER: the inserting client cannot read other users' rows or write
-- other users' notifications under RLS. Returns nothing but the insert side
-- effect, so the elevated rights expose no data.
-- =============================================================================

create or replace function public.notify_client_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.users u
    where u.id = new.author_id and u.role = 'client'
  ) then
    return new;
  end if;

  insert into public.notifications (user_id, actor_id, type, project_id, message_id)
  select recipients.id, new.author_id, 'client_message', new.project_id, new.id
  from (
    select u.id
    from public.users u
    where u.role = 'admin' and u.approved = true
    union
    select u.id
    from public.project_members pm
    join public.users u on u.id = pm.user_id
    where pm.project_id = new.project_id
      and u.role = 'provider'
      and u.approved = true
  ) recipients
  where recipients.id is distinct from new.author_id;

  return new;
end;
$$;

comment on function public.notify_client_message() is
  'Creates client_message notifications for approved admins and approved project providers when a client posts. Single source of truth for recipients — the app pushes to exactly these rows.';

drop trigger if exists messages_notify_client_message on public.messages;
create trigger messages_notify_client_message
  after insert on public.messages
  for each row execute function public.notify_client_message();


-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
--
-- Manual checks after applying:
--   - As a provider, PATCH is_client_visible on your own post → rejected (42501).
--   - As a provider, edit and delete your own post → succeeds; another provider's → 0 rows.
--   - As a client, post → one client_message row per approved admin and per approved
--     provider on the project; none for the client.
--   - Delete a user who authored a message (service role) → succeeds; author_id becomes null.
-- =============================================================================
```

- [ ] **Step 2: Back-port the membership clause into 014**

In `supabase/migrations/014_client_collaboration.sql`, find:

```sql
create policy "messages: client deletes own"
  on public.messages for delete
  using (
    public.get_user_role() = 'client'
    and author_id = auth.uid()
  );
```

Replace with:

```sql
create policy "messages: client deletes own"
  on public.messages for delete
  using (
    public.get_user_role() = 'client'
    and author_id = auth.uid()
    -- Back-ported from 020. Kept here so a re-run of 014 does not revert it.
    and public.is_project_member(project_id)
  );
```

- [ ] **Step 3: Add `message_id` to the notification type**

In `src/types/index.ts`, find the `AppNotification` interface and replace:

```ts
  comment_id: string | null
  read_at:    string | null
  created_at: string
}
```

with:

```ts
  comment_id: string | null
  message_id: string | null   // Set for client_message notifications (migration 020)
  read_at:    string | null
  created_at: string
}
```

Only change the occurrence inside `AppNotification`; if the same three lines appear elsewhere, edit only this interface.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0, no output. The migration is not applied here — there is no database access. Applying happens in Task 7.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/020_message_board.sql supabase/migrations/014_client_collaboration.sql src/types/index.ts
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Migration 020: message board authorisation and client-post notifications

Locks visibility, project and author after posting for every role; lets
providers edit and delete their own posts; rewrites 004's message policies
with helpers; adds the membership check to client deletes (backlog #8, also
back-ported into 014); adds notifications.message_id and a trigger that
notifies approved admins and project providers when a client posts.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Shared message helpers, Server Actions, author embed

**Files:**
- Create: `src/lib/messages.ts`
- Create: `src/app/(portal)/projects/message-actions.ts`
- Modify: `src/app/(portal)/projects/[id]/page.tsx` (messages query select string)
- Modify: `src/types/index.ts` (`MessageWithAuthor`)

**Interfaces:**
- Consumes: migration 020 behaviour (Task 1); `sendPushToUsers(userIds: string[], payload: { title: string; body: string; url: string }): Promise<void>` from `@/lib/push`; `createAdminClient()` from `@/lib/supabase/admin`.
- Produces:
  - `src/lib/messages.ts`: `MESSAGE_TITLE_MAX = 200`, `MESSAGE_BODY_MAX = 10_000`, `interface MessageDraft { title: string; body: string }`, `messageDraftError(draft: MessageDraft): string | null`, `isEdited(message: { created_at: string; updated_at: string }): boolean`
  - `createMessage(projectId: string, draft: MessageDraft & { isClientVisible: boolean }): Promise<string>` — returns the new message id
  - `updateMessage(messageId: string, projectId: string, draft: MessageDraft): Promise<void>`
  - `deleteMessage(messageId: string, projectId: string): Promise<void>`
  - `MessageWithAuthor.author: Pick<User, 'id' | 'name' | 'avatar_url' | 'role'> | null`

- [ ] **Step 1: Write the shared helpers**

Create `src/lib/messages.ts`:

```ts
/**
 * MESSAGE BOARD — SHARED RULES
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure helpers used by both the Server Actions and the compose modal, so the
 * client validates with exactly the rules the server enforces. In production
 * Next.js redacts the text of errors thrown by Server Actions, so anything a
 * person can fix has to be caught client-side with these first.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const MESSAGE_TITLE_MAX = 200
export const MESSAGE_BODY_MAX  = 10_000

export interface MessageDraft {
  title: string
  body:  string
}

/** Returns a human-readable problem, or null when the draft is valid. */
export function messageDraftError({ title, body }: MessageDraft): string | null {
  const t = title.trim()
  const b = body.trim()
  if (!t) return 'Give the message a title.'
  if (t.length > MESSAGE_TITLE_MAX) return `Titles can be at most ${MESSAGE_TITLE_MAX} characters.`
  if (!b) return 'Write something in the message.'
  if (b.length > MESSAGE_BODY_MAX) return `Messages can be at most ${MESSAGE_BODY_MAX.toLocaleString()} characters.`
  return null
}

/** updated_at equals created_at on insert; migration 002's trigger bumps it on every update. */
export function isEdited(message: { created_at: string; updated_at: string }): boolean {
  return new Date(message.updated_at).getTime() > new Date(message.created_at).getTime()
}
```

- [ ] **Step 2: Write the Server Actions**

Create `src/app/(portal)/projects/message-actions.ts`:

```ts
'use server'
/**
 * MESSAGE BOARD SERVER ACTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Authorisation lives in migration 020's RLS and triggers — these actions do not
 * duplicate it. Two things they must still do:
 *
 *   1. Row-count checks on update/delete. An RLS USING mismatch returns zero
 *      rows WITHOUT an error (only WITH CHECK violations raise), so an
 *      unauthorised edit would otherwise "succeed" and silently revert.
 *   2. Push for client posts. In-app notifications are created by the
 *      notify_client_message trigger; this reads the rows it created and pushes
 *      to exactly those users, so in-app and push recipients cannot drift.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sendPushToUsers } from '@/lib/push'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { messageDraftError, type MessageDraft } from '@/lib/messages'

export async function createMessage(
  projectId: string,
  draft: MessageDraft & { isClientVisible: boolean },
): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const problem = messageDraftError(draft)
  if (problem) throw new Error(problem)

  const { data: profile } = await supabase
    .from('users').select('role, name').eq('id', user.id).single()
  const isClient = profile?.role === 'client'

  const { data: inserted, error } = await supabase
    .from('messages')
    .insert({
      project_id:        projectId,
      author_id:         user.id,
      title:             draft.title.trim(),
      body:              draft.body.trim(),
      // Clients may only post shared. RLS enforces this too; forcing it here
      // turns a would-be policy violation into the intended outcome.
      is_client_visible: isClient ? true : draft.isClientVisible,
    })
    .select('id, title')
    .single()

  if (error || !inserted) throw new Error(error?.message ?? 'Could not post the message.')

  if (isClient) {
    await pushClientMessage(inserted.id, inserted.title, projectId, profile?.name ?? 'A client')
  }

  revalidatePath(`/projects/${projectId}`)
  return inserted.id
}

export async function updateMessage(
  messageId: string,
  projectId: string,
  draft: MessageDraft,
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const problem = messageDraftError(draft)
  if (problem) throw new Error(problem)

  // Visibility is deliberately not a parameter — it is locked after posting.
  const { data, error } = await supabase
    .from('messages')
    .update({ title: draft.title.trim(), body: draft.body.trim() })
    .eq('id', messageId)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('You can only edit your own messages.')

  revalidatePath(`/projects/${projectId}`)
}

export async function deleteMessage(messageId: string, projectId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('You can only delete your own messages.')

  revalidatePath(`/projects/${projectId}`)
}

/**
 * Best-effort: a push failure never fails the post. Uses the service-role client
 * because notification rows are readable only by their owner.
 */
async function pushClientMessage(
  messageId: string,
  title: string,
  projectId: string,
  clientName: string,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from('notifications')
      .select('user_id')
      .eq('message_id', messageId)
    if (error) throw error

    const userIds = (rows ?? []).map((r: { user_id: string }) => r.user_id)
    await sendPushToUsers(userIds, {
      title: `New message from ${clientName}`,
      body:  title,
      url:   `/projects/${projectId}?tab=messages&message=${messageId}`,
    })
  } catch (err) {
    console.error('[push] Failed to notify team of client message:', err)
  }
}
```

- [ ] **Step 3: Narrow the message author type**

In `src/types/index.ts`, replace:

```ts
export interface MessageWithAuthor extends Message {
  author: User | null
}
```

with:

```ts
/** Message with its author — only the fields the board renders. The full users
 *  row carries email and employment_type, which must not reach clients. */
export interface MessageWithAuthor extends Message {
  author: Pick<User, 'id' | 'name' | 'avatar_url' | 'role'> | null
}
```

- [ ] **Step 4: Narrow the author embed in the page query**

In `src/app/(portal)/projects/[id]/page.tsx`, replace:

```ts
    .from('messages')
    .select('*, author: users(*)')
```

with:

```ts
    .from('messages')
    // Explicit columns: users(*) shipped every author's email and
    // employment_type into clients' RSC payload.
    .select('*, author: users(id, name, avatar_url, role)')
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0. If `MessagesTab.tsx` errors on `msg.author` fields, confirm it only reads `name` and `avatar_url` — both are still in the narrowed type.

- [ ] **Step 6: Confirm the service-role client is not reachable from client code**

Run: `grep -rn "message-actions\|supabase/admin" src --include=*.tsx`
Expected: no `'use client'` file imports `@/lib/supabase/admin`. Client components importing `message-actions` is correct — Server Action imports cross the boundary as references, not code.

- [ ] **Step 7: Commit**

```bash
git add src/lib/messages.ts "src/app/(portal)/projects/message-actions.ts" "src/app/(portal)/projects/[id]/page.tsx" src/types/index.ts
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Message board Server Actions and author embed narrowing

createMessage forces clients to shared and pushes to the recipients the
notify_client_message trigger created; update and delete check row counts
because an RLS USING mismatch returns zero rows without an error. The
message author embed now selects only rendered fields — users(*) leaked
email and employment_type to clients.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: URL-driven project tabs

**Files:**
- Create: `src/lib/url-state.ts`
- Modify: `src/components/modules/projects/ProjectTabsLayout.tsx`

**Interfaces:**
- Produces:
  - `replaceSearchParams(update: Record<string, string | null>): void` — `null` deletes a key.
  - `ProjectTabsLayout` renders `<MessagesTab messages projectId currentUserId viewerRole />`.
- Note: Task 5 rewrites `MessagesTab` to accept those props. Until then this task leaves the existing `<MessagesTab messages={messages} />` call unchanged so the build stays green; Task 5 changes the call site.

- [ ] **Step 1: Write the URL helper**

Create `src/lib/url-state.ts`:

```ts
/**
 * Update query params in place without a navigation or server round trip.
 * Next.js 14.1+ syncs window.history.replaceState into useSearchParams, so
 * components reading the params re-render with the new values.
 */
export function replaceSearchParams(update: Record<string, string | null>): void {
  const url = new URL(window.location.href)
  for (const [key, value] of Object.entries(update)) {
    if (value === null) url.searchParams.delete(key)
    else url.searchParams.set(key, value)
  }
  window.history.replaceState(null, '', url)
}
```

- [ ] **Step 2: Make the active tab derive from the URL**

In `src/components/modules/projects/ProjectTabsLayout.tsx`:

Replace the header comment block (lines 2–12) with:

```tsx
/**
 * PROJECT TABS LAYOUT
 * ─────────────────────────────────────────────────────────────────────────────
 * The active tab is DERIVED from ?tab= on every render rather than held in
 * state. That is what lets a notification link (?tab=messages&message=…) switch
 * tabs even when the project page is already open. Tab clicks update the URL
 * with history.replaceState, so switching stays instant and refresh keeps the tab.
 *
 * All tab data is fetched once by the parent Server Component and passed down.
 * ─────────────────────────────────────────────────────────────────────────────
 */
```

Replace:

```tsx
import { useState } from 'react'
import { cn } from '@/lib/utils'
```

with:

```tsx
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { replaceSearchParams } from '@/lib/url-state'
```

Replace:

```tsx
type Tab = 'todos' | 'messages' | 'team'
```

with:

```tsx
type Tab = 'todos' | 'messages' | 'team'

function isTab(value: string | null): value is Tab {
  return value === 'todos' || value === 'messages' || value === 'team'
}
```

Replace:

```tsx
  const [activeTab, setActiveTab] = useState<Tab>('todos')
```

with:

```tsx
  const searchParams = useSearchParams()
  const tabParam     = searchParams.get('tab')
  const activeTab: Tab = isTab(tabParam) ? tabParam : 'todos'
```

Replace the tab `<button>` element:

```tsx
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'shrink-0 whitespace-nowrap px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px',
              activeTab === tab.key
                ? 'text-brand border-brand font-medium'
                : 'text-secondary border-transparent hover:text-primary',
            )}
          >
```

with:

```tsx
          <button
            key={tab.key}
            // Switching tabs closes any open message.
            onClick={() => replaceSearchParams({ tab: tab.key, message: null })}
            aria-current={activeTab === tab.key ? 'page' : undefined}
            className={cn(
              'shrink-0 whitespace-nowrap px-4 py-2.5 text-sm transition-colors duration-150 border-b-2 -mb-px',
              'active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              activeTab === tab.key
                ? 'text-brand border-brand font-medium'
                : 'text-secondary border-transparent hover:text-primary',
            )}
          >
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Manual check (read the code; do not run a dev server)**

Confirm by reading: with `?tab=team` the Team tab renders; with `?tab=nonsense` or no param, To-dos renders; clicking a tab calls `replaceSearchParams` and nothing calls `router.push`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/url-state.ts src/components/modules/projects/ProjectTabsLayout.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Project tabs follow ?tab= in the URL

The tab lived in useState('todos'), so every notification link opened
To-dos regardless of its ?tab= value — the existing links only worked
because To-dos is the default. The tab is now derived from the URL each
render, so a link can switch tabs even while the page is already open.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Compose modal

**Files:**
- Create: `src/components/modules/projects/MessageComposeModal.tsx`

**Interfaces:**
- Consumes: `createMessage`, `updateMessage` (Task 2); `messageDraftError`, `MESSAGE_TITLE_MAX`, `MESSAGE_BODY_MAX` (Task 2); `MessageWithAuthor`, `UserRole` from `@/types`.
- Produces:

```ts
type MessageComposeModalProps =
  | { mode: 'create'; projectId: string; viewerRole: UserRole; onClose: () => void; onPosted: (messageId: string) => void }
  | { mode: 'edit';   projectId: string; viewerRole: UserRole; message: MessageWithAuthor; onClose: () => void; onSaved: () => void }

export function MessageComposeModal(props: MessageComposeModalProps): JSX.Element
```

The parent mounts the component only while it is open; the component does not manage its own visibility.

- [ ] **Step 1: Write the component**

Create `src/components/modules/projects/MessageComposeModal.tsx`:

```tsx
'use client'
/**
 * MESSAGE COMPOSE MODAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Create and edit. Mounted by the parent only while open.
 *
 * Visibility: team members get a "Visible to client" switch, OFF by default, and
 * the submit button names the outcome ("Post internally" / "Post to client") so
 * the setting is visible at the moment of posting. Clients get no switch — their
 * posts are always shared. In edit mode visibility is read-only: migration 020
 * locks it after posting.
 *
 * Validation runs client-side with the same rules as the Server Actions, because
 * production Next.js redacts thrown Server Action messages.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { Button, Input, Textarea } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { createMessage, updateMessage } from '@/app/(portal)/projects/message-actions'
import { MESSAGE_BODY_MAX, MESSAGE_TITLE_MAX, messageDraftError } from '@/lib/messages'
import type { MessageWithAuthor, UserRole } from '@/types'

type MessageComposeModalProps =
  | {
      mode:       'create'
      projectId:  string
      viewerRole: UserRole
      onClose:    () => void
      onPosted:   (messageId: string) => void
    }
  | {
      mode:       'edit'
      projectId:  string
      viewerRole: UserRole
      message:    MessageWithAuthor
      onClose:    () => void
      onSaved:    () => void
    }

export function MessageComposeModal(props: MessageComposeModalProps) {
  const isEdit   = props.mode === 'edit'
  const isClient = props.viewerRole === 'client'

  const [title, setTitle] = useState(props.mode === 'edit' ? props.message.title : '')
  const [body, setBody]   = useState(props.mode === 'edit' ? props.message.body : '')
  const [clientVisible, setClientVisible] = useState(
    props.mode === 'edit' ? props.message.is_client_visible : false,
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const { onClose } = props
  const close = useCallback(() => {
    if (!isPending) onClose()
  }, [isPending, onClose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const problem = messageDraftError({ title, body })
    if (problem) {
      setError(problem)
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        if (props.mode === 'create') {
          const shared = isClient || clientVisible
          const id = await createMessage(props.projectId, {
            title,
            body,
            isClientVisible: shared,
          })
          toast.success(shared ? 'Message posted.' : 'Posted internally.')
          props.onPosted(id)
        } else {
          await updateMessage(props.message.id, props.projectId, { title, body })
          toast.success('Message updated.')
          props.onSaved()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
      }
    })
  }

  const submitLabel = isPending
    ? (isEdit ? 'Saving…' : 'Posting…')
    : isEdit
      ? 'Save changes'
      : isClient
        ? 'Post'
        : clientVisible ? 'Post to client' : 'Post internally'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit message' : 'New message'}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-bg-surface-1 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-subtle">
          <h2 className="text-base font-semibold text-primary">
            {isEdit ? 'Edit message' : 'New message'}
          </h2>
          <button
            onClick={close}
            disabled={isPending}
            className="text-secondary hover:text-primary active:opacity-70 transition-colors duration-150 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <form
          id="message-compose-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5"
        >
          {error && (
            <div
              role="alert"
              className="rounded-md bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger"
            >
              {error}
            </div>
          )}

          <Input
            label="Title"
            id="message-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={MESSAGE_TITLE_MAX}
            disabled={isPending}
            placeholder="e.g. Homepage design is ready for review"
          />

          <Textarea
            label="Message"
            id="message-body"
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={MESSAGE_BODY_MAX}
            disabled={isPending}
            rows={10}
            placeholder="Write your update or question…"
          />

          {/* Visibility */}
          {isEdit ? (
            <div className="rounded-md border border-subtle px-3 py-2.5">
              <p className="text-xs font-medium text-primary">
                {clientVisible ? 'Visible to client' : 'Internal only'}
              </p>
              <p className="text-2xs text-tertiary mt-0.5">
                Visibility can&apos;t be changed after posting.
              </p>
            </div>
          ) : isClient ? (
            <p className="text-2xs text-tertiary">Everyone on this project will see this.</p>
          ) : (
            <div className="flex items-start justify-between gap-4 rounded-md border border-subtle px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-primary">Visible to client</p>
                <p className="text-2xs text-tertiary mt-0.5">
                  {clientVisible
                    ? 'The client will see this post.'
                    : 'Only the agency team will see this post.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={clientVisible}
                aria-label="Visible to client"
                onClick={() => setClientVisible(v => !v)}
                disabled={isPending}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:opacity-80',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  clientVisible ? 'bg-brand' : 'bg-bg-surface-3',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-block size-4 rounded-full bg-bg-base transition-transform duration-150',
                    clientVisible ? 'translate-x-4' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>
          )}
        </form>

        <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-subtle">
          <Button variant="outline" size="md" onClick={close} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="message-compose-form" size="md" loading={isPending}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0. If TypeScript does not narrow `props.message` inside the async transition, it is because `props` was reassigned somewhere — it must not be.

- [ ] **Step 3: Manual check (read the code)**

Confirm: team create mode starts with the switch off and the button reads "Post internally"; toggling flips it to "Post to client"; client create mode shows no switch; edit mode shows visibility read-only; Escape, backdrop, X and Cancel are all inert while `isPending`.

- [ ] **Step 4: Commit**

```bash
git add src/components/modules/projects/MessageComposeModal.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Message compose modal with default-internal visibility switch

The submit button names the outcome — Post internally / Post to client —
because visibility is locked after posting. Clients get no switch.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Detail modal and the working Messages tab

**Files:**
- Create: `src/components/modules/projects/MessageDetailModal.tsx`
- Rewrite: `src/components/modules/projects/MessagesTab.tsx`
- Modify: `src/components/modules/projects/ProjectTabsLayout.tsx` (the `<MessagesTab>` call)

**Interfaces:**
- Consumes: `MessageComposeModal` (Task 4); `deleteMessage` (Task 2); `isEdited` (Task 2); `replaceSearchParams` (Task 3).
- Produces:

```ts
interface MessageDetailModalProps {
  message:       MessageWithAuthor
  projectId:     string
  viewerRole:    UserRole
  currentUserId: string
  onClose:       () => void
  onEdit:        () => void
  onDeleteStart: (messageId: string) => void
}

interface MessagesTabProps {
  messages:      MessageWithAuthor[]
  projectId:     string
  currentUserId: string
  viewerRole:    UserRole
}
```

- [ ] **Step 1: Write the detail modal**

Create `src/components/modules/projects/MessageDetailModal.tsx`:

```tsx
'use client'
/**
 * MESSAGE DETAIL MODAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Full post. Edit and Delete appear for the author or an admin — the same rule
 * migration 020's policies enforce. Delete calls onDeleteStart first so the
 * parent does not mistake the post disappearing from props for a dead link.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useTransition } from 'react'
import { Eye, Lock, Pencil, Trash2, X } from 'lucide-react'
import { Avatar, Button } from '@/components/ui'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import { toast, withToast } from '@/components/ui/toast'
import { formatRelative } from '@/lib/utils'
import { isEdited } from '@/lib/messages'
import { deleteMessage } from '@/app/(portal)/projects/message-actions'
import type { MessageWithAuthor, UserRole } from '@/types'

interface MessageDetailModalProps {
  message:       MessageWithAuthor
  projectId:     string
  viewerRole:    UserRole
  currentUserId: string
  onClose:       () => void
  onEdit:        () => void
  onDeleteStart: (messageId: string) => void
}

export function MessageDetailModal({
  message,
  projectId,
  viewerRole,
  currentUserId,
  onClose,
  onEdit,
  onDeleteStart,
}: MessageDetailModalProps) {
  const [isPending, startTransition] = useTransition()
  const canManage = viewerRole === 'admin' || message.author_id === currentUserId
  const isClient  = viewerRole === 'client'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isPending, onClose])

  async function handleDelete() {
    const ok = await confirmDialog({
      title:        'Delete this message?',
      message:      'It will be removed for everyone on this project.',
      confirmLabel: 'Delete',
    })
    if (!ok) return

    startTransition(async () => {
      await withToast(async () => {
        onDeleteStart(message.id)
        await deleteMessage(message.id, projectId)
        toast.success('Message deleted.')
        onClose()
      }, 'Could not delete the message.')
    })
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={() => { if (!isPending) onClose() }}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={message.title}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-bg-surface-1 shadow-2xl flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-subtle">
          <h2 className="min-w-0 text-base font-semibold text-primary break-words">
            {message.title}
          </h2>
          <button
            onClick={() => { if (!isPending) onClose() }}
            disabled={isPending}
            className="shrink-0 text-secondary hover:text-primary active:opacity-70 transition-colors duration-150 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar
              name={message.author?.name ?? 'Unknown'}
              src={message.author?.avatar_url ?? null}
              size="sm"
            />
            <div className="min-w-0 text-2xs text-tertiary">
              <p className="text-sm text-primary truncate">{message.author?.name ?? 'Unknown'}</p>
              <p>
                Posted {formatRelative(message.created_at)}
                {isEdited(message) && <> · Edited {formatRelative(message.updated_at)}</>}
              </p>
            </div>
          </div>

          {!isClient && (
            message.is_client_visible ? (
              <span className="inline-flex items-center gap-1 text-2xs text-info bg-info/10 px-2 py-0.5 rounded-full">
                <Eye className="size-3" aria-hidden /> Client sees this
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-2xs text-secondary bg-bg-surface-3 px-2 py-0.5 rounded-full">
                <Lock className="size-3" aria-hidden /> Internal only
              </span>
            )
          )}

          <p className="text-sm text-primary leading-relaxed whitespace-pre-wrap break-words">
            {message.body}
          </p>
        </div>

        {canManage && (
          <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-subtle">
            <Button
              variant="ghost"
              size="md"
              icon={<Trash2 className="size-4" />}
              onClick={handleDelete}
              loading={isPending}
              className="text-tertiary hover:text-danger hover:bg-danger/10"
            >
              Delete
            </Button>
            <Button
              variant="outline"
              size="md"
              icon={<Pencil className="size-4" />}
              onClick={onEdit}
              disabled={isPending}
            >
              Edit
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Rewrite the Messages tab**

Replace the entire contents of `src/components/modules/projects/MessagesTab.tsx` with:

```tsx
'use client'
/**
 * MESSAGES TAB
 * ─────────────────────────────────────────────────────────────────────────────
 * Card list plus two modals. The open post lives in ?message=<id> so a
 * notification can deep-link to it.
 *
 * quietIds: ids that may briefly be missing from props for a legitimate reason —
 * just posted (props arrive after revalidation) or being deleted. Without it,
 * the "no longer available" check would fire a false error in both cases.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Eye, MessageSquare, Plus } from 'lucide-react'
import { Avatar, Button } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import { formatRelative } from '@/lib/utils'
import { isEdited } from '@/lib/messages'
import { replaceSearchParams } from '@/lib/url-state'
import { MessageComposeModal } from './MessageComposeModal'
import { MessageDetailModal } from './MessageDetailModal'
import type { MessageWithAuthor, UserRole } from '@/types'

interface MessagesTabProps {
  messages:      MessageWithAuthor[]
  projectId:     string
  currentUserId: string
  viewerRole:    UserRole
}

export function MessagesTab({ messages, projectId, currentUserId, viewerRole }: MessagesTabProps) {
  const searchParams = useSearchParams()
  const openId       = searchParams.get('message')
  const isClient     = viewerRole === 'client'

  const [composing, setComposing] = useState(false)
  const [editing, setEditing]     = useState<MessageWithAuthor | null>(null)
  const quietIds = useRef(new Set<string>())

  const openMessage = openId ? messages.find(m => m.id === openId) ?? null : null

  useEffect(() => {
    if (!openId || openMessage) return
    if (quietIds.current.has(openId)) return
    toast.error('That message is no longer available.')
    replaceSearchParams({ message: null })
  }, [openId, openMessage])

  function openPost(id: string) {
    replaceSearchParams({ tab: 'messages', message: id })
  }

  function closePost() {
    replaceSearchParams({ message: null })
  }

  const newButton = (
    <Button
      variant="outline"
      size="sm"
      icon={<Plus className="size-3.5" />}
      onClick={() => setComposing(true)}
    >
      New message
    </Button>
  )

  return (
    <>
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <MessageSquare className="size-8 text-tertiary mb-3" aria-hidden />
          <p className="text-primary font-medium">No messages yet</p>
          <p className="text-sm text-secondary mt-1 max-w-xs">
            {isClient
              ? 'Ask a question or share an update with the team.'
              : 'Post a milestone update, or share one with the client.'}
          </p>
          <div className="mt-4">{newButton}</div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">{newButton}</div>

          {messages.map(msg => (
            <button
              key={msg.id}
              type="button"
              onClick={() => openPost(msg.id)}
              className="card w-full p-4 text-left transition-colors duration-150 hover:border-[var(--color-border-default)] active:bg-bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <div className="flex items-start gap-3">
                <Avatar
                  name={msg.author?.name ?? 'Unknown'}
                  src={msg.author?.avatar_url ?? null}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="min-w-0 text-sm font-medium text-primary truncate">{msg.title}</h3>
                    {!isClient && msg.is_client_visible && (
                      <span className="shrink-0 flex items-center gap-1 text-2xs text-info bg-info/10 px-2 py-0.5 rounded-full">
                        <Eye className="size-3" aria-hidden /> Client sees this
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-secondary line-clamp-2 leading-relaxed break-words">
                    {msg.body}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 mt-2 text-2xs text-tertiary">
                    <span>{msg.author?.name ?? 'Unknown'}</span>
                    <span aria-hidden>·</span>
                    <span>{formatRelative(msg.created_at)}</span>
                    {isEdited(msg) && (
                      <>
                        <span aria-hidden>·</span>
                        <span>Edited</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {composing && (
        <MessageComposeModal
          mode="create"
          projectId={projectId}
          viewerRole={viewerRole}
          onClose={() => setComposing(false)}
          onPosted={id => {
            quietIds.current.add(id)
            setComposing(false)
            openPost(id)
          }}
        />
      )}

      {editing && (
        <MessageComposeModal
          mode="edit"
          projectId={projectId}
          viewerRole={viewerRole}
          message={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}

      {openMessage && !editing && (
        <MessageDetailModal
          message={openMessage}
          projectId={projectId}
          viewerRole={viewerRole}
          currentUserId={currentUserId}
          onClose={closePost}
          onEdit={() => setEditing(openMessage)}
          onDeleteStart={id => quietIds.current.add(id)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 3: Pass the new props from the tabs layout**

In `src/components/modules/projects/ProjectTabsLayout.tsx`, replace:

```tsx
        <MessagesTab messages={messages} />
```

with:

```tsx
        <MessagesTab
          messages={messages}
          projectId={projectId}
          currentUserId={currentUserId}
          viewerRole={viewerRole}
        />
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: exits 0.

Run: `npm run lint`
Expected: only the pre-existing warning in `src/components/ui/confirm-dialog.tsx` (unused eslint-disable directive). No `react-hooks/exhaustive-deps` warnings in the new files.

- [ ] **Step 5: Manual check (read the code)**

Confirm: a card click sets `?tab=messages&message=<id>`; a posted message's id is added to `quietIds` before `openPost`, and a deleted message's id before `deleteMessage` is awaited; Edit hides the detail modal while the compose modal is open; `canManage` is admin-or-author.

- [ ] **Step 6: Commit**

```bash
git add src/components/modules/projects/MessageDetailModal.tsx src/components/modules/projects/MessagesTab.tsx src/components/modules/projects/ProjectTabsLayout.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Working message board: cards, detail view, edit and delete

The open post lives in ?message=<id> so notifications can deep-link to it.
Just-posted and being-deleted ids are held quiet so the brief gap before
props revalidate is not reported as a dead link.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Notifications bell handles client messages

**Files:**
- Modify: `src/types/index.ts` (`NotificationWithMeta`)
- Modify: `src/components/layout/NotificationsBell.tsx`

**Interfaces:**
- Consumes: `AppNotification.message_id` (Task 1); `notifications.message_id` column (Task 1).
- Produces: `NotificationWithMeta` gains `message: { id: string; title: string } | null` and `project: { id: string; name: string } | null`.

- [ ] **Step 1: Widen the notification type**

In `src/types/index.ts`, replace:

```ts
export interface NotificationWithMeta extends AppNotification {
  actor: Pick<User, 'id' | 'name' | 'avatar_url'> | null
  task:  { id: string; title: string } | null
}
```

with:

```ts
export interface NotificationWithMeta extends AppNotification {
  actor:   Pick<User, 'id' | 'name' | 'avatar_url'> | null
  task:    { id: string; title: string } | null
  message: { id: string; title: string } | null
  /** id and name only — never select budget into a notification. */
  project: { id: string; name: string } | null
}
```

- [ ] **Step 2: Fetch the message and project**

In `src/components/layout/NotificationsBell.tsx`, replace:

```ts
        .select('*, actor:users!notifications_actor_id_fkey(id, name, avatar_url), task:tasks(id, title)')
```

with:

```ts
        .select('*, actor:users!notifications_actor_id_fkey(id, name, avatar_url), task:tasks(id, title), message:messages(id, title), project:projects(id, name)')
```

- [ ] **Step 3: Route by notification type**

Replace:

```ts
    router.push(`/projects/${n.project_id}?tab=todos`)
```

with:

```ts
    router.push(
      n.type === 'client_message' && n.message_id
        ? `/projects/${n.project_id}?tab=messages&message=${n.message_id}`
        : `/projects/${n.project_id}?tab=todos`,
    )
```

- [ ] **Step 4: Describe each type explicitly**

Replace the lucide import line:

```ts
import { Bell, BellRing, CheckCheck, AtSign, ClipboardList } from 'lucide-react'
```

with:

```ts
import { Bell, BellRing, CheckCheck, AtSign, ClipboardList, MessageSquare } from 'lucide-react'
```

Add this function directly above `export function NotificationsBell`:

```tsx
/** Explicit per type, so a new type is never mislabelled as an assignment. */
function describe(n: NotificationWithMeta): { lead: string; subject: string | null } {
  switch (n.type) {
    case 'mention':
      return { lead: ' mentioned you in ', subject: n.task?.title ?? 'a task' }
    case 'task_assigned':
      return { lead: ' assigned you ', subject: n.task?.title ?? 'a task' }
    case 'client_message':
      return {
        lead:    ` posted in ${n.project?.name ?? 'a project'}: `,
        subject: n.message?.title ?? 'a message',
      }
    default:
      return { lead: ` — new activity in ${n.project?.name ?? 'a project'}`, subject: null }
  }
}
```

Replace the fallback icon:

```tsx
                      {n.type === 'mention'
                        ? <AtSign className="size-3" aria-hidden />
                        : <ClipboardList className="size-3" aria-hidden />}
```

with:

```tsx
                      {n.type === 'mention'
                        ? <AtSign className="size-3" aria-hidden />
                        : n.type === 'client_message'
                          ? <MessageSquare className="size-3" aria-hidden />
                          : <ClipboardList className="size-3" aria-hidden />}
```

Replace the text block:

```tsx
                    <span className="block text-xs text-secondary leading-snug">
                      <span className="font-medium text-primary">{n.actor?.name ?? 'Someone'}</span>
                      {n.type === 'mention' ? ' mentioned you in ' : ' assigned you '}
                      <span className="font-medium text-primary">
                        &ldquo;{n.task?.title ?? 'a task'}&rdquo;
                      </span>
                    </span>
```

with:

```tsx
                    <span className="block text-xs text-secondary leading-snug break-words">
                      <span className="font-medium text-primary">{n.actor?.name ?? 'Someone'}</span>
                      {describe(n).lead}
                      {describe(n).subject !== null && (
                        <span className="font-medium text-primary">
                          &ldquo;{describe(n).subject}&rdquo;
                        </span>
                      )}
                    </span>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/components/layout/NotificationsBell.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Notifications bell: client messages open the exact post

Rendering switches on type explicitly — anything that was not a mention
was previously labelled an assignment. client_message links to
?tab=messages&message=<id>. Project embed selects id and name only.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Docs, reviews, apply migration, verify

**Files:**
- Modify: `CLAUDE.md`
- Modify: `MEMORY.md`

This task mixes agent work (steps 1–5) with steps only Matthew can run (steps 6–8), since they need database passwords and a browser.

- [ ] **Step 1: Update CLAUDE.md**

In the migration log block, replace:

```
019 web push subscriptions
```

with:

```
019 web push subscriptions   020 message board (visibility lock, provider edit/delete,
                                 client_message notifications)
```

In the core tables block, replace:

```
notifications       id, user_id, actor_id, type (mention|task_assigned|client_task|
                    client_message), project_id, task_id, comment_id, read_at, created_at
```

with:

```
notifications       id, user_id, actor_id, type (mention|task_assigned|client_task|
                    client_message), project_id, task_id, comment_id, message_id,
                    read_at, created_at
```

In the "Database schema" intro sentence, change the migration range from `019` to `020` (the text reads "Schema is built up across supabase/migrations/001 → 019").

In "RLS summary", replace:

```
- Revenue table: **admin only** — providers and clients never see financial data
```

with:

```
- **Messages:** admins manage all; providers read all posts in their projects and edit or
  delete their own; clients read shared posts only and edit or delete their own. Team
  members choose visibility when posting (default internal); clients always post shared.
  **Visibility, project and author are locked after posting for every role** by a
  trigger (migration 020). A client post notifies approved admins and approved project
  providers via the `notify_client_message` trigger; `projects/message-actions.ts` pushes
  to exactly those notification rows.
- Revenue table: **admin only** — providers and clients never see financial data
```

In the project structure block, replace:

```
│   │   │   └── actions.ts   Server Actions: tasks, comments, messages, members, claim
```

with:

```
│   │   │   ├── actions.ts          Server Actions: tasks, comments, members, claim
│   │   │   └── message-actions.ts  Server Actions: create/update/delete messages + push
```

In the "Client portal" status paragraph, replace `The **message board** and the **client dashboard** are not built.` with `The **message board** is built (Stage 3); the **client dashboard** is not.`

- [ ] **Step 2: Update MEMORY.md**

Set the `Last synced` line near the top to the date the work is done, in `YYYY-MM-DD` form.

In the stage table, replace the Stage 3 row with:

```
| 3 | Message board | ✅ Built on `feature/message-board`: compose/edit/delete, default-internal visibility switch, client posts notify the team, URL deep links |
```

Replace every occurrence of the old visibility decision. In "Stage 3 — the message board does not exist yet", replace the section heading and body with:

```
### Stage 3 — message board

Built. Spec and plan: `docs/superpowers/{specs,plans}/2026-09-17-message-board*`. Posts
only — replies are a later stage. Team members get a "Visible to client" switch, **off by
default**; the submit button reads "Post internally" / "Post to client". Clients have no
switch. Visibility is locked after posting for every role (migration 020 trigger). Client
posts notify approved admins and approved project providers (bell + push). The project
page's tab now follows `?tab=`, and `?message=<id>` opens a post.
```

In "Decisions already made — don't relitigate", replace:

```
- Message visibility is a forced choice per post
```

with:

```
- Message visibility: team toggle **off by default** (replaced "forced choice, no default"
  on 2026-09-17 at Matthew's request); locked after posting; clients always shared
```

In "Not done yet", replace backlog item 1 with:

```
1. ~~**Stage 3 — the message board.**~~ Built 2026-09-17 — see the Stage 3 section above.
   Follow-up stage: replies on messages.
```

Replace backlog item 8 with:

```
8. ~~**`messages: client deletes own`** lacked `is_project_member`~~ — fixed in migration 020
   and back-ported into 014.
```

- [ ] **Step 3: Full check**

Run: `npm run check`
Expected: exits 0; the only lint warning is the pre-existing one in `confirm-dialog.tsx`.

Run: `npm run build`
Expected: succeeds. A `useSearchParams() should be wrapped in a suspense boundary` error would mean the project page became statically rendered — it reads cookies, so it should not; stop and report if it appears.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md MEMORY.md
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Docs: message board built; visibility decision replaced

Records migration 020, message RLS, the default-internal visibility
toggle that replaced the forced-choice decision, and backlog #8 closed.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Review agents**

Dispatch, per CLAUDE.md: `schema-reviewer` and `rls-security-reviewer` on `020_message_board.sql` and `message-actions.ts`; `ui-convention-checker` and `design-token-auditor` on the three message components, `ProjectTabsLayout.tsx` and `NotificationsBell.tsx`. Fix Critical and Important findings before step 6.

- [ ] **Step 6 (Matthew): Apply migration 020 to dev**

Before applying, run this read-only query in the SQL Editor of the target project and expect `0`:

    select count(*) from public.messages
    where char_length(btrim(title)) not between 1 and 200
       or char_length(btrim(body))  not between 1 and 10000;

If it is not 0, stop — those rows need trimming before 020 is applied.

```powershell
$env:DB_URL = Get-Clipboard
$env:DB_URL -replace ':[^:@/]+@', ':***@'
npx supabase migration list --db-url $env:DB_URL
npx supabase db push --db-url $env:DB_URL
npx supabase migration list --db-url $env:DB_URL
Remove-Item Env:DB_URL
```

Expected: the first `migration list` shows only 020 unapplied; the last shows 001–020 matched. The masked URL must show `tydreidoqzndxjftpyzd`.

- [ ] **Step 7 (Matthew): Manual checklist on dev**

1. Provider posts with the switch off → client cannot see it; button read "Post internally".
2. Provider posts with the switch on → client sees it with no badge; team sees "Client sees this".
3. Client posts → every approved admin and every approved provider on the project gets a bell notification and, where subscribed, a push; the client gets neither.
4. With the project page already open, click that notification → Messages tab opens on that exact post.
5. Author edits title/body → "Edited" appears; visibility shows read-only.
6. Provider edits and deletes their own post; no Edit/Delete on another provider's post.
7. Admin edits and deletes any post.
8. As a client, open `?tab=messages&message=<internal post id>` → "That message is no longer available."
9. Revoke a client, then as that client delete an old post via the API → rejected.
10. At 375px width, both modals are full-width with no horizontal scroll.

- [ ] **Step 8 (Matthew): Apply to prod BEFORE merging the PR**

Same commands as step 6 with the prod URL (masked URL must show `vhsuyouczctnkvnnjzgg`). Run the same pre-apply count query against prod first and expect 0. **Apply 020 to prod first, then merge.** The new bell query embeds `messages` through `notifications.message_id`; deployed against a database without 020, that query errors and every user's notification dropdown renders empty. The reverse order is safe: 020 is additive, and the currently deployed code never touches what it adds (the old Messages tab is read-only, and no client-post UI exists to fire the new trigger).

*(Corrected during execution: this step originally said to merge first. The Task 6 review found the empty-bell window.)*
