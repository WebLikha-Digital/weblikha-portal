# Message Board Replies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let team members and clients reply to a message board post, in a flat thread that is exactly as visible as the post it hangs under.

**Architecture:** Migration 022 adds `message_replies` plus a `can_read_message()` helper that every reply policy is written in terms of, and two insert triggers that decide notification recipients. The push/email delivery code already in `message-actions.ts` is extracted to a shared server-only module so replies reuse it instead of copying it. The thread renders inside the existing detail modal using the shared `RichTextEditor` / `RichTextBody`.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript strict, Supabase Postgres + RLS, TipTap, DOMPurify, Resend, web-push, Tailwind via CSS tokens.

**Spec:** `docs/superpowers/specs/2026-09-18-message-replies-design.md`

## Global Constraints

- **No test framework exists in this repo, by standing decision.** Do not add one. Each task's gate is `npx tsc --noEmit` exiting 0 plus its named check.
- **`npx tsc --noEmit` stays at zero errors.** `strict`, `noUncheckedIndexedAccess` and **`exactOptionalPropertyTypes`** are on — an optional prop that may receive `undefined` must be typed `?: T | undefined`.
- **No `any`.** Use `unknown` and narrow, or a typed cast through `unknown` for Supabase embed results.
- **Never hardcode colors, sizes or fonts in components.** Tailwind token classes only. `bg-black/50` backdrops and `border-[var(--color-border-default)]` are accepted conventions; inline hex inside **email HTML** is accepted (email clients do not load app CSS).
- **Mobile and desktop classes in the same pass.**
- **Every destructive action uses `confirmDialog`** from `@/components/ui/confirm-dialog`. Never native `confirm()` / `alert()`.
- **Every interactive element:** hover, `active:` press cue, `focus-visible:ring`, pending state that disables it in flight, toast outcome.
- **Imports:** primitives from `@/components/ui`; `confirmDialog`, `toast`, `withToast` directly from their files.
- **Service-role client (`@/lib/supabase/admin`) is never imported from a `'use client'` module.** `'use server'` files export only async functions; shared non-action helpers live in `src/lib/`.
- **Limits:** reply body HTML at most **20,000** characters and not empty once tags are stripped (an `<img>` counts as content); at most **50** mentions, UUIDs, de-duplicated.
- **A reply is exactly as visible as its post.** No per-reply visibility. Clients are never mentionable or notified on an internal post — enforced in the UI and again in the trigger.
- **Every SQL function** pins `set search_path = public, pg_temp`. Migrations are idempotent: `drop … if exists` / `create or replace` / `if not exists`.
- **Commits** authored `Matthew Kim <weblikhadigital@gmail.com>`, ending `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Stage files by explicit path; never `git add -A` (untracked `.superpowers/` must not be committed, and `tsconfig.tsbuildinfo` stays unstaged).
- **Branch:** create `feature/message-replies` from `main` before Task 1. Migration 022 is applied by Matthew in Task 5, before the branch merges.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/022_message_replies.sql` | **Create.** `message_replies` table, `can_read_message()`, RLS, immutable-column guard, `notifications.reply_id`, `message_reply` type, two notify triggers. |
| `src/types/index.ts` | **Modify.** `MessageReply`, `MessageReplyWithAuthor`, `MessageWithAuthor.replies`, `NotificationType` gains `message_reply`, `AppNotification.reply_id`. |
| `src/lib/message-delivery.ts` | **Create.** Server-only delivery helpers shared by post and reply actions: notification-row read, `escapeHtml`, mention email. |
| `src/lib/messages.ts` | **Modify.** `ReplyDraft`, `replyDraftError`, reusing the existing `htmlToText` / `normalizeMentions`. |
| `src/app/(portal)/projects/message-actions.ts` | **Modify.** Use the extracted delivery helpers; behaviour unchanged. |
| `src/app/(portal)/projects/message-reply-actions.ts` | **Create.** `createReply`, `updateReply`, `deleteReply` + delivery. |
| `src/components/modules/projects/MessageReplyThread.tsx` | **Create.** The thread: list, per-reply edit/delete, composer. |
| `src/components/modules/projects/MessageDetailModal.tsx` | **Modify.** Render the thread below the post body. |
| `src/components/modules/projects/MessagesTab.tsx` | **Modify.** Reply count + last-reply time on cards; pass new props to the detail modal. |
| `src/app/(portal)/projects/[id]/page.tsx` | **Modify.** Embed replies with their authors in the messages query. |
| `src/components/layout/NotificationsBell.tsx` | **Modify.** `message_reply` copy, icon and routing. |
| `CLAUDE.md`, `MEMORY.md` | **Modify.** Migration log, schema, structure, stage notes. |

---

## Task 1: Migration 022 and types

**Files:**
- Create: `supabase/migrations/022_message_replies.sql`
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: table `public.message_replies`; function `public.can_read_message(uuid)`; column `notifications.reply_id`; notification type `'message_reply'`; TypeScript `MessageReply`, `MessageReplyWithAuthor`, `MessageWithAuthor.replies`, `AppNotification.reply_id`.

- [ ] **Step 1: Branch**

```bash
git checkout main
git pull --ff-only
git checkout -b feature/message-replies
```

Expected: `Switched to a new branch 'feature/message-replies'`. (Local `main` may be ahead of `origin/main` by two docs commits — that is expected and they come along with the branch.)

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/022_message_replies.sql`:

```sql
-- =============================================================================
-- WEBLIKHA PORTAL — MESSAGE BOARD REPLIES
-- Migration: 022_message_replies.sql
--
-- Stage 3 follow-up. Posts shipped in 020/021 with no way to answer them.
--
--   1. message_replies — a flat thread per post. No nesting, no per-reply
--      visibility: a reply is exactly as visible as the post it hangs under.
--   2. can_read_message(mid) — one helper holding the visibility rule that
--      020's policies express per role. Every reply policy is written in terms
--      of it, so "can read" and "can reply" cannot drift apart.
--   3. Immutable message_id / author_id, mirroring 020's guard on posts.
--   4. notifications.reply_id + type 'message_reply'.
--   5. Two insert triggers: mentions first, then thread participants.
--
-- Apply with: npx supabase db push --db-url $env:DB_URL   (dev first, then prod)
-- Safe to re-run.
-- =============================================================================


