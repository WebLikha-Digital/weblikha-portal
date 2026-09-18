# Message Board — Rich Text, Mentions and Categories

**Date:** 2026-09-17
**Status:** Approved design, not yet implemented
**Branch:** `feature/message-board` (extends Stage 3, not yet merged)
**Builds on:** `docs/superpowers/specs/2026-09-17-message-board-design.md` and migration 020

---

## Purpose

Stage 3 shipped plain-text posts. Testing on dev showed three gaps against the reference
(Basecamp): bodies need formatting and images like task comments have; people need to
@mention anyone on the project; and posts need a category so readers get the gist at a
glance.

## Decisions

| Decision | Chosen | Rejected, and why |
|---|---|---|
| Editor | **Extract a shared `RichTextEditor` + `RichTextBody`** from the task-comment editor; comments and messages both use them | Copying the 400-line editor duplicates the sanitiser, which is security-critical and would drift. Making `CommentEditor` configurable in place leaves a misnamed, branch-heavy component |
| Category scope | **One agency-wide list, admin-editable** | A fixed list in code needs a deploy to change. Per-project lists need seeding per project and aren't comparable |
| Removing a category | **Archive** — hidden from the picker, still shown on existing posts, restorable | Falling back to None erases information from past posts. Blocking removal while in use forces recategorising old posts |
| Mentions on internal posts | **Clients are never mentionable or notifiable** — excluded in the UI and dropped by the database trigger | Notifying a client about a post they cannot read leaks its existence and title |
| Mention delivery | **Bell + push + email**, same as comment mentions | — |
| Who picks a category | **Anyone who can post, clients included**; only admins edit the list | — |
| Existing plain-text messages | **Rendered as plain text by the renderer**, not rewritten | A data migration to HTML is riskier than a render-time fallback |

## Out of scope

- Filtering the board by category
- Replies on messages
- Per-project categories
- Making the `comment-attachments` bucket private. It is public-read today for comments;
  images in internal posts are unguessable-UUID URLs but not RLS-protected. Signed URLs
  would have to change comments too.

---

## 1. Database — migration `021_message_categories_mentions.sql`

Migration 020 is already applied on dev, so this is a new migration. Idempotent house style:
banner comments explaining why, `drop … if exists` before every create, every function pins
`set search_path = public, pg_temp`, RLS through helpers.

### 1a. `public.message_categories`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` pk, `default gen_random_uuid()` | |
| `name` | `text not null` | `check (char_length(btrim(name)) between 1 and 40)` |
| `emoji` | `text not null` | `check (char_length(btrim(emoji)) between 1 and 16)` |
| `position` | `integer not null default 0` | Picker order |
| `archived_at` | `timestamptz` | Null = active |
| `created_at`, `updated_at` | `timestamptz not null default now()` | `set_updated_at` trigger |

- Unique index on `lower(btrim(name)) where archived_at is null` — names unique among active
  categories, so an archived "Pitch" does not block a new one.
- Seed rows, inserted only if absent: 📢 Announcement (0), ✨ FYI (1), 💗 Heartbeat (2),
  💡 Pitch (3), 👋 Question (4). "None" is not a row — it is a null `category_id`.
- RLS enabled. Policies:
  - `message_categories: approved read` — select, `using (public.is_approved_member())`.
  - `message_categories: admin inserts` — insert, `with check (public.is_admin())`.
  - `message_categories: admin updates` — update, `using` and `with check` `public.is_admin()`.
  - **No delete policy.** Archiving replaces deletion.

### 1b. `messages.category_id`

`uuid references public.message_categories(id) on delete restrict`, nullable, plus
`idx_messages_category_id`. `on delete restrict` means a category in use cannot be
hard-deleted even outside RLS.

Trigger `messages_guard_archived_category` (`before insert or update`) raises `42501` when
`new.category_id` refers to an archived category **and** either the operation is an insert,
or it is an update where `new.category_id is distinct from old.category_id`. An existing post keeps an archived
category when other fields are edited. Authors may change `category_id` on edit — unlike
visibility, it is not locked by 020's guard, which is unchanged.

### 1c. `messages.mentions`

`uuid[] not null default '{}'`, matching `task_comments.mentions`.

### 1d. Body length

Drop 020's `messages_body_length` and recreate it `NOT VALID` as
`char_length(body) between 1 and 20000`, matching comments' limit — HTML markup inflates
length. Emptiness of rich content is validated in the application (§2). `NOT VALID` keeps
legacy rows from failing on apply; the pre-apply count query (see Verification) covers the
`ON DELETE SET NULL` case.

