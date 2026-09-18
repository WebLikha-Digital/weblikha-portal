# Message Board Rich Text, Mentions and Categories — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give message-board posts a rich-text body with images, @mentions of people on the project, and an agency-wide, admin-editable category list.

**Architecture:** Migration 021 adds `message_categories`, `messages.category_id` / `mentions`, and a `notify_message_mentions` trigger that refuses to notify clients about internal posts. The task-comment editor is split into a shared `RichTextEditor` form field and `RichTextBody` renderer; comments keep working through thin wrappers. Server Actions push and email exactly the notification rows the triggers created, matched by the transaction timestamp.

**Tech Stack:** Next.js 15.5 App Router, React 19, TypeScript strict, Supabase Postgres + RLS, TipTap (StarterKit, Link, Image, Mention, Placeholder), DOMPurify, Resend, web-push via `src/lib/push.ts`, Tailwind via CSS tokens.

**Spec:** `docs/superpowers/specs/2026-09-17-message-board-richtext-categories-design.md`

## Global Constraints

- **No test framework exists in this repo, by standing decision.** Do not add one. Each task's gate is `npx tsc --noEmit` exiting 0 plus its named check.
- **`npx tsc --noEmit` stays at zero errors.** `strict`, `noUncheckedIndexedAccess` and **`exactOptionalPropertyTypes`** are on — an optional prop that may be passed `undefined` must be typed `?: T | undefined`.
- **No `any`.** Use `unknown` and narrow, or a typed cast through `unknown` for Supabase embed results.
- **Never hardcode colors, sizes or fonts in components.** Tailwind token classes only. `bg-black/50` backdrops and `border-[var(--color-border-default)]` are accepted conventions. Inline hex in **email HTML** is accepted (existing mention-email pattern; email clients do not load app CSS).
- **Mobile and desktop classes in the same pass.**
- **Every destructive action uses `confirmDialog`.** Archiving a category is reversible and is not destructive.
- **Every interactive element:** hover, `active:` press cue, `focus-visible:ring`, pending state that disables it in flight, toast outcome.
- **Imports:** primitives from `@/components/ui`; `confirmDialog`, `toast`, `withToast` directly from their files.
- **Service-role client (`@/lib/supabase/admin`) never imported from a `'use client'` module.** `'use server'` files export only async functions.
- **Limits:** title 1–200 chars after trim; body HTML at most **20,000** chars and not empty once tags are stripped (an `<img>` counts as content); at most **50** mentions, UUIDs, de-duplicated; category name 1–40 chars after trim; emoji 1–16 chars after trim.
- **Clients are never mentionable or notified on internal posts** — excluded in the UI, dropped by the database trigger.
- **Every SQL function** pins `set search_path = public, pg_temp`. Migrations idempotent: `drop … if exists` / `create or replace` / `if not exists`.
- **Commits** authored `Matthew Kim <weblikhadigital@gmail.com>`, ending `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Stage files by explicit path; never `git add -A` (the untracked `.superpowers/` scratch dir must not be committed).
- **Branch:** `feature/message-board` (already checked out). Migration 020 is applied on dev only; 021 is applied by Matthew in Task 7.

## Plan notes — deliberate refinements of the spec

1. `MentionCandidate` is `{ id, name }` — the spec listed `avatar_url`, but the mention list renders only `@name`.
2. Legacy plain-text detection keeps the existing comment rule `!body.trimStart().startsWith('<')`, not the spec's tag regex: editor HTML always starts with `<`, and the regex would misclassify a legacy plain comment containing `<b>`.
3. Category reordering is `reorderCategories(orderedIds)` rather than `updateCategory(id, { position })` — move up/down produces a full order, and one action rewriting positions avoids duplicate positions.

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/021_message_categories_mentions.sql` | **Create.** Categories table + RLS + seed, `messages.category_id`/`mentions`, archived-category guard, body length 20,000, `message_mention` type, mention trigger. |
| `src/types/index.ts` | **Modify.** `MessageCategory`; `Message.category_id`/`mentions`; `MessageWithAuthor.category`; `NotificationType` gains `message_mention`. |
| `src/components/modules/editor/RichTextEditor.tsx` | **Create.** Shared TipTap form field: toolbar, mentions, image upload. |
| `src/components/modules/editor/RichTextBody.tsx` | **Create.** Sanitised renderer with plain-text fallback. |
| `src/components/modules/projects/CommentEditor.tsx` | **Rewrite.** Thin wrapper adding Post/Cancel; same props as today. |
| `src/components/modules/projects/CommentBody.tsx` | **Rewrite.** Thin wrapper over `RichTextBody`. |
| `src/lib/messages.ts` | **Rewrite.** Limits, `messageDraftError`, `categoryDraftError`, `htmlToText`, `messageExcerpt`, `plainTextToHtml`, `normalizeMentions`, `isEdited`. |
| `src/app/(portal)/projects/message-actions.ts` | **Rewrite.** Rich body, mentions, category; push + email from trigger rows. |
| `src/app/(portal)/projects/message-category-actions.ts` | **Create.** Create, update, reorder, archive, restore. |
| `src/components/modules/projects/CategoryPicker.tsx` | **Create.** Keyboard-accessible category dropdown. |
| `src/components/modules/projects/CategoryManagerModal.tsx` | **Create.** Admin slide-over editing the list. |
| `src/components/modules/projects/MessageCategoryPill.tsx` | **Create.** Emoji + name pill. |
| `src/components/modules/projects/MessageComposeModal.tsx` | **Rewrite.** Picker, title, rich editor, visibility, mention note. |
| `src/components/modules/projects/MessagesTab.tsx` | **Modify.** New props; pill + excerpt on cards. |
| `src/components/modules/projects/MessageDetailModal.tsx` | **Modify.** Pill + `RichTextBody`. |
| `src/components/modules/projects/ProjectTabsLayout.tsx` | **Modify.** Pass `categories`, `members`, `admins` to `MessagesTab`. |
| `src/app/(portal)/projects/[id]/page.tsx` | **Modify.** Load categories; embed message category. |
| `src/components/layout/NotificationsBell.tsx` | **Modify.** `message_mention` rendering and routing. |
| `CLAUDE.md`, `MEMORY.md` | **Modify.** Migration log, schema, structure, stage notes. |

---

## Task 1: Migration 021 and types

**Files:**
- Create: `supabase/migrations/021_message_categories_mentions.sql`
- Modify: `src/types/index.ts`

**Interfaces:**
- Produces: table `public.message_categories`; columns `messages.category_id uuid null`, `messages.mentions uuid[] not null default '{}'`; notification type `'message_mention'`; TypeScript `MessageCategory`, `Message.category_id`, `Message.mentions`, `NotificationType` including `'message_mention'`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/021_message_categories_mentions.sql`:

```sql
-- =============================================================================
-- WEBLIKHA PORTAL — MESSAGE CATEGORIES AND MENTIONS
-- Migration: 021_message_categories_mentions.sql
--
-- Extends the Stage 3 message board (020):
--   1. message_categories — one agency-wide list, admin-editable, archivable.
--   2. messages.category_id + messages.mentions.
--   3. A guard so an archived category can't be chosen for a post.
--   4. Body length raised to 20,000 characters (rich-text HTML inflates length).
--   5. notifications type 'message_mention'.
--   6. notify_message_mentions — the single source of truth for mention
--      recipients. Clients are never notified about an internal post.
--
-- Apply with: npx supabase db push --db-url $env:DB_URL   (dev first, then prod)
-- Safe to re-run.
-- =============================================================================


-- =============================================================================
-- 1. CATEGORIES
-- "None" is not a row — it is a null messages.category_id.
-- Archiving replaces deleting: there is no delete policy, and messages reference
-- categories ON DELETE RESTRICT, so a category in use cannot be hard-deleted.
-- =============================================================================