-- =============================================================================
-- 1. VISIBILITY HELPER
--
-- Mirrors, in one place, what 020's per-role message policies say:
--   admin                     → every post
--   provider (approved member)→ every post in their projects
--   client   (approved member)→ only is_client_visible posts in their projects
--
-- 020's policies are deliberately NOT rewritten in terms of this helper: they
-- are deployed and working, and rewriting live RLS is a bigger change than
-- replies justify. Both exist; change them together.
--
-- SECURITY DEFINER so the check does not depend on what the caller can read.
-- =============================================================================

create or replace function public.can_read_message(mid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.messages m
    join public.users u on u.id = auth.uid()
    where m.id = mid
      and u.approved = true
      and (
        u.role = 'admin'
        or (
          exists (
            select 1 from public.project_members pm
            where pm.project_id = m.project_id and pm.user_id = u.id
          )
          and (m.is_client_visible or u.role <> 'client')
        )
      )
  );
$$;

comment on function public.can_read_message(uuid) is
  'True when the caller may read this post: approved admin, or approved project member (a client only when the post is client-visible). Reply policies are written in terms of this, so reading and replying cannot drift apart. Mirrors 020''s per-role message policies.';


-- =============================================================================
-- 2. TABLE
-- Deleting a post takes its replies. Deleting a user blanks author_id and keeps
-- the reply, as posts and task comments already behave.
-- =============================================================================

create table if not exists public.message_replies (
  id         uuid        primary key default gen_random_uuid(),
  message_id uuid        not null references public.messages(id) on delete cascade,
  author_id  uuid        references public.users(id) on delete set null,
  body       text        not null,
  mentions   uuid[]      not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.message_replies is
  'Flat reply thread under a message board post. Visibility is inherited from the post — see can_read_message().';

-- Mirrors MESSAGE_BODY_MAX / MESSAGE_MENTIONS_MAX in src/lib/messages.ts; change
-- them together. Emptiness of rich content (<p></p>) is an application rule.
alter table public.message_replies
  drop constraint if exists message_replies_body_length;
alter table public.message_replies
  add constraint message_replies_body_length
  check (char_length(body) between 1 and 20000);

alter table public.message_replies
  drop constraint if exists message_replies_mentions_count;
alter table public.message_replies
  add constraint message_replies_mentions_count
  check (cardinality(mentions) <= 50);

create index if not exists idx_message_replies_message_id
  on public.message_replies (message_id);
create index if not exists idx_message_replies_thread
  on public.message_replies (message_id, created_at);
create index if not exists idx_message_replies_author_id
  on public.message_replies (author_id);

drop trigger if exists message_replies_set_updated_at on public.message_replies;
create trigger message_replies_set_updated_at
  before update on public.message_replies
  for each row execute function public.set_updated_at();


-- =============================================================================
-- 3. IMMUTABLE COLUMNS (mirrors 020 §1)
-- A reply cannot be moved to another post or reattributed. author_id changing
-- TO NULL is allowed: that is ON DELETE SET NULL firing.
-- =============================================================================

create or replace function public.guard_message_reply_immutable_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.message_id is distinct from old.message_id then
    raise exception 'A reply cannot be moved to another message.'
      using errcode = '42501';
  end if;

  if new.author_id is distinct from old.author_id and new.author_id is not null then
    raise exception 'A reply''s author cannot be changed.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists message_replies_guard_immutable_columns on public.message_replies;
create trigger message_replies_guard_immutable_columns
  before update on public.message_replies
  for each row execute function public.guard_message_reply_immutable_columns();


-- =============================================================================
-- 4. RLS
-- Reading and writing use the SAME test. A client on an internal post fails it:
-- select returns zero rows, insert is rejected.
-- =============================================================================

alter table public.message_replies enable row level security;

drop policy if exists "message_replies: read with message" on public.message_replies;
create policy "message_replies: read with message"
  on public.message_replies for select
  using (public.can_read_message(message_id));

drop policy if exists "message_replies: insert own" on public.message_replies;
create policy "message_replies: insert own"
  on public.message_replies for insert
  with check (
    author_id = auth.uid()
    and public.can_read_message(message_id)
  );

drop policy if exists "message_replies: update own" on public.message_replies;
create policy "message_replies: update own"
  on public.message_replies for update
  using (
    author_id = auth.uid()
    and public.can_read_message(message_id)
  )
  with check (
    author_id = auth.uid()
    and public.can_read_message(message_id)
  );

drop policy if exists "message_replies: delete own" on public.message_replies;
create policy "message_replies: delete own"
  on public.message_replies for delete
  using (
    author_id = auth.uid()
    and public.can_read_message(message_id)
  );

drop policy if exists "message_replies: admin deletes any" on public.message_replies;
create policy "message_replies: admin deletes any"
  on public.message_replies for delete
  using (public.is_admin());


-- =============================================================================
-- 5. NOTIFICATIONS
--
-- reply_id scopes de-duplication. Without it, "has this user already been
-- notified about this message?" would match rows from EARLIER replies and
-- silently swallow the new one.
-- =============================================================================

alter table public.notifications
  add column if not exists reply_id uuid
  references public.message_replies(id) on delete cascade;

create index if not exists idx_notifications_reply_id
  on public.notifications (reply_id);

-- Widening an allow-list: existing rows already satisfy it, so NOT VALID keeps
-- this off the ACCESS EXCLUSIVE validation path on a high-write table.
alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('mention', 'task_assigned', 'client_task', 'client_message', 'message_mention', 'message_reply'))
  not valid;


-- =============================================================================
-- 6. MENTION NOTIFICATIONS ON A REPLY
--
-- Same recipient rule as 021's post mentions: not the author, approved, admin
-- or member of the post's project, and never a client when the post is
-- internal. Type 'message_mention', so existing bell/push/email copy applies.
--
-- Fires on INSERT only. Editing a reply notifies nobody, including for a newly
-- added mention — a deliberate simplification over posts.
-- =============================================================================