### 1e. Notification type

Widen `notifications_type_check` to
`('mention', 'task_assigned', 'client_task', 'client_message', 'message_mention')`.

### 1f. `notify_message_mentions` trigger

`public.notify_message_mentions()`, `security definer`, trigger
`messages_notify_mentions` **after insert or update of `mentions`**.

Candidates are the ids in `new.mentions` that are not in `old.mentions` (all of
`new.mentions` on insert). A candidate becomes a `message_mention` notification
(`user_id`, `actor_id = new.author_id`, `project_id`, `message_id`) only if:

- it is not the author, **and**
- it is an approved member of `new.project_id` **or** an approved admin, **and**
- **if `new.is_client_visible = false`, its role is not `client`**, **and**
- no notification already exists for that user and `new.id` (prevents a double
  notification when a client's post also mentions a team member).

The last rule depends on trigger order: Postgres fires same-event triggers in name order, so
`messages_notify_client_message` runs before `messages_notify_mentions`. Record this in the
migration comment so a rename does not silently break de-duplication.

---

## 2. Shared editor, mentions, Server Actions

### 2a. `src/components/modules/editor/RichTextEditor.tsx`

`'use client'`. The toolbar, @mention suggestion list and image paste/drop/attach extracted
from `CommentEditor`. A form field, not a form:

```ts
interface MentionCandidate { id: string; name: string }

interface RichTextEditorProps {
  initialContent?: string
  mentionables:    MentionCandidate[]
  uploadPrefix:    string            // e.g. `tasks/${taskId}` or `messages/${projectId}`
  placeholder?:    string
  disabled?:       boolean
  onChange:        (value: { html: string; mentions: string[]; isEmpty: boolean }) => void
  onSubmitShortcut?: () => void      // Ctrl/Cmd+Enter, used by comments
}
```

- Uploads go to the existing `comment-attachments` bucket at `${uploadPrefix}/${uuid}.${ext}`.
  Existing comment image URLs keep working.
- Upload failures use `toast.error`, replacing the native `alert()` (a standing-rule fix).
- `mentionables` changing after mount must update the suggestion list without remounting.

### 2b. `src/components/modules/editor/RichTextBody.tsx`

The DOMPurify config moved from `CommentBody`. If the body does not start with a tag
(`body.trimStart().startsWith('<')` is false — the existing comment rule), render it as escaped plain text with
`whitespace-pre-wrap` — this is how pre-021 messages display.

`CommentEditor` and `CommentBody` become thin wrappers over these two, keeping their current
props so `TodoItem` is unchanged.

### 2c. Mention candidates for messages

- Source: project members plus approved admins, both already loaded by the project page.
- Team member composing an **internal** post: clients excluded from `mentionables`.
  If the toggle is switched to internal while client mentions exist in the body, show inline:
  *"Clients mentioned here won't be notified — this post is internal."*
- Client composing: always shared, so every candidate is available.

### 2d. `message-actions.ts`

- `createMessage(projectId, { title, bodyHtml, mentions, categoryId, isClientVisible }): Promise<string>`
- `updateMessage(messageId, projectId, { title, bodyHtml, mentions, categoryId }): Promise<void>`
  — visibility still not accepted.
- Validation (shared helper in `src/lib/messages.ts`, used client- and server-side):
  title 1–200 after trim; body not empty once tags are stripped, where an `<img>` counts as
  content; `bodyHtml.length <= 20000`; `mentions` are UUIDs, de-duplicated, at most 50;
  `categoryId` is a UUID or null.
- Existing row-count checks on update and delete stay.

**Push and email from trigger rows.** `now()` is fixed for a transaction, so notification
rows created by the triggers have `created_at` equal to the message's `created_at` (insert)
or `updated_at` (update, set by 002's `set_messages_updated_at`). The insert must
`.select('id, title, created_at')` and the update `.select('id, title, updated_at')` so the
timestamp comes back from the database rather than the app server's clock. After the write,
select with that timestamp, via the service-role client:

```
notifications where message_id = <id> and created_at = <timestamp>
```

- `client_message` → push *"New message from {client}"*, body = post title.
- `message_mention` → push *"{author} mentioned you in {title}"*, plus a mention email via
  Resend (skipped with a console warning when `RESEND_API_KEY` is unset, like comments).
- URL for both: `/projects/{projectId}?tab=messages&message={messageId}`.
- Best-effort in `try/catch`; never fails the post.

### 2e. `message-category-actions.ts`

`'use server'`: `createCategory({ name, emoji })`, `updateCategory(id, { name?, emoji?, position? })`,
`archiveCategory(id)`, `restoreCategory(id)`. Admin-only is enforced by RLS; update-style
actions use `.select('id')` row-count checks. `restoreCategory` surfaces the unique-name
conflict as *"An active category already uses that name."*

### 2f. Data and types

- Project page loads `message_categories` ordered by `position`, archived included.
- Messages query adds `category:message_categories(id, name, emoji, archived_at)`.
- Types: `MessageCategory`; `Message` gains `category_id` and `mentions`;
  `MessageWithAuthor` gains `category`; `NotificationType` gains `'message_mention'`.

---

## 3. UI

### Compose modal (create and edit)

Top to bottom:

1. **Category picker** — button reading *"Pick a category (optional)"* or the chosen
   *"📢 Announcement"*. Dropdown: **None ✓**, then active categories with emoji; admins also
   see *"Edit categories…"*. Keyboard: arrows, Enter, Escape. Escape closes only the dropdown
   — its handler must stop propagation so the modal's document-level Escape listener does not
   also fire.
2. **Title**
3. **`RichTextEditor`**
4. **Visibility switch** (team only), plus the client-mention note from §2c.
5. **Footer** — unchanged labels.

Edit mode: category and body editable. A post whose category is now archived shows it
selected with *(archived)*; the archived category is not offered for anything else.

### Category manager (admins)

Slide-over opened from *"Edit categories…"*, same slide-over pattern as the other modals.

- Row per active category: emoji input (hint *"Win + . or Ctrl+Cmd+Space for emoji"*), name
  input, move up / move down, **Archive**.
- Collapsed *"Archived (n)"* section, each row with **Restore**.
- *"+ Add category"* at the bottom.
- Validation mirrors §1a. Pending state and toast on every save.
- Archive has **no confirm dialog**: it is fully reversible and posts keep their category.

### Message cards

- Category pill before the title (*"📢 Announcement"*); nothing when uncategorised.
- Two-line preview becomes a **plain-text excerpt** of the body — tags stripped, mentions as
  *@Name*.

### Detail modal

Category pill; body through `RichTextBody` with formatting, images and highlighted mentions.

### Notifications bell

`message_mention` renders *"{author} mentioned you in "{title}""* and routes to
`/projects/{project_id}?tab=messages&message={message_id}`.

### Routes

No new routes, so no new `loading.tsx`.

---

## 4. Docs to update in the same PR

- `CLAUDE.md` — migration log gains `021`; core tables gain `message_categories` and the new
  `messages` columns; notifications types list gains `message_mention`; project structure
  gains `modules/editor/` and `message-category-actions.ts`.
- `MEMORY.md` — Stage 3 section describes rich text, mentions and categories; the "Rich text,
  attachments or @mentions in message bodies" out-of-scope line from the first spec is
  superseded.

## 5. Verification

No test framework exists (standing decision). Gates:

- `npm run check` exits 0; `npm run build` succeeds.
- Agents: `schema-reviewer` and `rls-security-reviewer` on 021 and the actions;
  `ui-convention-checker` and `design-token-auditor` on the UI.
- Before applying 021 to each database, the read-only count query from the first spec must
  return 0, extended to the new limit:
  `select count(*) from public.messages where char_length(btrim(title)) not between 1 and 200 or char_length(body) not between 1 and 20000;`
- `migration list` shows only the new migration unapplied before `db push`.
- **Prod order:** apply 020 and 021 to prod, then merge.

Manual checklist on dev, in addition to the first spec's:

1. Bold, lists, a link and a pasted image render in the detail view.
2. Mentioning a teammate notifies them once (bell + push); re-saving without new mentions
   does not notify again; adding a new mention notifies only the new person.
3. On an internal post, a client is absent from the mention list; a crafted API insert
   mentioning a client creates no notification for them.
4. A client's post that mentions an admin produces one notification for that admin, not two.
5. Archiving a category removes it from the picker; posts using it still show it; restoring
   brings it back; a duplicate active name is rejected.
6. A pre-021 plain-text message still displays with its line breaks.
7. Comments still work exactly as before, including image paste and mentions.