create table if not exists public.message_categories (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  emoji       text        not null,
  position    integer     not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.message_categories is
  'Agency-wide message board categories. Admin-editable; archived rather than deleted.';

alter table public.message_categories
  drop constraint if exists message_categories_name_length;
alter table public.message_categories
  add constraint message_categories_name_length
  check (char_length(btrim(name)) between 1 and 40);

alter table public.message_categories
  drop constraint if exists message_categories_emoji_length;
alter table public.message_categories
  add constraint message_categories_emoji_length
  check (char_length(btrim(emoji)) between 1 and 16);

-- Names unique among ACTIVE categories only, so an archived "Pitch" does not
-- block creating a new one.
create unique index if not exists idx_message_categories_active_name
  on public.message_categories (lower(btrim(name)))
  where archived_at is null;

create index if not exists idx_message_categories_position
  on public.message_categories (position);

drop trigger if exists message_categories_set_updated_at on public.message_categories;
create trigger message_categories_set_updated_at
  before update on public.message_categories
  for each row execute function public.set_updated_at();

alter table public.message_categories enable row level security;

drop policy if exists "message_categories: approved read" on public.message_categories;
create policy "message_categories: approved read"
  on public.message_categories for select
  using (public.is_approved_member());

drop policy if exists "message_categories: admin inserts" on public.message_categories;
create policy "message_categories: admin inserts"
  on public.message_categories for insert
  with check (public.is_admin());

drop policy if exists "message_categories: admin updates" on public.message_categories;
create policy "message_categories: admin updates"
  on public.message_categories for update
  using (public.is_admin())
  with check (public.is_admin());

-- Seed defaults once; re-running inserts nothing that already exists by name.
insert into public.message_categories (name, emoji, position)
select v.name, v.emoji, v.position
from (values
  ('Announcement', '📢', 0),
  ('FYI',          '✨', 1),
  ('Heartbeat',    '💗', 2),
  ('Pitch',        '💡', 3),
  ('Question',     '👋', 4)
) as v(name, emoji, position)
where not exists (
  select 1 from public.message_categories c
  where lower(btrim(c.name)) = lower(v.name)
);


-- =============================================================================
-- 2. MESSAGE COLUMNS
-- =============================================================================

alter table public.messages
  add column if not exists category_id uuid
  references public.message_categories(id) on delete restrict;

create index if not exists idx_messages_category_id
  on public.messages (category_id);

alter table public.messages
  add column if not exists mentions uuid[] not null default '{}';


-- =============================================================================
-- 3. ARCHIVED CATEGORY GUARD
-- An archived category cannot be chosen on insert, or switched to on update.
-- A post that already has a now-archived category keeps it when other fields
-- are edited. SECURITY DEFINER so the check does not depend on what the caller
-- can read under RLS.
-- =============================================================================

create or replace function public.guard_message_archived_category()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.category_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.category_id is not distinct from old.category_id then
    return new;
  end if;

  if exists (
    select 1 from public.message_categories c
    where c.id = new.category_id and c.archived_at is not null
  ) then
    raise exception 'That category is archived and can''t be chosen.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_guard_archived_category on public.messages;
create trigger messages_guard_archived_category
  before insert or update on public.messages
  for each row execute function public.guard_message_archived_category();


-- =============================================================================
-- 4. BODY LENGTH — 20,000 characters of HTML
-- Replaces 020's 10,000 check. NOT VALID so legacy rows are not re-checked on
-- apply; new inserts and updates are enforced. Emptiness of rich content is
-- validated in the application (src/lib/messages.ts).
-- =============================================================================

alter table public.messages
  drop constraint if exists messages_body_length;
alter table public.messages
  add constraint messages_body_length
  check (char_length(body) between 1 and 20000) not valid;


-- =============================================================================
-- 5. NOTIFICATION TYPE
-- =============================================================================

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check
  check (type in ('mention', 'task_assigned', 'client_task', 'client_message', 'message_mention'));


-- =============================================================================
-- 6. MENTION NOTIFICATIONS
--
-- Candidates: ids in new.mentions not already in old.mentions (all on insert).
-- A candidate is notified only if:
--   - it is not the author, and
--   - it is an approved admin, or an approved member of the project, and
--   - on an INTERNAL post, it is not a client, and
--   - no notification already exists for that user and this message.
--
-- The last rule prevents a double notification when a client's post also
-- mentions a team member. It depends on trigger order: Postgres fires
-- same-event triggers in NAME order, so messages_notify_client_message (020)
-- runs before messages_notify_mentions. Renaming either trigger can break this.
-- =============================================================================

create or replace function public.notify_message_mentions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new uuid[];
  v_uid uuid;
begin
  if tg_op = 'INSERT' then
    v_new := coalesce(new.mentions, '{}');
  else
    select coalesce(array_agg(m), '{}') into v_new
    from unnest(coalesce(new.mentions, '{}')) m
    where not (m = any(coalesce(old.mentions, '{}')));
  end if;

  foreach v_uid in array v_new loop
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
            where pm.project_id = new.project_id and pm.user_id = v_uid
          )
        )
        and (new.is_client_visible or u.role <> 'client')
    ) then
      continue;
    end if;

    if exists (
      select 1 from public.notifications n
      where n.user_id = v_uid and n.message_id = new.id
    ) then
      continue;
    end if;

    insert into public.notifications (user_id, actor_id, type, project_id, message_id)
    values (v_uid, new.author_id, 'message_mention', new.project_id, new.id);
  end loop;

  return new;
end;
$$;

comment on function public.notify_message_mentions() is
  'Creates message_mention notifications for newly mentioned approved members/admins; never a client on an internal post. Single source of truth for mention recipients.';

drop trigger if exists messages_notify_mentions on public.messages;
create trigger messages_notify_mentions
  after insert or update of mentions on public.messages
  for each row execute function public.notify_message_mentions();


-- =============================================================================
-- DONE
-- After running: NOTIFY pgrst, 'reload schema';
--
-- Manual checks after applying:
--   - As a client, select from message_categories → 5 seeded rows; insert → rejected.
--   - Insert a message with an archived category_id → 42501.
--   - Mention a client on an internal post via the API → no notification row.
--   - A client post mentioning an admin → one notification for that admin.
-- =============================================================================
```

- [ ] **Step 2: Update the types**

In `src/types/index.ts`, replace:

```ts
export interface Message {
  id:                string
  project_id:        string
  author_id:         string | null
  title:             string
  body:              string
  is_client_visible: boolean
  created_at:        string
  updated_at:        string
}
```

with:

```ts
export interface Message {
  id:                string
  project_id:        string
  author_id:         string | null
  title:             string
  body:              string          // Rich-text HTML; pre-021 rows may be plain text
  is_client_visible: boolean
  category_id:       string | null
  mentions:          string[]
  created_at:        string
  updated_at:        string
}

/** Agency-wide message board category (migration 021). Archived, never deleted. */
export interface MessageCategory {
  id:          string
  name:        string
  emoji:       string
  position:    number
  archived_at: string | null
  created_at:  string
  updated_at:  string
}
```

Then replace:

```ts
export type NotificationType =
  | 'mention'
  | 'task_assigned'
  | 'client_task'
  | 'client_message'
```

with:

```ts
export type NotificationType =
  | 'mention'
  | 'task_assigned'
  | 'client_task'
  | 'client_message'
  | 'message_mention'
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exits 0. There is no database access — the migration is applied in Task 7.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/021_message_categories_mentions.sql src/types/index.ts
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Migration 021: message categories and mention notifications

Agency-wide archivable categories (admin-editable, seeded), messages
category_id and mentions, an archived-category guard, a 20,000-character
body limit for HTML, and a mention trigger that never notifies a client
about an internal post.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Shared rich-text editor and renderer

**Files:**
- Create: `src/components/modules/editor/RichTextEditor.tsx`
- Create: `src/components/modules/editor/RichTextBody.tsx`
- Rewrite: `src/components/modules/projects/CommentEditor.tsx`
- Rewrite: `src/components/modules/projects/CommentBody.tsx`

**Interfaces:**
- Produces:

```ts
// RichTextEditor.tsx
export interface MentionCandidate { id: string; name: string }
export interface RichTextValue { html: string; mentions: string[]; isEmpty: boolean; uploading: boolean }
export interface RichTextEditorHandle { clear: () => void }
export const RichTextEditor: React.ForwardRefExoticComponent<RichTextEditorProps & React.RefAttributes<RichTextEditorHandle>>

// RichTextBody.tsx
export function RichTextBody(props: { body: string; size?: 'xs' | 'sm' | undefined }): JSX.Element
```

- `CommentEditor` and `CommentBody` keep their existing props exactly; `TodoItem.tsx` is not edited.

- [ ] **Step 1: Write `RichTextEditor`**

Create `src/components/modules/editor/RichTextEditor.tsx`:

```tsx
'use client'
/**
 * RICH TEXT EDITOR — shared TipTap form field
 * ─────────────────────────────────────────────────────────────────────────────
 * Used by task comments (via CommentEditor) and message board posts. A form
 * field, not a form: it reports { html, mentions, isEmpty, uploading } through
 * onChange and has no submit button of its own. Callers put buttons in `footer`.
 *
 *   • Bold / italic / strikethrough / lists / links toolbar
 *   • @mentions from `mentionables` — read through a ref, so the list can change
 *     (e.g. a message switching between internal and shared) without a remount
 *   • Images: paste, drag-drop or attach — uploaded to the `comment-attachments`
 *     bucket under `${uploadPrefix}/`. Failures toast; never a native alert().
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  forwardRef, useEffect, useImperativeHandle, useRef, useState,
} from 'react'
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react'
import type { Editor, JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import {
  Bold, Italic, Strikethrough, List, ListOrdered, Link2, ImagePlus, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

export interface MentionCandidate {
  id:   string
  name: string
}

export interface RichTextValue {
  html:      string
  mentions:  string[]
  isEmpty:   boolean
  uploading: boolean
}

export interface RichTextEditorHandle {
  clear: () => void
}

interface RichTextEditorProps {
  mentionables:      MentionCandidate[]
  uploadPrefix:      string
  onChange:          (value: RichTextValue) => void
  initialContent?:   string | undefined
  placeholder?:      string | undefined
  disabled?:         boolean | undefined
  autoFocus?:        boolean | undefined
  onSubmitShortcut?: (() => void) | undefined
  onEscape?:         (() => void) | undefined
  contentClassName?: string | undefined
  footer?:           React.ReactNode
}

// ── Image upload ───────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

async function uploadImage(file: File, uploadPrefix: string): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null
  if (file.size > MAX_IMAGE_BYTES) {
    toast.error('Image is too large — max 5 MB.')
    return null
  }
  const supabase = createClient()
  const ext  = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${uploadPrefix}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from('comment-attachments')
    .upload(path, file, { contentType: file.type })
  if (error) {
    toast.error(`Image upload failed: ${error.message}`)
    return null
  }
  return supabase.storage.from('comment-attachments').getPublicUrl(path).data.publicUrl
}

// ── Mention dropdown ───────────────────────────────────────────────────────────

interface MentionItem {
  id:    string
  label: string
}

interface MentionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

const MentionList = forwardRef<MentionListHandle, SuggestionProps<MentionItem>>(
  function MentionList(props, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0)

    useEffect(() => setSelectedIndex(0), [props.items])

    function selectItem(index: number) {
      const item = props.items[index]
      if (item) props.command(item)
    }

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }) {
        if (props.items.length === 0) return false
        if (event.key === 'ArrowUp') {
          setSelectedIndex(i => (i + props.items.length - 1) % props.items.length)
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex(i => (i + 1) % props.items.length)
          return true
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex)
          return true
        }
        return false
      },
    }))

    if (props.items.length === 0) {
      return (
        <div className="px-3 py-2 text-xs text-tertiary">No matching people</div>
      )
    }

    return (
      <div className="py-1">
        {props.items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => selectItem(index)}
            className={cn(
              'w-full text-left px-3 py-1.5 text-sm transition-colors',
              index === selectedIndex
                ? 'bg-bg-surface-3 text-primary'
                : 'text-secondary hover:bg-bg-surface-3 hover:text-primary',
            )}
          >
            @{item.label}
          </button>
        ))}
      </div>
    )
  },
)

function buildMentionSuggestion(getCandidates: () => MentionCandidate[]) {
  return {
    items: ({ query }: { query: string }) =>
      getCandidates()
        .filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6)
        .map(c => ({ id: c.id, label: c.name })),

    render: () => {
      let component: ReactRenderer<MentionListHandle, SuggestionProps<MentionItem>> | null = null
      let popup: HTMLDivElement | null = null

      function position(clientRect: (() => DOMRect | null) | null | undefined) {
        if (!popup || !clientRect) return
        const rect = clientRect()
        if (!rect) return
        popup.style.left = `${rect.left}px`
        popup.style.top  = `${rect.bottom + 4}px`
      }

      return {
        onStart: (props: SuggestionProps<MentionItem>) => {
          component = new ReactRenderer(MentionList, { props, editor: props.editor })
          popup = document.createElement('div')
          popup.className =
            'fixed z-[60] min-w-[180px] max-h-[200px] overflow-y-auto bg-bg-surface-2 border border-subtle rounded-lg shadow-lg'
          popup.appendChild(component.element)
          document.body.appendChild(popup)
          position(props.clientRect)
        },
        onUpdate: (props: SuggestionProps<MentionItem>) => {
          component?.updateProps(props)
          position(props.clientRect)
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (props.event.key === 'Escape') {
            popup?.remove()
            return true
          }
          return component?.ref?.onKeyDown(props) ?? false
        },
        onExit: () => {
          popup?.remove()
          component?.destroy()
          popup = null
          component = null
        },
      }
    },
  }
}

/** Walks the editor document and collects mentioned user IDs. */
function extractMentions(doc: JSONContent): string[] {
  const ids = new Set<string>()
  function walk(node: JSONContent) {
    if (node.type === 'mention' && typeof node.attrs?.id === 'string') {
      ids.add(node.attrs.id)
    }
    node.content?.forEach(walk)
  }
  walk(doc)
  return Array.from(ids)
}

// ── Toolbar ────────────────────────────────────────────────────────────────────

interface ToolbarProps {
  editor:    Editor
  onAttach:  () => void
  uploading: boolean
  disabled:  boolean
}

function Toolbar({ editor, onAttach, uploading, disabled }: ToolbarProps) {
  const btn = (active: boolean) => cn(
    'p-1.5 rounded transition-colors duration-150 active:opacity-70',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
    'disabled:opacity-40 disabled:cursor-not-allowed',
    active ? 'bg-bg-surface-3 text-primary' : 'text-tertiary hover:text-primary',
  )

  function toggleLink() {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const url = prompt('Link URL:')
    if (url) editor.chain().focus().setLink({ href: url }).run()
  }

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-subtle flex-wrap">
      <button type="button" title="Bold" disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))}>
        <Bold className="size-3.5" />
      </button>
      <button type="button" title="Italic" disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))}>
        <Italic className="size-3.5" />
      </button>
      <button type="button" title="Strikethrough" disabled={disabled} onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive('strike'))}>
        <Strikethrough className="size-3.5" />
      </button>
      <div className="w-px h-4 bg-[var(--color-border-subtle)] mx-1" />
      <button type="button" title="Bullet list" disabled={disabled} onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))}>
        <List className="size-3.5" />
      </button>
      <button type="button" title="Numbered list" disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))}>
        <ListOrdered className="size-3.5" />
      </button>
      <div className="w-px h-4 bg-[var(--color-border-subtle)] mx-1" />
      <button type="button" title="Link" disabled={disabled} onClick={toggleLink} className={btn(editor.isActive('link'))}>
        <Link2 className="size-3.5" />
      </button>
      <button type="button" title="Attach image" onClick={onAttach} disabled={disabled || uploading} className={btn(false)}>
        {uploading
          ? <Loader2 className="size-3.5 animate-spin" />
          : <ImagePlus className="size-3.5" />}
      </button>
      <span className="ml-auto text-2xs text-tertiary hidden sm:inline">
        @ to mention · paste or drop images
      </span>
    </div>
  )
}

// ── Editor ─────────────────────────────────────────────────────────────────────

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({
    mentionables,
    uploadPrefix,
    onChange,
    initialContent,
    placeholder = 'Write something…',
    disabled = false,
    autoFocus = false,
    onSubmitShortcut,
    onEscape,
    contentClassName,
    footer,
  }, ref) {
    const fileInputRef    = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const uploadingRef    = useRef(false)
    const mentionablesRef = useRef(mentionables)
    const onChangeRef     = useRef(onChange)
    mentionablesRef.current = mentionables
    onChangeRef.current     = onChange

    function emit(ed: Editor) {
      onChangeRef.current({
        html:      ed.getHTML(),
        mentions:  extractMentions(ed.getJSON()),
        isEmpty:   ed.isEmpty,
        uploading: uploadingRef.current,
      })
    }

    const editor = useEditor({
      immediatelyRender: false,
      autofocus: autoFocus ? 'end' : false,
      editable: !disabled,
      extensions: [
        StarterKit.configure({ heading: false, horizontalRule: false }),
        Placeholder.configure({ placeholder }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        }),
        Image,
        Mention.configure({
          HTMLAttributes: { class: 'mention' },
          suggestion: buildMentionSuggestion(() => mentionablesRef.current),
        }),
      ],
      content: initialContent ?? '',
      onCreate: ({ editor: ed }) => emit(ed),
      onUpdate: ({ editor: ed }) => emit(ed),
      editorProps: {
        attributes: { class: 'rich-text' },
        handlePaste: (_view, event) => {
          const images = Array.from(event.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'))
          if (images.length === 0) return false
          event.preventDefault()
          void insertImages(images)
          return true
        },
        handleDrop: (_view, event) => {
          const images = Array.from(event.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'))
          if (images.length === 0) return false
          event.preventDefault()
          void insertImages(images)
          return true
        },
      },
    })

    const editorRef = useRef(editor)
    editorRef.current = editor

    useEffect(() => {
      editor?.setEditable(!disabled)
    }, [editor, disabled])

    useImperativeHandle(ref, () => ({
      clear: () => { editorRef.current?.commands.clearContent(true) },
    }), [])

    function setUploadingState(value: boolean) {
      uploadingRef.current = value
      setUploading(value)
      if (editorRef.current) emit(editorRef.current)
    }

    async function insertImages(files: File[]) {
      setUploadingState(true)
      try {
        for (const file of files) {
          const url = await uploadImage(file, uploadPrefix)
          if (url) editorRef.current?.chain().focus().setImage({ src: url }).run()
        }
      } finally {
        setUploadingState(false)
      }
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
      const files = Array.from(e.target.files ?? [])
      e.target.value = ''
      if (files.length > 0) void insertImages(files)
    }

    if (!editor) return null

    return (
      <div className="comment-editor bg-bg-surface-3 border border-subtle rounded-md focus-within:border-brand transition-colors">
        <Toolbar
          editor={editor}
          onAttach={() => fileInputRef.current?.click()}
          uploading={uploading}
          disabled={disabled}
        />

        <EditorContent
          editor={editor}
          className={contentClassName}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && onSubmitShortcut) {
              e.preventDefault()
              onSubmitShortcut()
            }
            if (e.key === 'Escape' && onEscape) onEscape()
          }}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        {footer}
      </div>
    )
  },
)
```

- [ ] **Step 2: Write `RichTextBody`**

Create `src/components/modules/editor/RichTextBody.tsx`:

```tsx
'use client'
/**
 * RICH TEXT BODY — sanitised renderer shared by comments and messages
 * ─────────────────────────────────────────────────────────────────────────────
 * Editor output always starts with an HTML tag. Anything that doesn't is a
 * legacy plain-text body (comments before rich text, messages before 021) and
 * renders as text with line breaks preserved — never as HTML.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 's', 'u', 'a', 'ul', 'ol', 'li',
    'img', 'span', 'code', 'pre', 'blockquote',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'data-type', 'data-id', 'data-label'],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):|^\//i,
}

interface RichTextBodyProps {
  body:  string
  size?: 'xs' | 'sm' | undefined
}

export function RichTextBody({ body, size = 'xs' }: RichTextBodyProps) {
  const textClass = size === 'sm' ? 'text-sm text-primary' : 'text-xs text-secondary'

  if (!body.trimStart().startsWith('<')) {
    return (
      <p className={cn(textClass, 'leading-relaxed whitespace-pre-wrap break-words')}>
        {body}
      </p>
    )
  }

  const clean = DOMPurify.sanitize(body, SANITIZE_CONFIG)

  return (
    <div
      className={cn('rich-text', textClass, 'leading-relaxed break-words')}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
```

- [ ] **Step 3: Rewrite `CommentBody` as a wrapper**

Replace the entire contents of `src/components/modules/projects/CommentBody.tsx` with:

```tsx
'use client'
/**
 * COMMENT BODY — renders a task comment through the shared RichTextBody.
 */
import { RichTextBody } from '@/components/modules/editor/RichTextBody'

interface CommentBodyProps {
  body: string
}

export function CommentBody({ body }: CommentBodyProps) {
  return <RichTextBody body={body} size="xs" />
}
```

- [ ] **Step 4: Rewrite `CommentEditor` as a wrapper**

Replace the entire contents of `src/components/modules/projects/CommentEditor.tsx` with:

```tsx
'use client'
/**
 * COMMENT EDITOR — task comments, built on the shared RichTextEditor
 * ─────────────────────────────────────────────────────────────────────────────
 * Adds Post / Cancel and clears after posting. Mentionable: project members plus
 * admins (admins oversee every project, roster or not — the same boundary
 * notifyMentions enforces server-side). Props are unchanged from the pre-split
 * component, so TodoItem needs no edits.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import {
  RichTextEditor, type RichTextEditorHandle, type RichTextValue,
} from '@/components/modules/editor/RichTextEditor'
import type { ProjectMember, User } from '@/types'

interface CommentEditorProps {
  taskId:          string
  members:         (ProjectMember & { user: User })[]
  admins:          User[]
  onSubmit:        (html: string, mentions: string[]) => void
  onCancel?:       (() => void) | undefined
  initialContent?: string | undefined
  submitLabel?:    string | undefined
  autoFocus?:      boolean | undefined
}

export function CommentEditor({
  taskId,
  members,
  admins,
  onSubmit,
  onCancel,
  initialContent,
  submitLabel = 'Post',
  autoFocus = false,
}: CommentEditorProps) {
  const editorRef = useRef<RichTextEditorHandle>(null)
  const [value, setValue] = useState<RichTextValue>({
    html: '', mentions: [], isEmpty: true, uploading: false,
  })

  const mentionables = useMemo(() => {
    const items = members.map(m => ({ id: m.user_id, name: m.user.name }))
    for (const a of admins) {
      if (!items.some(i => i.id === a.id)) items.push({ id: a.id, name: a.name })
    }
    return items.sort((a, b) => a.name.localeCompare(b.name))
  }, [members, admins])

  function handleSubmit() {
    if (value.isEmpty || value.uploading) return
    const { html, mentions } = value
    editorRef.current?.clear()
    onSubmit(html, mentions)
  }

  return (
    <RichTextEditor
      ref={editorRef}
      mentionables={mentionables}
      uploadPrefix={`tasks/${taskId}`}
      onChange={setValue}
      initialContent={initialContent}
      placeholder="Write a comment..."
      autoFocus={autoFocus}
      onSubmitShortcut={handleSubmit}
      onEscape={onCancel}
      footer={
        <div className="flex items-center justify-end gap-2 px-2 py-1.5 border-t border-subtle">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="h-7 px-2 text-xs text-secondary hover:text-primary active:opacity-70 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={value.isEmpty || value.uploading}
            className="flex items-center gap-1.5 h-7 px-3 text-xs bg-brand text-bg-base font-medium rounded-md hover:bg-brand/90 active:scale-[0.98] disabled:opacity-40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Send className="size-3" /> {submitLabel}
          </button>
        </div>
      }
    />
  )
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit` — expected exit 0.
Run: `npm run lint` — expected: only the pre-existing warning in `src/components/ui/confirm-dialog.tsx`.

- [ ] **Step 6: Confirm comment call sites are untouched**

Run: `git diff --stat HEAD -- src/components/modules/projects/TodoItem.tsx`
Expected: no output — `TodoItem` still compiles against the unchanged wrapper props.

- [ ] **Step 7: Commit**

```bash
git add src/components/modules/editor/RichTextEditor.tsx src/components/modules/editor/RichTextBody.tsx src/components/modules/projects/CommentEditor.tsx src/components/modules/projects/CommentBody.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Extract shared RichTextEditor and RichTextBody from task comments

The editor becomes a form field reporting html, mentions, emptiness and
upload state; CommentEditor and CommentBody are thin wrappers with unchanged
props. Upload failures now toast instead of a native alert(). Mentionables
are read through a ref so a caller can change them without a remount.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Message rules and Server Actions

**Files:**
- Rewrite: `src/lib/messages.ts`
- Rewrite: `src/app/(portal)/projects/message-actions.ts`
- Create: `src/app/(portal)/projects/message-category-actions.ts`
- Modify: `src/components/modules/projects/MessageComposeModal.tsx` (two call sites only — keeps the build green until Task 5 rewrites it)

**Interfaces:**
- Consumes: migration 021 columns and triggers (Task 1); `sendPushToUsers` from `@/lib/push`; `createAdminClient` from `@/lib/supabase/admin`; `getSiteUrl` from `@/lib/site-url`.
- Produces:

```ts
// src/lib/messages.ts
export const MESSAGE_TITLE_MAX = 200
export const MESSAGE_BODY_MAX = 20_000
export const MESSAGE_MENTIONS_MAX = 50
export const CATEGORY_NAME_MAX = 40
export const CATEGORY_EMOJI_MAX = 16
export interface MessageDraft { title: string; bodyHtml: string; mentions: string[]; categoryId: string | null }
export function messageDraftError(draft: MessageDraft): string | null
export function categoryDraftError(input: { name: string; emoji: string }): string | null
export function normalizeMentions(ids: string[]): string[]
export function htmlToText(body: string): string
export function messageExcerpt(body: string, max?: number): string
export function plainTextToHtml(text: string): string
export function isEdited(message: { created_at: string; updated_at: string }): boolean

// message-actions.ts
export async function createMessage(projectId: string, draft: MessageDraft & { isClientVisible: boolean }): Promise<string>
export async function updateMessage(messageId: string, projectId: string, draft: MessageDraft): Promise<void>
export async function deleteMessage(messageId: string, projectId: string): Promise<void>

// message-category-actions.ts
export async function createCategory(input: { name: string; emoji: string }): Promise<void>
export async function updateCategory(id: string, input: { name: string; emoji: string }): Promise<void>
export async function reorderCategories(orderedIds: string[]): Promise<void>
export async function archiveCategory(id: string): Promise<void>
export async function restoreCategory(id: string): Promise<void>
```

- [ ] **Step 1: Rewrite the shared rules**

Replace the entire contents of `src/lib/messages.ts` with:

```ts
/**
 * MESSAGE BOARD — SHARED RULES
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure helpers used by the Server Actions and the compose modal, so the client
 * validates with exactly the rules the server enforces. Production Next.js
 * redacts thrown Server Action messages, so anything a person can fix must be
 * caught client-side with these first. The numeric limits mirror database
 * checks in migrations 020 and 021 — change them together.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const MESSAGE_TITLE_MAX    = 200
export const MESSAGE_BODY_MAX     = 20_000
export const MESSAGE_MENTIONS_MAX = 50
export const CATEGORY_NAME_MAX    = 40
export const CATEGORY_EMOJI_MAX   = 16

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface MessageDraft {
  title:      string
  bodyHtml:   string
  mentions:   string[]
  categoryId: string | null
}

/** Editor output always starts with a tag; anything else is legacy plain text. */
function isHtml(body: string): boolean {
  return body.trimStart().startsWith('<')
}

/** Visible text of a body — tags stripped, common entities decoded, whitespace collapsed. */
export function htmlToText(body: string): string {
  if (!isHtml(body)) return body.replace(/\s+/g, ' ').trim()
  return body
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|li|blockquote|pre)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function isBodyEmpty(body: string): boolean {
  return htmlToText(body).length === 0 && !/<img\b/i.test(body)
}

export function normalizeMentions(ids: string[]): string[] {
  return Array.from(new Set(ids))
}

/** Returns a human-readable problem, or null when the draft is valid. */
export function messageDraftError(draft: MessageDraft): string | null {
  const title = draft.title.trim()
  if (!title) return 'Give the message a title.'
  if (title.length > MESSAGE_TITLE_MAX) return `Titles can be at most ${MESSAGE_TITLE_MAX} characters.`
  if (isBodyEmpty(draft.bodyHtml)) return 'Write something in the message.'
  if (draft.bodyHtml.length > MESSAGE_BODY_MAX) {
    return 'This message is too long. Shorten it or remove some formatting.'
  }
  if (draft.mentions.length > MESSAGE_MENTIONS_MAX) {
    return `You can mention at most ${MESSAGE_MENTIONS_MAX} people.`
  }
  if (!draft.mentions.every(id => UUID_RE.test(id))) return 'A mention in this message is invalid.'
  if (draft.categoryId !== null && !UUID_RE.test(draft.categoryId)) return 'That category is invalid.'
  return null
}

export function categoryDraftError({ name, emoji }: { name: string; emoji: string }): string | null {
  const n = name.trim()
  const e = emoji.trim()
  if (!n) return 'Give the category a name.'
  if (n.length > CATEGORY_NAME_MAX) return `Category names can be at most ${CATEGORY_NAME_MAX} characters.`
  if (!e) return 'Pick an emoji for the category.'
  if (e.length > CATEGORY_EMOJI_MAX) return 'Use a single emoji.'
  return null
}