create or replace function public.notify_message_reply_mentions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid;
  v_message record;
begin
  select m.project_id, m.is_client_visible into v_message
  from public.messages m where m.id = new.message_id;

  foreach v_uid in array coalesce(new.mentions, '{}') loop
    if v_uid is not distinct from new.author_id then
      continue;
    end if;

    if not exists (
      select 1
      from public.users u
      where u.id = v_uid
        and u.approved = true
        and (
          u.role = 'admin'
          or exists (
            select 1 from public.project_members pm
            where pm.project_id = v_message.project_id and pm.user_id = v_uid
          )
        )
        and (v_message.is_client_visible or u.role <> 'client')
    ) then
      continue;
    end if;

    if exists (
      select 1 from public.notifications n
      where n.user_id = v_uid and n.reply_id = new.id
    ) then
      continue;
    end if;

    insert into public.notifications (user_id, actor_id, type, project_id, message_id, reply_id)
    values (v_uid, new.author_id, 'message_mention', v_message.project_id, new.message_id, new.id);
  end loop;

  return new;
end;
$$;

drop trigger if exists message_replies_notify_mentions on public.message_replies;
create trigger message_replies_notify_mentions
  after insert on public.message_replies
  for each row execute function public.notify_message_reply_mentions();


-- =============================================================================
-- 7. THREAD NOTIFICATIONS
--
-- The post's author plus everyone who already replied, minus the replier, minus
-- anyone the mention trigger just notified for THIS reply.
--
-- Trigger order matters: Postgres fires same-event triggers in NAME order, so
-- message_replies_notify_mentions ('m') runs before …_notify_thread ('t') and
-- its rows are visible to the check below. A mention wins over a generic "new
-- reply" — one notification each, with the more specific wording. RENAMING
-- EITHER TRIGGER SILENTLY REINTRODUCES DUPLICATES. (021 carries the same
-- dependency between its client-message and mention triggers.)
-- =============================================================================

create or replace function public.notify_message_reply_thread()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_message record;
begin
  select m.project_id, m.is_client_visible, m.author_id into v_message
  from public.messages m where m.id = new.message_id;

  insert into public.notifications (user_id, actor_id, type, project_id, message_id, reply_id)
  select u.id, new.author_id, 'message_reply', v_message.project_id, new.message_id, new.id
  from public.users u
  where u.approved = true
    and u.id is distinct from new.author_id
    and (v_message.is_client_visible or u.role <> 'client')
    and (
      u.role = 'admin'
      or exists (
        select 1 from public.project_members pm
        where pm.project_id = v_message.project_id and pm.user_id = u.id
      )
    )
    and (
      u.id = v_message.author_id
      or exists (
        select 1 from public.message_replies r
        where r.message_id = new.message_id
          and r.id <> new.id
          and r.author_id = u.id
      )
    )
    and not exists (
      select 1 from public.notifications n
      where n.user_id = u.id and n.reply_id = new.id
    );

  return new;
end;
$$;

comment on function public.notify_message_reply_thread() is
  'Notifies the post author and earlier repliers when a reply lands. Skips the replier and anyone already notified for this reply (mentions run first, by trigger name order). Single source of truth for recipients — the app pushes to exactly these rows.';

drop trigger if exists message_replies_notify_thread on public.message_replies;
create trigger message_replies_notify_thread
  after insert on public.message_replies
  for each row execute function public.notify_message_reply_thread();


-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
--
-- Manual checks after applying:
--   - As a client, select from message_replies for an internal post → 0 rows.
--   - Insert a reply as a client on an internal post via the API → rejected.
--   - Reply to your own post → no notification for yourself.
--   - Mention someone who also replied earlier → exactly one row, message_mention.
--   - Delete the post → its replies and their notifications go too.
-- =============================================================================
```

- [ ] **Step 3: Update the types**

In `src/types/index.ts`, directly after the `MessageCategory` interface, add:

```ts
/** A reply on a message board post (migration 022). Flat — no nesting. */
export interface MessageReply {
  id:         string
  message_id: string
  author_id:  string | null
  body:       string          // Rich-text HTML
  mentions:   string[]
  created_at: string
  updated_at: string
}
```

Directly after the `MessageWithAuthor` interface, add:

```ts
/** A reply joined with its author, as the project page loads it. */
export interface MessageReplyWithAuthor extends MessageReply {
  author: Pick<User, 'id' | 'name' | 'avatar_url' | 'role'> | null
}
```

Then extend `MessageWithAuthor` itself:

```ts
export interface MessageWithAuthor extends Message {
  author:   Pick<User, 'id' | 'name' | 'avatar_url' | 'role'> | null
  category: Pick<MessageCategory, 'id' | 'name' | 'emoji' | 'archived_at'> | null
  replies:  MessageReplyWithAuthor[]
}
```

Add `'message_reply'` to `NotificationType`:

```ts
export type NotificationType =
  | 'mention'
  | 'task_assigned'
  | 'client_task'
  | 'client_message'
  | 'message_mention'
  | 'message_reply'
