# Client Portal Stage 3 — Project Message Board

**Date:** 2026-09-17
**Status:** Implemented on `feature/message-board`; migration 020 pending apply
**Branch:** `feature/message-board`

---

## Purpose

`MessagesTab.tsx` is a read-only shell: posts render, but the "New message" buttons have no
handlers, cards look clickable and do nothing, and no message Server Action exists. This
stage makes the board usable for admins, providers and clients, and wires the one
notification that matters most — a client posting something the team must see.

It comes before Stage 4 because the client dashboard needs a "recent shared messages" card.

## Decisions

**"Team members"** below means users with role `admin` or `provider`. Admins get the same
compose toggle as providers.

| Decision | Chosen | Rejected, and why |
|---|---|---|
| Replies | **Posts only** — replies are a later stage | Flat replies would roughly double the stage: a new table plus RLS that makes replies inherit their parent's visibility |
| Notifications | **Client posts notify the team** (in-app + push) | Notifying clients of team posts lands mostly in a bell they rarely open until Stage 4 exists |
| Editing | **Authors edit their own title/body and delete their own posts; admins edit or delete any. Visibility is locked after posting — for everyone, admins included.** | Changeable visibility risks exposing internal discussion later, or silently pulling a post from a client |
| Visibility on compose | **Team members get a "Visible to client" toggle, off by default.** Clients get no toggle; their posts are always shared. | This **replaces** the earlier recorded decision that visibility was a forced choice with no default. Default-off fails safe: a forgotten toggle keeps a post internal |
| Structure | **Modals inside the Messages tab, driven by the URL** | A route per message costs a route, fetch and `loading.tsx` each, against the page's fetch-once design. Inline expand can't be deep-linked from a notification |

**Consequence of locked visibility + default off:** a post published internally by mistake
is fixed by deleting and reposting. The compose button states the outcome ("Post internally"
/ "Post to client") so the setting is visible at the moment of posting.

## Out of scope

- Replies or comments on messages
- Notifying clients of team posts
- Rich text, attachments or @mentions in message bodies — bodies stay plain text
- Changing Server Actions app-wide to return `{ ok, message }` (see Error handling)
- Any new index or `updated_at` trigger on `messages` — migration 002 already created
  `idx_messages_created_at (project_id, created_at desc)` and the `set_messages_updated_at`
  trigger. (An earlier draft of this spec wrongly listed the trigger as missing.)

---

## 1. Database — migration `020_message_board.sql`

The first migration applied through `migration list` → `db push --db-url`, dev then prod
(see CLAUDE.md → "Applying migrations"). Idempotent, in the house style of 014–018: banner
comments explaining why, `drop … if exists` before every create, pinned
`search_path = public, pg_temp` on every function.

### Current state being changed