/** Plain-text preview for message cards. */
export function messageExcerpt(body: string, max = 240): string {
  const text = htmlToText(body)
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

/** Converts a legacy plain-text body into editor HTML so it can be edited. */
export function plainTextToHtml(text: string): string {
  if (isHtml(text)) return text
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text
    .split(/\r?\n/)
    .map(line => `<p>${escape(line)}</p>`)
    .join('')
}

/** updated_at equals created_at on insert; migration 002's trigger bumps it on every update. */
export function isEdited(message: { created_at: string; updated_at: string }): boolean {
  return new Date(message.updated_at).getTime() > new Date(message.created_at).getTime()
}
```

- [ ] **Step 2: Rewrite the message Server Actions**

Replace the entire contents of `src/app/(portal)/projects/message-actions.ts` with:

```ts
'use server'
/**
 * MESSAGE BOARD SERVER ACTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Authorisation lives in migrations 020/021 (RLS + triggers). These actions:
 *
 *   1. Check row counts on update/delete — an RLS USING mismatch returns zero
 *      rows WITHOUT an error.
 *   2. Deliver push and email for exactly the notification rows the triggers
 *      created. now() is fixed for a transaction, so those rows' created_at
 *      equals the message's created_at (insert) or updated_at (update). The
 *      timestamp is read back from the database, never the app server clock.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Resend } from 'resend'
import { sendPushToUsers } from '@/lib/push'
import { getSiteUrl } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  messageDraftError, normalizeMentions, type MessageDraft,
} from '@/lib/messages'

export async function createMessage(
  projectId: string,
  draft: MessageDraft & { isClientVisible: boolean },
): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const mentions = normalizeMentions(draft.mentions)
  const problem  = messageDraftError({ ...draft, mentions })
  if (problem) throw new Error(problem)

  const { data: profile, error: profileError } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profileError) console.error('[messages] Failed to read author profile:', profileError)
  const isClient = profile?.role === 'client'

  const { data: inserted, error } = await supabase
    .from('messages')
    .insert({
      project_id:        projectId,
      author_id:         user.id,
      title:             draft.title.trim(),
      body:              draft.bodyHtml,
      mentions,
      category_id:       draft.categoryId,
      // Clients may only post shared. RLS enforces this too.
      is_client_visible: isClient ? true : draft.isClientVisible,
    })
    .select('id, title, created_at')
    .single()

  if (error || !inserted) throw new Error(error?.message ?? 'Could not post the message.')

  await deliverNotifications(inserted.id, inserted.title, projectId, inserted.created_at)

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

  const mentions = normalizeMentions(draft.mentions)
  const problem  = messageDraftError({ ...draft, mentions })
  if (problem) throw new Error(problem)

  // Visibility is deliberately not a parameter — it is locked after posting.
  const { data, error } = await supabase
    .from('messages')
    .update({
      title:       draft.title.trim(),
      body:        draft.bodyHtml,
      mentions,
      category_id: draft.categoryId,
    })
    .eq('id', messageId)
    .select('id, title, updated_at')

  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row) throw new Error('You can only edit your own messages.')

  await deliverNotifications(row.id, row.title, projectId, row.updated_at)

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

// ── Delivery ───────────────────────────────────────────────────────────────────

interface NotificationRow {
  user_id: string
  type:    string
  actor:   { name: string } | null
}

/**
 * Best-effort: never fails the post. Service-role client because notification
 * rows are readable only by their owner.
 */
async function deliverNotifications(
  messageId: string,
  title: string,
  projectId: string,
  writtenAt: string,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('notifications')
      .select('user_id, type, actor:users!notifications_actor_id_fkey(name)')
      .eq('message_id', messageId)
      .eq('created_at', writtenAt)
    if (error) throw error

    const rows      = (data ?? []) as unknown as NotificationRow[]
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
      title: `${actorName} mentioned you`,
      body:  title,
      url,
    })
    await emailMentions(admin, mentionRecipients, actorName, title, url)
  } catch (err) {
    console.error('[messages] Failed to deliver notifications:', err)
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function emailMentions(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
  actorName: string,
  title: string,
  path: string,
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

  const link      = `${getSiteUrl()}${path}`
  const safeActor = escapeHtml(actorName)
  const safeTitle = escapeHtml(title)
  const resend    = new Resend(apiKey)

  const results = await Promise.all(recipients.map(r =>
    resend.emails.send({
      from:    process.env.RESEND_FROM ?? 'Weblikha Portal <onboarding@resend.dev>',
      to:      r.email,
      subject: `${actorName} mentioned you in "${title}"`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#101010;color:#ffffff;border-radius:12px;">
          <h1 style="font-size:18px;margin:0 0 16px;">${safeActor} mentioned you</h1>
          <p style="color:#b3b3b3;line-height:1.6;margin:0 0 24px;">
            You were mentioned in the message
            <strong style="color:#ffffff;">${safeTitle}</strong>.
          </p>
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

- [ ] **Step 3: Write the category Server Actions**

Create `src/app/(portal)/projects/message-category-actions.ts`:

```ts
'use server'
/**
 * MESSAGE CATEGORY SERVER ACTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin-only is enforced by migration 021's RLS. Categories are agency-wide, so
 * every project page is revalidated. Archiving replaces deleting.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { categoryDraftError } from '@/lib/messages'

const DUPLICATE_NAME = 'An active category already uses that name.'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return supabase
}

function revalidateProjects() {
  revalidatePath('/projects/[id]', 'page')
}

export async function createCategory(input: { name: string; emoji: string }): Promise<void> {
  const supabase = await requireUser()
  const problem  = categoryDraftError(input)
  if (problem) throw new Error(problem)

  const { data: last } = await supabase
    .from('message_categories')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase
    .from('message_categories')
    .insert({
      name:     input.name.trim(),
      emoji:    input.emoji.trim(),
      position: (last?.position ?? -1) + 1,
    })

  if (error) {
    if (error.code === '23505') throw new Error(DUPLICATE_NAME)
    throw new Error(error.message)
  }
  revalidateProjects()
}

export async function updateCategory(
  id: string,
  input: { name: string; emoji: string },
): Promise<void> {
  const supabase = await requireUser()
  const problem  = categoryDraftError(input)
  if (problem) throw new Error(problem)

  const { data, error } = await supabase
    .from('message_categories')
    .update({ name: input.name.trim(), emoji: input.emoji.trim() })
    .eq('id', id)
    .select('id')

  if (error) {
    if (error.code === '23505') throw new Error(DUPLICATE_NAME)
    throw new Error(error.message)
  }
  if (!data || data.length === 0) throw new Error('Only admins can edit categories.')
  revalidateProjects()
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const supabase = await requireUser()

  for (const [index, id] of orderedIds.entries()) {
    const { data, error } = await supabase
      .from('message_categories')
      .update({ position: index })
      .eq('id', id)
      .select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('Only admins can reorder categories.')
  }
  revalidateProjects()
}

export async function archiveCategory(id: string): Promise<void> {
  const supabase = await requireUser()

  const { data, error } = await supabase
    .from('message_categories')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .is('archived_at', null)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Only admins can archive categories.')
  revalidateProjects()
}

export async function restoreCategory(id: string): Promise<void> {
  const supabase = await requireUser()

  const { data, error } = await supabase
    .from('message_categories')
    .update({ archived_at: null })
    .eq('id', id)
    .select('id')

  if (error) {
    if (error.code === '23505') throw new Error(DUPLICATE_NAME)
    throw new Error(error.message)
  }
  if (!data || data.length === 0) throw new Error('Only admins can restore categories.')
  revalidateProjects()
}
```

- [ ] **Step 4: Keep the compose modal compiling**

`MessageComposeModal.tsx` is rewritten in Task 5. Until then, adapt its two action calls and its validation call to the new shapes so the build stays green.

In `src/components/modules/projects/MessageComposeModal.tsx`, replace:

```tsx
    const problem = messageDraftError({ title, body })
```

with:

```tsx
    const problem = messageDraftError({ title, bodyHtml: body, mentions: [], categoryId: null })
```

Replace:

```tsx
          const id = await createMessage(props.projectId, {
            title,
            body,
            isClientVisible: shared,
          })
```

with:

```tsx
          const id = await createMessage(props.projectId, {
            title,
            bodyHtml:        body,
            mentions:        [],
            categoryId:      null,
            isClientVisible: shared,
          })
```

Replace:

```tsx
          await updateMessage(props.message.id, props.projectId, { title, body })
```

with:

```tsx
          await updateMessage(props.message.id, props.projectId, {
            title,
            bodyHtml:   body,
            mentions:   [],
            categoryId: props.message.category_id,
          })
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit` — expected exit 0.
Run: `npm run lint` — expected: only the pre-existing `confirm-dialog.tsx` warning.

- [ ] **Step 6: Confirm the service-role boundary**

Run: `grep -rln "supabase/admin" src --include=*.tsx`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/messages.ts "src/app/(portal)/projects/message-actions.ts" "src/app/(portal)/projects/message-category-actions.ts" src/components/modules/projects/MessageComposeModal.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Message actions: rich body, mentions, categories, trigger-row delivery

Push and mention email go to exactly the rows the notify triggers created,
matched by the transaction timestamp read back from the database. Adds
admin category actions and shared validation mirroring 020/021 limits.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Category picker, manager and pill

**Files:**
- Create: `src/components/modules/projects/CategoryPicker.tsx`
- Create: `src/components/modules/projects/CategoryManagerModal.tsx`
- Create: `src/components/modules/projects/MessageCategoryPill.tsx`

**Interfaces:**
- Consumes: `MessageCategory` (Task 1); category actions and `categoryDraftError`, `CATEGORY_NAME_MAX`, `CATEGORY_EMOJI_MAX` (Task 3).
- Produces:

```ts
export function CategoryPicker(props: {
  categories: MessageCategory[]
  value: string | null
  onChange: (id: string | null) => void
  canManage: boolean
  onManage: () => void
  disabled?: boolean | undefined
}): JSX.Element

export function CategoryManagerModal(props: { categories: MessageCategory[]; onClose: () => void }): JSX.Element

export function MessageCategoryPill(props: {
  category: Pick<MessageCategory, 'id' | 'name' | 'emoji' | 'archived_at'> | null
}): JSX.Element | null
```

- [ ] **Step 1: Write the pill**

Create `src/components/modules/projects/MessageCategoryPill.tsx`:

```tsx
import type { MessageCategory } from '@/types'

interface MessageCategoryPillProps {
  category: Pick<MessageCategory, 'id' | 'name' | 'emoji' | 'archived_at'> | null
}

/** Emoji + name. Archived categories still display on the posts that use them. */
export function MessageCategoryPill({ category }: MessageCategoryPillProps) {
  if (!category) return null
  return (
    <span className="shrink-0 inline-flex items-center gap-1 text-2xs text-secondary bg-bg-surface-3 px-2 py-0.5 rounded-full">
      <span aria-hidden>{category.emoji}</span>
      {category.name}
    </span>
  )
}
```

- [ ] **Step 2: Write the picker**

Create `src/components/modules/projects/CategoryPicker.tsx`:

```tsx
'use client'
/**
 * CATEGORY PICKER
 * ─────────────────────────────────────────────────────────────────────────────
 * Button + listbox: None, then active categories by position. A post whose
 * category was since archived keeps it selected, shown as "(archived)".
 * Keyboard: arrows move, Enter/Space choose, Escape closes ONLY the list —
 * it stops propagation so the surrounding modal's Escape listener doesn't fire.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MessageCategory } from '@/types'

interface CategoryPickerProps {
  categories: MessageCategory[]
  value:      string | null
  onChange:   (id: string | null) => void
  canManage:  boolean
  onManage:   () => void
  disabled?:  boolean | undefined
}

interface Option {
  id:       string | null
  label:    string
  emoji:    string | null
  archived: boolean
}

export function CategoryPicker({
  categories, value, onChange, canManage, onManage, disabled = false,
}: CategoryPickerProps) {
  const [open, setOpen]     = useState(false)
  const [active, setActive] = useState(0)
  const rootRef    = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  const selected = categories.find(c => c.id === value) ?? null

  const options: Option[] = [
    { id: null, label: 'None', emoji: null, archived: false },
    ...(selected?.archived_at
      ? [{ id: selected.id, label: selected.name, emoji: selected.emoji, archived: true }]
      : []),
    ...categories
      .filter(c => !c.archived_at)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ id: c.id, label: c.name, emoji: c.emoji, archived: false })),
  ]

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  useEffect(() => {
    if (open) optionRefs.current[active]?.focus()
  }, [open, active])

  function openList() {
    const index = options.findIndex(o => o.id === value)
    setActive(index < 0 ? 0 : index)
    setOpen(true)
  }

  function choose(id: string | null) {
    onChange(id)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!open) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(i => (i + 1) % options.length)
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => (i - 1 + options.length) % options.length)
    }
  }

  const optionClass =
    'flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors duration-150 ' +
    'hover:bg-bg-surface-3 active:bg-bg-surface-3 focus-visible:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand'

  return (
    <div ref={rootRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex max-w-full items-center gap-1.5 h-8 px-3 rounded-md border border-subtle text-sm text-secondary hover:text-primary hover:border-[var(--color-border-default)] active:opacity-80 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="truncate">
          {selected
            ? `${selected.emoji} ${selected.name}${selected.archived_at ? ' (archived)' : ''}`
            : 'Pick a category (optional)'}
        </span>
        <ChevronDown className="size-3.5 shrink-0" aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Message category"
          className="absolute left-0 z-10 mt-1 w-full sm:w-64 card shadow-lg py-1"
        >
          {options.map((option, index) => {
            const isSelected = option.id === value
            return (
              <button
                key={option.id ?? 'none'}
                ref={el => { optionRefs.current[index] = el }}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => choose(option.id)}
                className={cn(optionClass, isSelected ? 'text-primary font-medium' : 'text-secondary')}
              >
                <span className="w-5 shrink-0 text-center" aria-hidden>{option.emoji ?? ''}</span>
                <span className="flex-1 truncate">
                  {option.label}
                  {option.archived && <span className="text-tertiary"> (archived)</span>}
                </span>
                {isSelected && <Check className="size-3.5 shrink-0 text-brand" aria-hidden />}
              </button>
            )
          })}

          {canManage && (
            <>
              <div className="my-1 border-t border-subtle" />
              <button
                type="button"
                onClick={() => { setOpen(false); onManage() }}
                className={cn(optionClass, 'text-secondary')}
              >
                <Settings2 className="size-3.5 shrink-0" aria-hidden />
                Edit categories…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Write the manager**

Create `src/components/modules/projects/CategoryManagerModal.tsx`:

```tsx
'use client'
/**
 * CATEGORY MANAGER (admins)
 * ─────────────────────────────────────────────────────────────────────────────
 * Opened on top of the compose modal. Its Escape listener runs in the CAPTURE
 * phase and stops propagation, so Escape closes only this panel — the compose
 * modal beneath listens in the bubble phase (same approach as ConfirmHost).
 * Archive is reversible and posts keep their category, so it has no confirm.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Archive, ChevronRight, Plus, RotateCcw, X } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { toast, withToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { CATEGORY_EMOJI_MAX, CATEGORY_NAME_MAX, categoryDraftError } from '@/lib/messages'
import {
  archiveCategory, createCategory, reorderCategories, restoreCategory, updateCategory,
} from '@/app/(portal)/projects/message-category-actions'
import type { MessageCategory } from '@/types'

interface CategoryManagerModalProps {
  categories: MessageCategory[]
  onClose:    () => void
}

type Draft = { name: string; emoji: string }

export function CategoryManagerModal({ categories, onClose }: CategoryManagerModalProps) {
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId]         = useState<string | null>(null)
  const [drafts, setDrafts]         = useState<Record<string, Draft>>({})
  const [newDraft, setNewDraft]     = useState<Draft>({ name: '', emoji: '' })
  const [showArchived, setShowArchived] = useState(false)

  const active   = categories.filter(c => !c.archived_at).sort((a, b) => a.position - b.position)
  const archived = categories.filter(c => c.archived_at)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (!isPending) onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [isPending, onClose])

  function valueFor(c: MessageCategory): Draft {
    return drafts[c.id] ?? { name: c.name, emoji: c.emoji }
  }

  function isDirty(c: MessageCategory): boolean {
    const d = drafts[c.id]
    return !!d && (d.name !== c.name || d.emoji !== c.emoji)
  }

  function setDraft(id: string, patch: Partial<Draft>, base: Draft) {
    setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] ?? base), ...patch } }))
  }

  function run(id: string, action: () => Promise<void>, success: string, fallback: string) {
    setBusyId(id)
    startTransition(async () => {
      await withToast(async () => {
        await action()
        toast.success(success)
      }, fallback)
      setBusyId(null)
    })
  }

  function save(c: MessageCategory) {
    const draft   = valueFor(c)
    const problem = categoryDraftError(draft)
    if (problem) {
      toast.error(problem)
      return
    }
    run(c.id, async () => {
      await updateCategory(c.id, draft)
      setDrafts(prev => {
        const next = { ...prev }
        delete next[c.id]
        return next
      })
    }, 'Category saved.', 'Could not save the category.')
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= active.length) return
    const ids = active.map(c => c.id)
    const a = ids[index]
    const b = ids[target]
    if (a === undefined || b === undefined) return
    ids[index]  = b
    ids[target] = a
    run(a, () => reorderCategories(ids), 'Order updated.', 'Could not reorder categories.')
  }

  function add() {
    const problem = categoryDraftError(newDraft)
    if (problem) {
      toast.error(problem)
      return
    }
    run('new', async () => {
      await createCategory(newDraft)
      setNewDraft({ name: '', emoji: '' })
    }, 'Category added.', 'Could not add the category.')
  }

  const iconButton =
    'p-1.5 rounded-md text-secondary hover:text-primary hover:bg-bg-surface-3 active:opacity-70 ' +
    'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' +
    'disabled:opacity-40 disabled:cursor-not-allowed'

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
        aria-label="Edit message categories"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-bg-surface-1 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-subtle">
          <h2 className="text-base font-semibold text-primary">Message categories</h2>
          <button
            onClick={() => { if (!isPending) onClose() }}
            disabled={isPending}
            className={iconButton}
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
          <p className="text-2xs text-tertiary">
            Categories are shared by every project. Tip: press Win + . or Ctrl + Cmd + Space for emoji.
          </p>

          <ul className="space-y-2">
            {active.map((c, index) => {
              const v    = valueFor(c)
              const busy = busyId === c.id
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-subtle p-2">
                  <input
                    aria-label="Emoji"
                    value={v.emoji}
                    maxLength={CATEGORY_EMOJI_MAX}
                    onChange={e => setDraft(c.id, { emoji: e.target.value }, v)}
                    disabled={isPending}
                    className="w-12 h-9 rounded-md border border-[var(--color-border-default)] bg-bg-surface-1 text-center text-base focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
                  />
                  <div className="min-w-0 flex-1">
                    <Input
                      aria-label="Name"
                      value={v.name}
                      maxLength={CATEGORY_NAME_MAX}
                      onChange={e => setDraft(c.id, { name: e.target.value }, v)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {isDirty(c) && (
                      <Button size="sm" loading={busy} disabled={isPending} onClick={() => save(c)}>
                        Save
                      </Button>
                    )}
                    <button type="button" className={iconButton} disabled={isPending || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${c.name} up`}>
                      <ArrowUp className="size-4" />
                    </button>
                    <button type="button" className={iconButton} disabled={isPending || index === active.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${c.name} down`}>
                      <ArrowDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      className={iconButton}
                      disabled={isPending}
                      onClick={() => run(c.id, () => archiveCategory(c.id), `${c.name} archived.`, 'Could not archive the category.')}
                      aria-label={`Archive ${c.name}`}
                      title="Archive"
                    >
                      <Archive className="size-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-subtle p-2">
            <input
              aria-label="New category emoji"
              placeholder="🙂"
              value={newDraft.emoji}
              maxLength={CATEGORY_EMOJI_MAX}
              onChange={e => setNewDraft(d => ({ ...d, emoji: e.target.value }))}
              disabled={isPending}
              className="w-12 h-9 rounded-md border border-[var(--color-border-default)] bg-bg-surface-1 text-center text-base focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
            />
            <div className="min-w-0 flex-1">
              <Input
                aria-label="New category name"
                placeholder="New category"
                value={newDraft.name}
                maxLength={CATEGORY_NAME_MAX}
                onChange={e => setNewDraft(d => ({ ...d, name: e.target.value }))}
                disabled={isPending}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              icon={<Plus className="size-3.5" />}
              loading={busyId === 'new'}
              disabled={isPending}
              onClick={add}
            >
              Add category
            </Button>
          </div>

          {archived.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowArchived(s => !s)}
                aria-expanded={showArchived}
                className="flex items-center gap-1 text-xs text-secondary hover:text-primary active:opacity-70 rounded transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ChevronRight className={cn('size-3.5 transition-transform duration-150', showArchived && 'rotate-90')} />
                Archived ({archived.length})
              </button>
              {showArchived && (
                <ul className="mt-2 space-y-2">
                  {archived.map(c => (
                    <li key={c.id} className="flex items-center gap-2 rounded-md border border-subtle px-3 py-2">
                      <span aria-hidden>{c.emoji}</span>
                      <span className="flex-1 truncate text-sm text-secondary">{c.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<RotateCcw className="size-3.5" />}
                        loading={busyId === c.id}
                        disabled={isPending}
                        onClick={() => run(c.id, () => restoreCategory(c.id), `${c.name} restored.`, 'Could not restore the category.')}
                      >
                        Restore
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit` — expected exit 0.
Run: `npm run lint` — expected: only the pre-existing `confirm-dialog.tsx` warning. The three components are not mounted until Task 5; that is expected.

- [ ] **Step 5: Commit**

```bash
git add src/components/modules/projects/CategoryPicker.tsx src/components/modules/projects/CategoryManagerModal.tsx src/components/modules/projects/MessageCategoryPill.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Category picker, admin category manager and category pill

Picker Escape closes only the list; the manager's Escape runs in the
capture phase so it doesn't also close the compose modal beneath it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Compose modal and data wiring

**Files:**
- Rewrite: `src/components/modules/projects/MessageComposeModal.tsx`
- Modify: `src/components/modules/projects/MessagesTab.tsx`
- Modify: `src/components/modules/projects/ProjectTabsLayout.tsx`
- Modify: `src/app/(portal)/projects/[id]/page.tsx`
- Modify: `src/types/index.ts` (`MessageWithAuthor`)

**Interfaces:**
- Consumes: `RichTextEditor`, `RichTextValue`, `MentionCandidate` (Task 2); `createMessage`, `updateMessage`, `messageDraftError`, `plainTextToHtml`, `MESSAGE_TITLE_MAX` (Task 3); `CategoryPicker`, `CategoryManagerModal` (Task 4).
- Produces: `MessageWithAuthor.category: Pick<MessageCategory, 'id' | 'name' | 'emoji' | 'archived_at'> | null`; `MessageComposeModal` props gain `categories`, `members`, `admins`; `MessagesTab` and `ProjectTabsLayout` gain `categories`.

- [ ] **Step 1: Add the category embed to the message type**

In `src/types/index.ts`, replace:

```ts
export interface MessageWithAuthor extends Message {
  author: Pick<User, 'id' | 'name' | 'avatar_url' | 'role'> | null
}
```

with:

```ts
export interface MessageWithAuthor extends Message {
  author:   Pick<User, 'id' | 'name' | 'avatar_url' | 'role'> | null
  category: Pick<MessageCategory, 'id' | 'name' | 'emoji' | 'archived_at'> | null
}
```

(Keep the existing doc comment above the interface.)

- [ ] **Step 2: Rewrite the compose modal**

Replace the entire contents of `src/components/modules/projects/MessageComposeModal.tsx` with:

```tsx
'use client'
/**
 * MESSAGE COMPOSE MODAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Create and edit. Mounted by the parent only while open.
 *
 * Order: category → title → rich-text body → visibility → footer.
 *
 * Visibility: team members get a "Visible to client" switch, OFF by default;
 * the submit button names the outcome. Clients have no switch — always shared.
 * Locked after posting (migration 020).
 *
 * Mentions: project members + approved admins. On an INTERNAL post clients are
 * removed from the list, and if the switch is turned off after a client was
 * mentioned, a note explains they won't be notified. Migration 021's trigger
 * enforces the same rule in the database.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { createMessage, updateMessage } from '@/app/(portal)/projects/message-actions'
import { MESSAGE_TITLE_MAX, messageDraftError, plainTextToHtml } from '@/lib/messages'
import {
  RichTextEditor, type MentionCandidate, type RichTextValue,
} from '@/components/modules/editor/RichTextEditor'
import { CategoryPicker } from './CategoryPicker'
import { CategoryManagerModal } from './CategoryManagerModal'
import type {
  MessageCategory, MessageWithAuthor, ProjectMember, User, UserRole,
} from '@/types'

interface SharedProps {
  projectId:  string
  viewerRole: UserRole
  categories: MessageCategory[]
  members:    (ProjectMember & { user: User })[]
  admins:     User[]
  onClose:    () => void
}

type MessageComposeModalProps =
  | (SharedProps & { mode: 'create'; onPosted: (messageId: string) => void })
  | (SharedProps & { mode: 'edit'; message: MessageWithAuthor; onSaved: () => void })

export function MessageComposeModal(props: MessageComposeModalProps) {
  const isEdit   = props.mode === 'edit'
  const isClient = props.viewerRole === 'client'
  const isAdmin  = props.viewerRole === 'admin'

  const initialHtml = props.mode === 'edit' ? plainTextToHtml(props.message.body) : ''

  const [title, setTitle] = useState(props.mode === 'edit' ? props.message.title : '')
  const [body, setBody]   = useState<RichTextValue>({
    html:      initialHtml,
    mentions:  props.mode === 'edit' ? props.message.mentions : [],
    isEmpty:   props.mode !== 'edit',
    uploading: false,
  })
  const [categoryId, setCategoryId] = useState<string | null>(
    props.mode === 'edit' ? props.message.category_id : null,
  )
  const [clientVisible, setClientVisible] = useState(
    props.mode === 'edit' ? props.message.is_client_visible : false,
  )
  const [managing, setManaging] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const shared = isClient || clientVisible

  const roleById = useMemo(() => {
    const map = new Map<string, UserRole>()
    for (const m of props.members) map.set(m.user_id, m.user.role)
    for (const a of props.admins) map.set(a.id, 'admin')
    return map
  }, [props.members, props.admins])

  const allCandidates = useMemo<MentionCandidate[]>(() => {
    const items: MentionCandidate[] = props.members.map(m => ({ id: m.user_id, name: m.user.name }))
    for (const a of props.admins) {
      if (!items.some(i => i.id === a.id)) items.push({ id: a.id, name: a.name })
    }
    return items.sort((a, b) => a.name.localeCompare(b.name))
  }, [props.members, props.admins])

  const mentionables = useMemo(
    () => (shared ? allCandidates : allCandidates.filter(c => roleById.get(c.id) !== 'client')),
    [shared, allCandidates, roleById],
  )

  const mentionsClientOnInternal =
    !shared && body.mentions.some(id => roleById.get(id) === 'client')

  const { onClose } = props
  const close = useCallback(() => {
    if (!isPending) onClose()
  }, [isPending, onClose])

  useEffect(() => {
    if (managing) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close, managing])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (body.uploading) {
      setError('Wait for images to finish uploading.')
      return
    }
    const draft = { title, bodyHtml: body.html, mentions: body.mentions, categoryId }
    const problem = messageDraftError(draft)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        if (props.mode === 'create') {
          const id = await createMessage(props.projectId, { ...draft, isClientVisible: shared })
          toast.success(shared ? 'Message posted.' : 'Posted internally.')
          props.onPosted(id)
        } else {
          await updateMessage(props.message.id, props.projectId, draft)
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
        className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-bg-surface-1 shadow-2xl flex flex-col"
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

          <CategoryPicker
            categories={props.categories}
            value={categoryId}
            onChange={setCategoryId}
            canManage={isAdmin}
            onManage={() => setManaging(true)}
            disabled={isPending}
          />

          <Input
            label="Title"
            id="message-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={MESSAGE_TITLE_MAX}
            disabled={isPending}
            placeholder="e.g. Homepage design is ready for review"
          />

          <div className="flex flex-col gap-1">
            <p className="text-xs text-secondary font-medium">Message</p>
            <RichTextEditor
              mentionables={mentionables}
              uploadPrefix={`messages/${props.projectId}`}
              onChange={setBody}
              initialContent={initialHtml}
              placeholder="Write your update or question…"
              disabled={isPending}
              contentClassName="[&_.ProseMirror]:min-h-48"
            />
            {mentionsClientOnInternal && (
              <p className="text-2xs text-warning">
                Clients mentioned here won&apos;t be notified — this post is internal.
              </p>
            )}
          </div>

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
                  'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition duration-150',
                  'hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:opacity-80',
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

      {managing && (
        <CategoryManagerModal
          categories={props.categories}
          onClose={() => setManaging(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 3: Pass the new props through `MessagesTab`**

In `src/components/modules/projects/MessagesTab.tsx`:

Replace:

```tsx
import type { MessageWithAuthor, UserRole } from '@/types'

interface MessagesTabProps {
  messages:      MessageWithAuthor[]
  projectId:     string
  currentUserId: string
  viewerRole:    UserRole
}

export function MessagesTab({ messages, projectId, currentUserId, viewerRole }: MessagesTabProps) {
```

with:

```tsx
import type {
  MessageCategory, MessageWithAuthor, ProjectMember, User, UserRole,
} from '@/types'

interface MessagesTabProps {
  messages:      MessageWithAuthor[]
  categories:    MessageCategory[]
  members:       (ProjectMember & { user: User })[]
  admins:        User[]
  projectId:     string
  currentUserId: string
  viewerRole:    UserRole
}

export function MessagesTab({
  messages, categories, members, admins, projectId, currentUserId, viewerRole,
}: MessagesTabProps) {
```

In both `<MessageComposeModal` elements (the `mode="create"` one and the `mode="edit"` one), add these three props directly after `viewerRole={viewerRole}`:

```tsx
          categories={categories}
          members={members}
          admins={admins}
```

- [ ] **Step 4: Pass them from `ProjectTabsLayout`**

In `src/components/modules/projects/ProjectTabsLayout.tsx`:

Add `MessageCategory` to the type import list from `@/types`.

In `interface ProjectTabsLayoutProps`, add after `messages: MessageWithAuthor[]`:

```tsx
  categories:       MessageCategory[]
```

Add `categories,` to the destructured parameters directly after `messages,`.

Replace:

```tsx
        <MessagesTab
          messages={messages}
          projectId={projectId}
          currentUserId={currentUserId}
          viewerRole={viewerRole}
        />
```

with:

```tsx
        <MessagesTab
          messages={messages}
          categories={categories}
          members={members}
          admins={admins}
          projectId={projectId}
          currentUserId={currentUserId}
          viewerRole={viewerRole}
        />
```

- [ ] **Step 5: Load categories and the category embed on the page**

In `src/app/(portal)/projects/[id]/page.tsx`:

Add `MessageCategory` to the `import type { … } from '@/types'` list.

Replace:

```ts
    .select('*, author: users(id, name, avatar_url, role)')
```

with:

```ts
    .select('*, author: users(id, name, avatar_url, role), category: message_categories(id, name, emoji, archived_at)')
```

Directly after the `if (messagesError) { … }` block, add:

```ts
  // Agency-wide message categories, archived included (posts still show them).
  // Non-essential: degrade to an empty picker rather than failing the page.
  const { data: categoriesRaw, error: categoriesError } = await supabase
    .from('message_categories')
    .select('*')
    .order('position', { ascending: true })
  if (categoriesError) {
    console.error('[projects/[id]] message categories fetch failed — picker will be empty:', categoriesError)
  }
  const categories = (categoriesRaw ?? []) as MessageCategory[]
```

In the `<ProjectTabsLayout` element, add directly after `messages={messages}`:

```tsx
        categories={categories}
```

- [ ] **Step 6: Typecheck, lint, build**

Run: `npx tsc --noEmit` — expected exit 0.
Run: `npm run lint` — expected: only the pre-existing `confirm-dialog.tsx` warning.
Run: `npm run build` — expected success; `/projects/[id]` dynamic.

- [ ] **Step 7: Commit**

```bash
git add src/components/modules/projects/MessageComposeModal.tsx src/components/modules/projects/MessagesTab.tsx src/components/modules/projects/ProjectTabsLayout.tsx "src/app/(portal)/projects/[id]/page.tsx" src/types/index.ts
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Compose messages with categories, rich text and mentions

Clients are dropped from the mention list on internal posts, with a note if
the post is switched internal after mentioning one. Legacy plain-text bodies
convert to editor HTML when edited. The page loads the agency-wide category
list and embeds each message's category.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Cards, detail view and notifications bell

**Files:**
- Modify: `src/components/modules/projects/MessagesTab.tsx` (card markup)
- Modify: `src/components/modules/projects/MessageDetailModal.tsx`
- Modify: `src/components/layout/NotificationsBell.tsx`

**Interfaces:**
- Consumes: `MessageCategoryPill` (Task 4); `messageExcerpt` (Task 3); `RichTextBody` (Task 2); `MessageWithAuthor.category` (Task 5).

- [ ] **Step 1: Category pill and excerpt on cards**

In `src/components/modules/projects/MessagesTab.tsx`, add to the imports:

```tsx
import { isEdited, messageExcerpt } from '@/lib/messages'
import { MessageCategoryPill } from './MessageCategoryPill'
```

and remove the now-duplicated line `import { isEdited } from '@/lib/messages'`.

Replace:

```tsx
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="min-w-0 text-sm font-medium text-primary truncate">{msg.title}</h3>
```

with:

```tsx
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <MessageCategoryPill category={msg.category} />
                    <h3 className="min-w-0 text-sm font-medium text-primary truncate">{msg.title}</h3>
```

Replace:

```tsx
                  <p className="text-xs text-secondary line-clamp-2 leading-relaxed break-words">
                    {msg.body}
                  </p>
```

with:

```tsx
                  <p className="text-xs text-secondary line-clamp-2 leading-relaxed break-words">
                    {messageExcerpt(msg.body)}
                  </p>
```

- [ ] **Step 2: Pill and rich body in the detail modal**

In `src/components/modules/projects/MessageDetailModal.tsx`, add to the imports:

```tsx
import { RichTextBody } from '@/components/modules/editor/RichTextBody'
import { MessageCategoryPill } from './MessageCategoryPill'
```

Replace:

```tsx
          {!isClient && (
            message.is_client_visible ? (
```

with:

```tsx
          <div className="flex flex-wrap items-center gap-2">
          <MessageCategoryPill category={message.category} />
          {!isClient && (
            message.is_client_visible ? (
```

Replace:

```tsx
                <Lock className="size-3" aria-hidden /> Internal only
              </span>
            )
          )}

          <p className="text-sm text-primary leading-relaxed whitespace-pre-wrap break-words">
            {message.body}
          </p>
```

with:

```tsx
                <Lock className="size-3" aria-hidden /> Internal only
              </span>
            )
          )}
          </div>

          <RichTextBody body={message.body} size="sm" />
```

- [ ] **Step 3: Bell renders and routes `message_mention`**

In `src/components/layout/NotificationsBell.tsx`, in `function describe`, add before `default:`:

```tsx
    case 'message_mention':
      return { lead: ' mentioned you in ', subject: n.message?.title ?? 'a message' }
```

Replace:

```tsx
      n.type === 'client_message' && n.message_id
```

with:

```tsx
      (n.type === 'client_message' || n.type === 'message_mention') && n.message_id
```

Replace:

```tsx
                        {n.type === 'mention'
```

with:

```tsx
                        {n.type === 'mention' || n.type === 'message_mention'
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit` — expected exit 0.
Run: `npm run lint` — expected: only the pre-existing `confirm-dialog.tsx` warning.

- [ ] **Step 5: Commit**

```bash
git add src/components/modules/projects/MessagesTab.tsx src/components/modules/projects/MessageDetailModal.tsx src/components/layout/NotificationsBell.tsx
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Show categories and rich bodies; bell handles message mentions

Cards show a category pill and a plain-text excerpt, since clamping rendered
HTML breaks formatting. The detail view renders the sanitised rich body.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Docs, verification, apply

**Files:**
- Modify: `CLAUDE.md`
- Modify: `MEMORY.md`

Steps 1–5 are agent work. Steps 6–8 need database passwords and a browser and are Matthew's.

- [ ] **Step 1: Update CLAUDE.md**

- Migration log: after the `020 message board …` entry add `021 message categories + mentions (message_categories, messages.category_id/mentions, message_mention)`.
- Database schema intro: change the migration range `019` → `021`.
- Core tables block: under `messages`, change the line to `messages            id, project_id, author_id, title, body (rich-text HTML), is_client_visible, category_id, mentions uuid[], timestamps`, and add a new line after it: `message_categories  id, name, emoji, position, archived_at, timestamps (agency-wide; admin-editable; archived not deleted)`.
- Notifications row: types list becomes `mention|task_assigned|client_task|client_message|message_mention`.
- Project structure: under `components/`, add `│   ├── modules/editor/   RichTextEditor (shared TipTap field), RichTextBody (sanitised renderer)`; under `projects/`, add `message-category-actions.ts  Server Actions: create/update/reorder/archive/restore categories`.
- RLS summary, Messages bullet: append `Categories are readable by any approved user and editable only by admins. A @mention on an internal post never notifies a client (notify_message_mentions).`

- [ ] **Step 2: Update MEMORY.md**

- `Last synced` → `2026-09-17`.
- Stage 3 section: append a paragraph: *"Extended 2026-09-17 (spec `docs/superpowers/specs/2026-09-17-message-board-richtext-categories-design.md`): rich-text bodies via a shared `RichTextEditor`/`RichTextBody` also used by task comments; @mentions of project members and admins with bell, push and email; agency-wide admin-editable categories that archive rather than delete. Clients are never mentionable or notified on internal posts. Migration 021."*
- "What Matthew still has to do" open list: replace the 020 item with *"Apply 021 to dev (020 already applied there). Before merging: apply 020 then 021 to prod."*

- [ ] **Step 3: Full check and build**

Run: `npm run check` — expected exit 0, only the pre-existing lint warning.
Run: `npm run build` — expected success.

- [ ] **Step 4: Commit docs**

```bash
git add CLAUDE.md MEMORY.md
git -c user.name="Matthew Kim" -c user.email="weblikhadigital@gmail.com" commit --author="Matthew Kim <weblikhadigital@gmail.com>" -m "Docs: message board rich text, mentions, categories; migration 021

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Review agents**

Dispatch `schema-reviewer` and `rls-security-reviewer` on `021_message_categories_mentions.sql`, `message-actions.ts` and `message-category-actions.ts`; `ui-convention-checker` and `design-token-auditor` on the editor components, `CategoryPicker`, `CategoryManagerModal`, `MessageCategoryPill`, `MessageComposeModal`, `MessagesTab`, `MessageDetailModal`. Fix Critical and Important findings before step 6.

- [ ] **Step 6 (Matthew): Apply 021 to dev**

First, in the dev SQL Editor, expect `0`:

```sql
select count(*) from public.messages
where char_length(btrim(title)) not between 1 and 200
   or char_length(body) not between 1 and 20000;
```

Then in PowerShell, with the dev session pooler URL on the clipboard:

```powershell
$env:DB_URL = Get-Clipboard
$env:DB_URL -replace ':[^:@/]+@', ':***@'
npx supabase migration list --db-url $env:DB_URL
npx supabase db push --db-url $env:DB_URL
npx supabase migration list --db-url $env:DB_URL
Remove-Item Env:DB_URL
```

Expected: masked URL shows `tydreidoqzndxjftpyzd`; first list shows only 021 unapplied; last list shows 001–021 matched.

- [ ] **Step 7 (Matthew): Manual checklist on dev**

1. Bold, a list, a link and a pasted image render in the detail view.
2. Mention a teammate → they get one bell notification and a push; re-saving without changes does not notify again; adding another mention notifies only the new person.
3. On an internal post, clients are absent from the @ list; switching a post to internal after mentioning a client shows the "won't be notified" note.
4. A client's post that mentions an admin gives that admin one notification, not two.
5. Pick a category → pill on the card and detail view. As admin, "Edit categories…" → add, rename, reorder, archive (disappears from picker, old posts still show it), restore. A duplicate active name is rejected.
6. A message posted before 021 still displays, with line breaks.
7. Task comments still post, edit, mention and paste images exactly as before.
8. Every item from the first message board checklist still passes.

- [ ] **Step 8 (Matthew): Prod, before merging**

In the prod SQL Editor run the same count query (expect `0`), then apply with the prod URL (masked URL must show `vhsuyouczctnkvnnjzgg`). Prod has neither 020 nor 021, so `migration list` should show both unapplied and `db push` applies both, in order. Only then merge.