```

And add `reply_id` to `AppNotification`, directly below its `message_id` field:

```ts
  reply_id:   string | null
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`

Expected: **errors are expected here** — adding the required `replies` field to `MessageWithAuthor` breaks `src/app/(portal)/projects/[id]/page.tsx`, which does not select it yet. Note the exact errors in your report; Task 4 fixes them. If errors appear anywhere other than that page, stop and report them.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/022_message_replies.sql src/types/index.ts
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Migration 022: message board replies

A flat reply thread per post, with visibility inherited through a single
can_read_message() helper so reading and replying cannot drift apart.
Notifications carry reply_id, which scopes de-duplication between the
mention and thread triggers.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Shared delivery helpers, reply rules and Server Actions

**Files:**
- Create: `src/lib/message-delivery.ts`
- Modify: `src/lib/messages.ts`
- Modify: `src/app/(portal)/projects/message-actions.ts`
- Create: `src/app/(portal)/projects/message-reply-actions.ts`

**Interfaces:**
- Consumes: migration 022's table and triggers (Task 1); `sendPushToUsers` from `@/lib/push`; `getSiteUrl` from `@/lib/site-url`; `createAdminClient` from `@/lib/supabase/admin`.
- Produces:

```ts
// src/lib/message-delivery.ts
export type AdminClient = ReturnType<typeof createAdminClient>
export interface NotificationRow { user_id: string; type: string; actor: { name: string } | null }
export async function readNotificationRows(
  admin: AdminClient,
  column: 'message_id' | 'reply_id',
  id: string,
  writtenAt: string,
): Promise<NotificationRow[]>
export function escapeHtml(value: string): string
export async function emailMentions(
  admin: AdminClient,
  userIds: string[],
  content: { actorName: string; subject: string; heading: string; line: string; path: string },
): Promise<void>

// src/lib/messages.ts (additions)
export interface ReplyDraft { bodyHtml: string; mentions: string[] }
export function replyDraftError(draft: ReplyDraft): string | null

// src/app/(portal)/projects/message-reply-actions.ts
export async function createReply(messageId: string, projectId: string, draft: ReplyDraft): Promise<string>
export async function updateReply(replyId: string, projectId: string, draft: ReplyDraft): Promise<void>
export async function deleteReply(replyId: string, projectId: string): Promise<void>
```

- [ ] **Step 1: Extract the delivery helpers**

Create `src/lib/message-delivery.ts`:

```ts
import 'server-only'
import { Resend } from 'resend'
import { getSiteUrl } from '@/lib/site-url'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * MESSAGE BOARD NOTIFICATION DELIVERY
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared by post and reply Server Actions. Notification ROWS are written by
 * database triggers — the triggers are the single source of truth for who gets
 * notified. These helpers only read those rows back and deliver them.
 *
 * Rows are matched by the timestamp returned from the insert: now() is fixed for
 * a transaction, so the trigger's created_at equals the row's own. Never use the
 * app server's clock.
 *
 * server-only: notification rows are readable solely by their owner, so reading
 * them needs the service-role client, which must never reach the browser.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AdminClient = ReturnType<typeof createAdminClient>

export interface NotificationRow {
  user_id: string
  type:    string
  actor:   { name: string } | null
}