| Policy (live) | Source | Problem |
|---|---|---|
| `messages: admin all` | 004 | none |
| `messages: provider reads assigned` | 004 | inline subquery, not a helper |
| `messages: provider inserts` | 004 | inline subquery |
| `messages: client reads visible` | 004 | inline subquery |
| `messages: client posts shared` | 014 | none |
| `messages: client edits own` | 014 → 016 | none |
| `messages: client deletes own` | 014 | **no membership check** (backlog #8) |
| *(none)* | — | **providers cannot edit or delete their own posts** |

`messages.updated_at` is already maintained by 002's `set_messages_updated_at` trigger, so
the "Edited" label needs no schema change.

### Changes

**1b. Immutable-column guard** — `public.guard_message_immutable_columns()`, `before update`
trigger `messages_guard_immutable_columns`. Raises `42501` if `is_client_visible`,
`project_id` or `author_id` changes (`is distinct from`) — except `author_id` changing **to
null**, which is `ON DELETE SET NULL` firing when an author's user row is deleted and must
not be blocked. Applies to **all** roles including
admin. Returns early when `auth.uid() is null` so service-role maintenance still works,
matching 016's guards.

**1c. Policies rewritten with helpers** — drop and recreate the three 004 policies using
`public.get_user_role()` and `public.is_project_member(project_id)`, same meaning.

**1d. New provider policies**
- `messages: provider edits own` — update; `using` and `with check` both require
  `get_user_role() = 'provider'`, `author_id = auth.uid()`, `is_project_member(project_id)`.
- `messages: provider deletes own` — delete; `using` requires the same three.

**1e. Client delete gains membership** — recreate `messages: client deletes own` adding
`public.is_project_member(project_id)`. Closes backlog #8: revoking a client deletes their
`project_members` rows, so a revoked client with a live session could otherwise still delete
their posts. **Back-port the same clause into 014's copy of this policy**, with a
kept-in-sync comment, so a hand re-run of 014 cannot revert it (the convention 014 already
uses for 015 and 016).

**1f. `notifications.message_id`** — `uuid references public.messages(id) on delete cascade`,
nullable, plus `idx_notifications_message_id`. Deleting a post removes its notifications.
The `client_message` type is already permitted by 014's check constraint.

**1g. Client-post notification trigger** — `public.notify_client_message()`,
`security definer`, `after insert` trigger `messages_notify_client_message`. When the new
row's author has role `client`, insert one `client_message` notification
(`user_id`, `actor_id = new.author_id`, `project_id`, `message_id`) for each recipient:

- every user with `role = 'admin'` and `approved = true`, **plus**
- every user with `role = 'provider'` and `approved = true` who is a member of `new.project_id`

excluding the author. Team posts create no notifications. **This trigger is the single
source of truth for recipients** — see §2.

### Resulting access

| | Read | Post | Edit | Delete |
|---|---|---|---|---|
| Admin | all | ✅ either visibility | any post | any post |
| Provider | all in their projects | ✅ either visibility | own | own |
| Client | shared, in their projects | ✅ forced shared | own, forced shared | own |

Every provider and client write requires `is_project_member(project_id)`. Visibility,
project and author are immutable for everyone.

---

## 2. Server Actions, notifications, data

### New file: `src/app/(portal)/projects/message-actions.ts`

`'use server'`. `projects/actions.ts` is already 712 lines, so messages get their own file
beside it. Uses the server Supabase client, `revalidatePath(`/projects/${projectId}`)`, and
throws on failure, like the existing actions.

| Action | Behaviour |
|---|---|
| `createMessage(projectId, { title, body, isClientVisible })` | Trims; title 1–200 chars, body 1–10,000. Reads the caller's role; **if `client`, `is_client_visible` is forced to `true`** regardless of input. Inserts with `author_id` = caller. Returns the new message id. |
| `updateMessage(messageId, projectId, { title, body })` | Same length rules. Updates **only** `title` and `body` — visibility is not a parameter. Uses `.select('id')` and throws if zero rows changed. |
| `deleteMessage(messageId, projectId)` | Deletes; `.select('id')`, throws if zero rows. |

**Why the row-count checks:** an RLS `USING` mismatch returns zero rows with no error; only
`WITH CHECK` violations raise. Without the check, an unauthorised edit or delete completes
"successfully" and reverts on the next render with no explanation.

### Push notifications for client posts

In-app rows come entirely from the §1g trigger. After a **client's** insert succeeds,
`createMessage`:

1. Reads `user_id` from `notifications where message_id = <new id>` using the server-only
   service-role client (`@/lib/supabase/admin`) — notification rows are readable only by
   their owner.
2. Calls `sendPushToUsers(userIds, { title: 'New message from {client name}', body: '{post
   title}', url: '/projects/{projectId}?tab=messages&message={messageId}' })`.

Wrapped in `try/catch` and logged with a `[push]` prefix, like `notifyAssignment` — a push
failure never fails the post. Reading the trigger's rows means in-app and push recipients
cannot drift.

### Data fix — author embed

`src/app/(portal)/projects/[id]/page.tsx` changes the messages query from
`author: users(*)` to `author: users(id, name, avatar_url, role)` for **every** role. The
previous embed shipped every author's `email` and `employment_type` into clients' RSC
payload; the tab only ever renders name and avatar.

`MessageWithAuthor.author` in `src/types/index.ts` narrows to
`Pick<User, 'id' | 'name' | 'avatar_url' | 'role'> | null`.

### Error handling

In production, Next.js redacts the message of errors thrown by Server Actions. The compose
modal therefore validates every user-fixable condition (empty or over-length title/body)
client-side before submitting. Server-thrown messages are only relied on for unexpected
failures. Note `withToast` shows `err.message` whenever it catches an `Error` — its
fallback string only applies to non-`Error` throws — so in production those unexpected
failures show Next.js's generic redacted text. Accepted for this stage; the app-wide fix is
out of scope.

---

## 3. UI

### `ProjectTabsLayout` — URL-driven tabs

- Active tab is **derived** from `useSearchParams().get('tab')` on every render (`todos`,
  `messages`, `team`; anything else → `todos`). Deriving rather than initialising state is
  what makes a bell click work while the project page is already open.
- Tab clicks update the URL with `window.history.replaceState`, which Next.js 15 syncs into
  `useSearchParams` without a server round trip — switching stays instant, and refresh keeps
  the tab.
- Passes `viewerRole` and `currentUserId` to `MessagesTab`.

### `MessagesTab` — becomes `'use client'`

- Cards, newest first: title, two-line body preview, author avatar and name, relative time,
  and an **"Edited"** label when `updated_at > created_at`.
- Non-client viewers see the existing **"Client sees this"** badge on shared posts; internal
  posts carry no badge. Clients see no visibility badges.
- The whole card is a button with hover, active, and `focus-visible` states. Clicking sets
  `?message=<id>` via `replaceState`, preserving `tab`.
- "New message" opens `MessageComposeModal`. Empty-state copy differs for clients.
- Reads `?message=` and renders `MessageDetailModal` for the matching message. If no visible
  message matches (deleted, or an internal post a client cannot read), show
  `toast.error('That message is no longer available.')` once and remove the parameter.

### `MessageComposeModal` — create and edit

- Title input and a plain-text body textarea.
- **Team members, create mode:** a "Visible to client" toggle, **off by default**. The submit
  button reads **"Post internally"** when off and **"Post to client"** when on.
- **Clients, create mode:** no toggle; the line *"Everyone on this project will see this."*
  Submit reads "Post".
- **Edit mode (all roles):** visibility shown read-only with *"Visibility can't be changed
  after posting."* Submit reads "Save changes".
- Client-side validation matching §2 limits, with inline messages. Pending state disables
  submit and all dismiss paths (X, backdrop, Escape) while in flight. Success →
  `toast.success`, close, and for a new post open its detail view.

### `MessageDetailModal`

- Full title, body in `whitespace-pre-wrap break-words`, author, posted time, edited time
  when applicable, and the visibility badge for non-client viewers.
- **Edit** and **Delete** shown when the viewer is the author or an admin. Edit swaps to
  `MessageComposeModal` in edit mode. Delete uses
  `confirmDialog({ title: 'Delete this message?', confirmLabel: 'Delete' })`, then
  `withToast(deleteMessage)`, then closes and clears `?message=`.

Both modals follow the existing slide-over pattern from `InviteClientModal`: full-width
below `sm`, `max-w-lg` above, `role="dialog"` and `aria-modal`, dismiss paths guarded while
pending. Tokens only; mobile and desktop classes in the same pass.

### `NotificationsBell`

- Query adds `message: messages(id, title)` and `project: projects(id, name)` (id and name
  only — never `budget`); `NotificationWithMeta` widens to match.
- Rendering becomes an explicit switch on `type`: `mention` and `task_assigned` unchanged;
  `client_message` renders *"{actor} posted in {project}: "{title}""* (title falls back to
  "a message" if the embed is null). Any other type — including `client_task`, which the
  constraint allows but nothing emits yet — renders a neutral *"New activity in {project}"*
  rather than being mislabelled.
- `openItem` routes `client_message` to `/projects/{project_id}?tab=messages&message={message_id}`;
  other types keep their current URL.

### No new routes

Everything lives inside the existing project page, so no new `loading.tsx` is required.

---

## 4. Docs to update in the same PR

- `MEMORY.md` — replace "visibility is a forced choice on every post" (Stage 3 section,
  "Decisions already made", backlog item 1) with the default-off toggle; mark Stage 3 done
  when shipped; strike backlog #8.
- `CLAUDE.md` — migration log gains `020 message board`; RLS summary describes provider
  edit/delete-own and locked visibility; notifications row lists `message_id`.

## 5. Verification

No test framework exists (standing decision). Gates:

- `npm run check` exits 0; `npm run build` succeeds.
- Agents: `schema-reviewer` and `rls-security-reviewer` on migration 020;
  `ui-convention-checker` and `design-token-auditor` on the UI.
- `migration list` on dev shows only 020 unapplied before `db push`, and all rows matched after.

Manual checklist on dev:

1. Provider posts with the toggle off → client cannot see it; button read "Post internally".
2. Provider posts with the toggle on → client sees it, with no badge; team sees "Client sees this".
3. Client posts → every approved admin and every provider on the project gets a bell
   notification and, where subscribed, a push; the client gets neither.
4. Clicking that notification with the project page **already open** switches to Messages and
   opens the exact post.
5. Author edits title/body → "Edited" appears; visibility cannot be changed from the UI, and a
   direct API `PATCH` of `is_client_visible` is rejected by the guard trigger.
6. Provider edits and deletes their own post; cannot edit or delete another provider's.
7. Admin edits and deletes any post.
8. A client opening `?message=<internal post id>` gets "That message is no longer available."
9. Revoke a client, then attempt a direct API `DELETE` of their old post with their session →
   rejected.
10. Mobile width: both modals full-width, no horizontal scroll.