export async function readNotificationRows(
  admin: AdminClient,
  column: 'message_id' | 'reply_id',
  id: string,
  writtenAt: string,
): Promise<NotificationRow[]> {
  const { data, error } = await admin
    .from('notifications')
    .select('user_id, type, actor:users!notifications_actor_id_fkey(name)')
    .eq(column, id)
    .eq('created_at', writtenAt)
  if (error) throw error
  return (data ?? []) as unknown as NotificationRow[]
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Emails the people a trigger decided to notify about a mention. */
export async function emailMentions(
  admin: AdminClient,
  userIds: string[],
  content: {
    actorName: string
    subject:   string
    heading:   string
    line:      string
    path:      string
  },
): Promise<void> {
  if (userIds.length === 0) return
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[messages] RESEND_API_KEY not set — skipping mention emails')
    return
  }

  const { data, error } = await admin.from('users').select('email').in('id', userIds)
  if (error) throw error
  const recipients = (data ?? []) as unknown as { email: string }[]

  const link   = `${getSiteUrl()}${content.path}`
  const resend = new Resend(apiKey)

  const results = await Promise.all(recipients.map(r =>
    resend.emails.send({
      from:    process.env.RESEND_FROM ?? 'Weblikha Portal <onboarding@resend.dev>',
      to:      r.email,
      subject: content.subject,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#101010;color:#ffffff;border-radius:12px;">
          <h1 style="font-size:18px;margin:0 0 16px;">${escapeHtml(content.heading)}</h1>
          <p style="color:#b3b3b3;line-height:1.6;margin:0 0 24px;">${content.line}</p>
          <a href="${link}"
             style="display:inline-block;background:#FDD33C;color:#101010;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">
            Open the message
          </a>
        </div>`,
    }),
  ))
  for (const r of results) {
    if (r.error) console.error('[messages] Resend error:', r.error.message)
  }
}
```

Note: `content.line` is interpolated as HTML, so **callers must escape any user-supplied fragment** inside it with `escapeHtml` before passing it. `heading` is escaped here.

- [ ] **Step 2: Point the post actions at the shared helpers**

In `src/app/(portal)/projects/message-actions.ts`:

Delete the local `NotificationRow` interface, the local `escapeHtml` function and the local `emailMentions` function entirely. Remove the now-unused imports of `Resend`, `getSiteUrl` and (if no longer referenced) `createAdminClient`'s type usage — keep `createAdminClient` itself, it is still called.

Add:

```ts
import { emailMentions, escapeHtml, readNotificationRows } from '@/lib/message-delivery'
```

Replace the body of `deliverNotifications` with:

```ts
async function deliverNotifications(
  messageId: string,
  title: string,
  projectId: string,
  writtenAt: string,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const rows  = await readNotificationRows(admin, 'message_id', messageId, writtenAt)

    const actorName = rows[0]?.actor?.name ?? 'Someone'
    const url       = `/projects/${projectId}?tab=messages&message=${messageId}`

    const clientPostRecipients = rows.filter(r => r.type === 'client_message').map(r => r.user_id)
    const mentionRecipients    = rows.filter(r => r.type === 'message_mention').map(r => r.user_id)

    await sendPushToUsers(clientPostRecipients, {
      title: `New message from ${actorName}`,
      body:  title,
      url,
    })
    await sendPushToUsers(mentionRecipients, {
      title: `${actorName} mentioned you in "${title}"`,
      body:  'Tap to open the message.',
      url,
    })
    await emailMentions(admin, mentionRecipients, {
      actorName,
      subject: `${actorName} mentioned you in "${title}"`,
      heading: `${actorName} mentioned you`,
      line:    `You were mentioned in the message <strong style="color:#ffffff;">${escapeHtml(title)}</strong>.`,
      path:    url,
    })
  } catch (err) {
    console.error('[messages] Failed to deliver notifications:', err)
  }
}
```

The push and email copy is unchanged from what shipped; only where the code lives changes.

- [ ] **Step 3: Add the reply validation rules**

In `src/lib/messages.ts`, directly after the `MessageDraft` interface, add:

```ts
export interface ReplyDraft {
  bodyHtml: string
  mentions: string[]
}
```

and directly after `messageDraftError`, add:

```ts
/** Same body and mention rules as a post, without a title or category. */
export function replyDraftError(draft: ReplyDraft): string | null {
  if (isBodyEmpty(draft.bodyHtml)) return 'Write something in the reply.'
  if (draft.bodyHtml.length > MESSAGE_BODY_MAX) {
    return 'This reply is too long. Shorten it or remove some formatting.'
  }
  if (draft.mentions.length > MESSAGE_MENTIONS_MAX) {
    return `You can mention at most ${MESSAGE_MENTIONS_MAX} people.`
  }
  if (!draft.mentions.every(id => UUID_RE.test(id))) return 'A mention in this reply is invalid.'
  return null
}
```

- [ ] **Step 4: Write the reply Server Actions**

Create `src/app/(portal)/projects/message-reply-actions.ts`:

```ts
'use server'
/**
 * MESSAGE REPLY SERVER ACTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Authorisation lives in migration 022: every reply policy is written in terms
 * of can_read_message(), so reading a post and replying to it are the same test.
 *
 * As with posts, update and delete check the returned row count — an RLS USING
 * mismatch returns zero rows WITHOUT an error.
 *
 * Only an insert notifies. Editing a reply notifies nobody, including for a
 * newly added mention: the triggers fire on insert only.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sendPushToUsers } from '@/lib/push'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { emailMentions, escapeHtml, readNotificationRows } from '@/lib/message-delivery'
import { normalizeMentions, replyDraftError, type ReplyDraft } from '@/lib/messages'

export async function createReply(
  messageId: string,
  projectId: string,
  draft: ReplyDraft,
): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const mentions = normalizeMentions(draft.mentions)
  const problem  = replyDraftError({ ...draft, mentions })
  if (problem) throw new Error(problem)

  const { data: inserted, error } = await supabase
    .from('message_replies')
    .insert({
      message_id: messageId,
      author_id:  user.id,
      body:       draft.bodyHtml,
      mentions,
    })
    .select('id, created_at')
    .single()

  if (error || !inserted) throw new Error(error?.message ?? 'Could not post the reply.')

  await deliverReplyNotifications(inserted.id, messageId, projectId, inserted.created_at)

  revalidatePath(`/projects/${projectId}`)
  return inserted.id
}

export async function updateReply(
  replyId: string,
  projectId: string,
  draft: ReplyDraft,
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const mentions = normalizeMentions(draft.mentions)
  const problem  = replyDraftError({ ...draft, mentions })
  if (problem) throw new Error(problem)

  const { data, error } = await supabase
    .from('message_replies')
    .update({ body: draft.bodyHtml, mentions })
    .eq('id', replyId)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('You can only edit your own replies.')

  revalidatePath(`/projects/${projectId}`)
}

export async function deleteReply(replyId: string, projectId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('message_replies')
    .delete()
    .eq('id', replyId)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('You can only delete your own replies.')

  revalidatePath(`/projects/${projectId}`)
}

/** Best-effort: never fails the reply. */
async function deliverReplyNotifications(
  replyId: string,
  messageId: string,
  projectId: string,
  writtenAt: string,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const rows  = await readNotificationRows(admin, 'reply_id', replyId, writtenAt)
    if (rows.length === 0) return

    const { data: post } = await admin
      .from('messages').select('title').eq('id', messageId).single()
    const title     = post?.title ?? 'a message'
    const actorName = rows[0]?.actor?.name ?? 'Someone'
    const url       = `/projects/${projectId}?tab=messages&message=${messageId}`

    const threadRecipients  = rows.filter(r => r.type === 'message_reply').map(r => r.user_id)
    const mentionRecipients = rows.filter(r => r.type === 'message_mention').map(r => r.user_id)

    await sendPushToUsers(threadRecipients, {
      title: `${actorName} replied to "${title}"`,
      body:  'Tap to open the thread.',
      url,
    })
    await sendPushToUsers(mentionRecipients, {
      title: `${actorName} mentioned you in "${title}"`,
      body:  'Tap to open the message.',
      url,
    })
    await emailMentions(admin, mentionRecipients, {
      actorName,
      subject: `${actorName} mentioned you in "${title}"`,
      heading: `${actorName} mentioned you`,
      line:    `You were mentioned in a reply on <strong style="color:#ffffff;">${escapeHtml(title)}</strong>.`,
      path:    url,
    })
  } catch (err) {
    console.error('[messages] Failed to deliver reply notifications:', err)
  }
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: only the `src/app/(portal)/projects/[id]/page.tsx` error carried over from Task 1 (missing `replies`). Report anything else.

Run: `npm run lint`
Expected: only the pre-existing warning in `src/components/ui/confirm-dialog.tsx`.

- [ ] **Step 6: Confirm the service-role boundary**

Run: `grep -rln "supabase/admin\|message-delivery" src --include=*.tsx`
Expected: no output — neither the admin client nor the delivery module is reachable from a client component.

- [ ] **Step 7: Commit**

```bash
git add src/lib/message-delivery.ts src/lib/messages.ts "src/app/(portal)/projects/message-actions.ts" "src/app/(portal)/projects/message-reply-actions.ts"
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Reply Server Actions, with delivery extracted from the post actions

Push and mention email for replies go to exactly the rows the 022 triggers
wrote, matched by the timestamp read back from the database — the same
mechanism posts use, now shared rather than copied.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: The reply thread component

**Files:**
- Create: `src/components/modules/projects/MessageReplyThread.tsx`

**Interfaces:**
- Consumes: `createReply`, `updateReply`, `deleteReply` (Task 2); `RichTextEditor`, `RichTextEditorHandle`, `RichTextValue`, `MentionCandidate` from `@/components/modules/editor/RichTextEditor`; `RichTextBody`; `MessageReplyWithAuthor` (Task 1).
- Produces:

```ts
export function MessageReplyThread(props: {
  messageId:       string
  projectId:       string
  replies:         MessageReplyWithAuthor[]
  isClientVisible: boolean
  currentUserId:   string
  viewerRole:      UserRole
  members:         (ProjectMember & { user: User })[]
  admins:          User[]
}): JSX.Element
```

- [ ] **Step 1: Write the component**

Create `src/components/modules/projects/MessageReplyThread.tsx`:

```tsx
'use client'
/**
 * MESSAGE REPLY THREAD
 * ─────────────────────────────────────────────────────────────────────────────
 * Flat list of replies under a post, oldest first, plus the composer.
 *
 * A reply is exactly as visible as its post (migration 022), so there is no
 * visibility control here. On an INTERNAL post the mention list drops clients,
 * matching what notify_message_reply_mentions enforces in the database.
 *
 * Edit and Delete follow the post's rule: the author for both, an admin for
 * delete. The database is the real gate; this only decides what to show.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useRef, useState, useTransition } from 'react'
import { Pencil, Send, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/ui'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import { toast, withToast } from '@/components/ui/toast'
import { cn, formatRelative } from '@/lib/utils'
import { isEdited, replyDraftError } from '@/lib/messages'
import {
  RichTextEditor,
  type MentionCandidate,
  type RichTextEditorHandle,
  type RichTextValue,
} from '@/components/modules/editor/RichTextEditor'
import { RichTextBody } from '@/components/modules/editor/RichTextBody'
import {
  createReply, deleteReply, updateReply,
} from '@/app/(portal)/projects/message-reply-actions'
import type { MessageReplyWithAuthor, ProjectMember, User, UserRole } from '@/types'

interface MessageReplyThreadProps {
  messageId:       string
  projectId:       string
  replies:         MessageReplyWithAuthor[]
  isClientVisible: boolean
  currentUserId:   string
  viewerRole:      UserRole
  members:         (ProjectMember & { user: User })[]
  admins:          User[]
}

const EMPTY_VALUE: RichTextValue = { html: '', mentions: [], isEmpty: true, uploading: false }

export function MessageReplyThread({
  messageId,
  projectId,
  replies,
  isClientVisible,
  currentUserId,
  viewerRole,
  members,
  admins,
}: MessageReplyThreadProps) {
  const composerRef = useRef<RichTextEditorHandle>(null)
  const [draft, setDraft]       = useState<RichTextValue>(EMPTY_VALUE)
  const [editingId, setEditing] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<RichTextValue>(EMPTY_VALUE)
  const [busyId, setBusyId]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isAdmin = viewerRole === 'admin'

  // Same rule as the compose modal: members + admins, clients dropped when the
  // post is internal, so the UI never offers a mention the trigger discards.
  const mentionables = useMemo<MentionCandidate[]>(() => {
    const items: MentionCandidate[] = members
      .filter(m => isClientVisible || m.user.role !== 'client')
      .map(m => ({ id: m.user_id, name: m.user.name }))
    for (const a of admins) {
      if (!items.some(i => i.id === a.id)) items.push({ id: a.id, name: a.name })
    }
    return items.sort((a, b) => a.name.localeCompare(b.name))
  }, [members, admins, isClientVisible])

  const ordered = useMemo(
    () => [...replies].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [replies],
  )

  function submitNew() {
    if (draft.uploading) {
      toast.error('Wait for images to finish uploading.')
      return
    }
    const problem = replyDraftError({ bodyHtml: draft.html, mentions: draft.mentions })
    if (problem) {
      toast.error(problem)
      return
    }
    const payload = { bodyHtml: draft.html, mentions: draft.mentions }
    setBusyId('new')
    startTransition(async () => {
      await withToast(async () => {
        await createReply(messageId, projectId, payload)
        composerRef.current?.clear()
        setDraft(EMPTY_VALUE)
        toast.success('Reply posted.')
      }, 'Could not post the reply.')
      setBusyId(null)
    })
  }

  function saveEdit(replyId: string) {
    if (editDraft.uploading) {
      toast.error('Wait for images to finish uploading.')
      return
    }
    const problem = replyDraftError({ bodyHtml: editDraft.html, mentions: editDraft.mentions })
    if (problem) {
      toast.error(problem)
      return
    }
    const payload = { bodyHtml: editDraft.html, mentions: editDraft.mentions }
    setBusyId(replyId)
    startTransition(async () => {
      await withToast(async () => {
        await updateReply(replyId, projectId, payload)
        setEditing(null)
        toast.success('Reply updated.')
      }, 'Could not save the reply.')
      setBusyId(null)
    })
  }

  async function remove(reply: MessageReplyWithAuthor) {
    const ok = await confirmDialog({
      title:        'Delete this reply?',
      message:      'It will be removed for everyone who can see this message.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    setBusyId(reply.id)
    startTransition(async () => {
      await withToast(async () => {
        await deleteReply(reply.id, projectId)
        toast.success('Reply deleted.')
      }, 'Could not delete the reply.')
      setBusyId(null)
    })
  }

  const iconButton =
    'p-1.5 rounded-md text-tertiary hover:text-primary hover:bg-bg-surface-3 active:opacity-70 ' +
    'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' +
    'disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <section className="border-t border-subtle pt-4 space-y-4" aria-label="Replies">
      <h3 className="text-xs font-medium text-secondary">
        {ordered.length === 0 ? 'Replies' : `Replies (${ordered.length})`}
      </h3>

      {ordered.length === 0 && (
        <p className="text-xs text-tertiary">No replies yet.</p>
      )}

      <ul className="space-y-4">
        {ordered.map(reply => {
          const isAuthor  = reply.author_id === currentUserId
          const canDelete = isAuthor || isAdmin
          const busy      = busyId === reply.id

          return (
            <li key={reply.id} className="group flex gap-2.5">
              <Avatar
                name={reply.author?.name ?? 'Unknown'}
                src={reply.author?.avatar_url ?? null}
                size="xs"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-xs font-medium text-primary">
                    {reply.author?.name ?? 'Unknown'}
                  </span>
                  <span className="text-2xs text-tertiary">
                    {formatRelative(reply.created_at)}
                    {isEdited(reply) && ' · Edited'}
                  </span>

                  {(isAuthor || canDelete) && editingId !== reply.id && (
                    <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                      {isAuthor && (
                        <button
                          type="button"
                          className={iconButton}
                          disabled={isPending}
                          onClick={() => {
                            setEditing(reply.id)
                            setEditDraft({
                              html:      reply.body,
                              mentions:  reply.mentions,
                              isEmpty:   false,
                              uploading: false,
                            })
                          }}
                          aria-label="Edit reply"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className={cn(iconButton, 'hover:text-danger hover:bg-danger/10')}
                          disabled={isPending}
                          onClick={() => { void remove(reply) }}
                          aria-label="Delete reply"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </span>
                  )}
                </div>

                {editingId === reply.id ? (
                  <div className="mt-1.5">
                    <RichTextEditor
                      mentionables={mentionables}
                      uploadPrefix={`messages/${projectId}`}
                      onChange={setEditDraft}
                      initialContent={reply.body}
                      placeholder="Edit your reply…"
                      disabled={isPending}
                      autoFocus
                      onSubmitShortcut={() => saveEdit(reply.id)}
                      onEscape={() => setEditing(null)}
                      footer={
                        <div className="flex items-center justify-end gap-2 px-2 py-1.5 border-t border-subtle">
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            disabled={isPending}
                            className="h-7 px-2 text-xs text-secondary hover:text-primary active:opacity-70 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(reply.id)}
                            disabled={isPending || editDraft.isEmpty || editDraft.uploading}
                            className="h-7 px-3 text-xs bg-brand text-bg-base font-medium rounded-md hover:bg-brand/90 active:scale-[0.98] disabled:opacity-40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            {busy ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      }
                    />
                  </div>
                ) : (
                  <div className="mt-0.5">
                    <RichTextBody body={reply.body} size="xs" />
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <RichTextEditor
        ref={composerRef}
        mentionables={mentionables}
        uploadPrefix={`messages/${projectId}`}
        onChange={setDraft}
        placeholder="Write a reply…"
        disabled={isPending}
        onSubmitShortcut={submitNew}
        footer={
          <div className="flex items-center justify-end gap-2 px-2 py-1.5 border-t border-subtle">
            <button
              type="button"
              onClick={submitNew}
              disabled={isPending || draft.isEmpty || draft.uploading}
              className="flex items-center gap-1.5 h-7 px-3 text-xs bg-brand text-bg-base font-medium rounded-md hover:bg-brand/90 active:scale-[0.98] disabled:opacity-40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Send className="size-3" />
              {busyId === 'new' ? 'Posting…' : 'Reply'}
            </button>
          </div>
        }
      />
    </section>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: only the carried-over `page.tsx` error. The component is not mounted until Task 4 — that is expected.

Run: `npm run lint`
Expected: only the pre-existing `confirm-dialog.tsx` warning.

- [ ] **Step 3: Commit**

```bash
git add src/components/modules/projects/MessageReplyThread.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Message reply thread: list, in-place edit and composer

Clients are dropped from the mention list on an internal post, matching what
the 022 trigger enforces. No visibility control — a reply inherits the post's.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Wire the thread in, and the bell

**Files:**
- Modify: `src/app/(portal)/projects/[id]/page.tsx`
- Modify: `src/components/modules/projects/MessageDetailModal.tsx`
- Modify: `src/components/modules/projects/MessagesTab.tsx`
- Modify: `src/components/layout/NotificationsBell.tsx`

**Interfaces:**
- Consumes: `MessageReplyThread` (Task 3); `MessageWithAuthor.replies` (Task 1).
- Produces: `MessageDetailModal` gains props `members`, `admins`; the messages query returns replies.

- [ ] **Step 1: Load replies with the messages**

In `src/app/(portal)/projects/[id]/page.tsx`, replace:

```ts
    .select('*, author: users(id, name, avatar_url, role), category: message_categories(id, name, emoji, archived_at)')
```

with:

```ts
    // Replies come down with their post: a project's threads are small and the
    // page is already dynamic, so the thread needs no client-side fetch. They
    // are sorted in MessageReplyThread rather than here.
    .select('*, author: users(id, name, avatar_url, role), category: message_categories(id, name, emoji, archived_at), replies: message_replies(*, author: users(id, name, avatar_url, role))')
```

- [ ] **Step 2: Render the thread in the detail modal**

In `src/components/modules/projects/MessageDetailModal.tsx`:

Add to the imports:

```tsx
import { MessageReplyThread } from './MessageReplyThread'
import type { MessageWithAuthor, ProjectMember, User, UserRole } from '@/types'
```

(replacing the existing `import type { MessageWithAuthor, UserRole } from '@/types'` line).

Add two props to `MessageDetailModalProps`, after `viewerRole`:

```tsx
  members:       (ProjectMember & { user: User })[]
  admins:        User[]
```

and to the destructured parameter list, after `viewerRole,`:

```tsx
  members,
  admins,
```

Then replace:

```tsx
          <RichTextBody body={message.body} size="sm" />
        </div>
```

with:

```tsx
          <RichTextBody body={message.body} size="sm" />

          <MessageReplyThread
            messageId={message.id}
            projectId={projectId}
            replies={message.replies}
            isClientVisible={message.is_client_visible}
            currentUserId={currentUserId}
            viewerRole={viewerRole}
            members={members}
            admins={admins}
          />
        </div>
```

- [ ] **Step 3: Pass the props and show counts on cards**

In `src/components/modules/projects/MessagesTab.tsx`:

In the `<MessageDetailModal` element, add after `viewerRole={viewerRole}`:

```tsx
          members={members}
          admins={admins}
```

Then, in the card's metadata row, replace:

```tsx
                    {isEdited(msg) && (
                      <>
                        <span aria-hidden>·</span>
                        <span>Edited</span>
                      </>
```

with:

```tsx
                    {msg.replies.length > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          {msg.replies.length === 1 ? '1 reply' : `${msg.replies.length} replies`}
                          {' · last '}
                          {formatRelative(
                            msg.replies.reduce(
                              (latest, r) => (r.created_at > latest ? r.created_at : latest),
                              msg.replies[0]?.created_at ?? msg.created_at,
                            ),
                          )}
                        </span>
                      </>
                    )}
                    {isEdited(msg) && (
                      <>
                        <span aria-hidden>·</span>
                        <span>Edited</span>
                      </>
```

(The closing `)}` of the `isEdited` block stays as it is — only the opening of a new block is inserted before it.) `formatRelative` is already imported in this file.

- [ ] **Step 4: Teach the bell about replies**

In `src/components/layout/NotificationsBell.tsx`, in `function describe`, add before `default:`:

```tsx
    case 'message_reply':
      return { lead: ' replied to ', subject: n.message?.title ?? 'a message' }
```

Replace:

```tsx
      (n.type === 'client_message' || n.type === 'message_mention') && n.message_id
```

with:

```tsx
      (n.type === 'client_message' || n.type === 'message_mention' || n.type === 'message_reply') && n.message_id
```

Replace:

```tsx
                          : n.type === 'client_message'
```

with:

```tsx
                          : n.type === 'client_message' || n.type === 'message_reply'
```

- [ ] **Step 5: Typecheck, lint, build**

Run: `npx tsc --noEmit`
Expected: **exit 0** — the `page.tsx` error from Task 1 is resolved by Step 1.

Run: `npm run lint`
Expected: only the pre-existing `confirm-dialog.tsx` warning.

Run: `npm run build`
Expected: success, `/projects/[id]` dynamic.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(portal)/projects/[id]/page.tsx" src/components/modules/projects/MessageDetailModal.tsx src/components/modules/projects/MessagesTab.tsx src/components/layout/NotificationsBell.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Show reply threads on posts, counts on cards, replies in the bell

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Docs, verification, apply

**Files:**
- Modify: `CLAUDE.md`
- Modify: `MEMORY.md`

Steps 1–5 are agent work. Steps 6–8 need database passwords and a browser: they are Matthew's.

- [ ] **Step 1: Update CLAUDE.md**

- Migration log: after the `021 message categories + mentions …` entry add `022 message replies (message_replies, can_read_message, reply notifications)`.
- Database schema intro: change the range `001` → `022`.
- Core tables: add after the `message_categories` line:
  `message_replies     id, message_id, author_id, body (rich-text HTML), mentions uuid[], timestamps (flat thread; visibility inherited from the post)`
  and add `reply_id` to the `notifications` row's column list, and `message_reply` to its type list.
- Project structure: under `projects/`, add `message-reply-actions.ts  Server Actions: create/update/delete replies`; under `lib/`, add `message-delivery.ts  Server-only push/email delivery shared by post and reply actions`.
- RLS summary, Messages bullet: append `Replies (022) inherit their post's visibility through can_read_message(); a client can neither read nor write replies on an internal post. A reply notifies the post's author and earlier repliers, and never notifies a client on an internal post.`

- [ ] **Step 2: Update MEMORY.md**

- `Last synced` → `2026-09-18`.
- Stage 3 section: append `Replies shipped 2026-09-18 (spec docs/superpowers/specs/2026-09-18-message-replies-design.md, migration 022): a flat thread per post, visibility inherited from the post, notifying the post's author and everyone already in the thread. Editing a reply notifies nobody, including for a newly added mention.`
- Backlog item 1 (Stage 3): remove "Follow-up stage: replies on messages", since this ships it.
- "What Matthew still has to do": add `Apply 022 to dev, run the reply checklist, apply to prod, then merge.`

- [ ] **Step 3: Full check and build**

Run: `npm run check`
Expected: exit 0, only the pre-existing lint warning.

Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md MEMORY.md
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Docs: message board replies and migration 022

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Review agents**

Dispatch `schema-reviewer` and `rls-security-reviewer` on `022_message_replies.sql`, `message-reply-actions.ts` and `message-delivery.ts`; `ui-convention-checker` and `design-token-auditor` on `MessageReplyThread.tsx`, `MessageDetailModal.tsx` and `MessagesTab.tsx`. Fix Critical and Important findings before Step 6.

Ask the RLS reviewer specifically: can a client read or write a reply on an internal post through PostgREST directly; can a non-member reach replies via the embed on the project page; does `can_read_message` leak anything through its SECURITY DEFINER.

- [ ] **Step 6 (Matthew): Apply 022 to dev**

```powershell
$env:DB_URL = Get-Clipboard
$env:DB_URL -replace ':[^:@/]+@', ':***@'
npx supabase migration list --db-url $env:DB_URL
npx supabase db push --db-url $env:DB_URL
npx supabase migration list --db-url $env:DB_URL
Remove-Item Env:DB_URL
```

Expected: masked URL shows `tydreidoqzndxjftpyzd`; the first list shows only 022 unapplied; the last shows 001–022 matched.

- [ ] **Step 7 (Matthew): Manual checklist on dev**

1. Reply to a shared post as a provider → the post's author gets one notification, not two.
2. Reply again as the author → the first replier is notified, the author is not.
3. @mention someone in a reply → exactly one notification, worded as a mention, plus an email.
4. As a client: a shared post shows the thread and composer; an internal post is not in the list at all.
5. Replying to an internal post: clients do not appear in the @ list.
6. Edit a reply → "Edited" appears, nobody is notified.
7. Delete a post → its replies disappear with it, and so do their bell entries.
8. Cards show the reply count and last-reply time; the list order does not change.
9. Task comments and existing posts behave exactly as before.

- [ ] **Step 8 (Matthew): Prod, then merge**

Apply 022 with the prod URL (masked URL must show `vhsuyouczctnkvnnjzgg`), then merge the PR. The page query embeds `message_replies`, which errors on a database without 022 and would empty the message board.
