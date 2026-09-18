# Message Board Replies — Design

**Date:** 2026-09-18
**Status:** Approved, ready for an implementation plan
**Stage:** Client portal, Stage 3 follow-up (the board itself shipped in PR #6)

---

## 1. Why

Stage 3 deliberately shipped posts only. A message is currently an announcement nobody can
answer: a client reads "Homepage design is ready for review" and has to reply by email, or by
filing a task, or by writing a second message. Replies close that loop and make the board the
place the conversation actually happens.

Basecamp remains the reference: a post, then a flat list of replies underneath it.

### Decisions taken during design

| Question | Decision | Why |
|---|---|---|
| Can a team member post an internal reply on a client-visible post? | **No — a reply is exactly as visible as its post** | One sentence to reason about, and no per-reply mis-click can leak a private note into a client's view. A team-only aside belongs in its own internal post. |
| Who gets notified? | **The post's author plus everyone already in the thread**, minus the replier; plus anyone @mentioned | You hear about conversations you are part of, and joining is opt-in by replying. "Everyone on the project" would teach people to mute the bell. |
| Does a reply bump the post up the list? | **No — the list stays in posting-date order** | Announcements stay where people remember seeing them; cards don't reshuffle between visits. Activity is still visible as a reply count and a last-reply time on the card. |
| Nesting | **Flat** — no replies to replies | Matches Basecamp and the existing task-comment thread. |
| Edit and delete | **Author edits and deletes their own; admins delete any** | Mirrors posts exactly, so there is one rule to remember. |
| Table shape | **A `message_replies` table of its own** | Considered and rejected: a generic polymorphic `comments` table (migrating live comment data and rewriting working policies for tidiness) and adding `message_id` to `task_comments` (two nullable parents and every existing policy needing re-reading). A task comment and a client-visible reply read differently and carry different visibility rules; keeping them apart means today's comment behaviour cannot regress. |

Out of scope: reactions, attachments beyond what the shared editor already does, per-reply
visibility, marking a thread resolved, and email digests.

---

## 2. Data model — migration `022_message_replies.sql`

```sql
create table if not exists public.message_replies (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  author_id  uuid references public.users(id) on delete set null,
  body       text not null,                        -- rich-text HTML
  mentions   uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- `body` check: `char_length(body) between 1 and 20000`, matching `messages` after 021.
  Emptiness of rich content (`<p></p>`) is an application-layer rule, as it is for posts.
- `mentions` check: `cardinality(mentions) <= 50`, mirroring `MESSAGE_MENTIONS_MAX`.
- `set_updated_at` trigger — `updated_at > created_at` is what renders "Edited".
- Deleting a post cascades to its replies. Deleting a user blanks `author_id` and keeps the
  reply, exactly as posts and task comments behave.
- Indexes: `message_id`, and `(message_id, created_at)` for the thread read.
- A `message_replies_lock_immutable` trigger rejects any update that changes `message_id` or
  `author_id`, mirroring 020's lock on posts.

### Access

One new `security definer` helper, `set search_path = public, pg_temp`, holding the rule
currently spread across 020's per-role policies:

```sql
can_read_message(mid uuid) returns boolean
  -- true when the caller is an approved admin, or an approved member of the post's
  -- project AND (the post is client-visible OR the caller is not a client)
```

Every reply policy is written in terms of it:

| Action | Policy |
|---|---|
| select | `can_read_message(message_id)` |
| insert | `can_read_message(message_id) and author_id = auth.uid()` |
| update | `author_id = auth.uid() and can_read_message(message_id)`, same in `WITH CHECK` |
| delete | `author_id = auth.uid() and can_read_message(message_id)`, plus `is_admin()` |

Reading and replying are the *same* test, so they cannot drift apart. A client on an internal
post fails it: `select` returns zero rows rather than an error, and an insert is rejected.

**Note for the plan:** `can_read_message` duplicates logic that 020's policies express
per-role. 020's policies are not rewritten in terms of it — that is a larger change to
working, deployed RLS than this feature justifies. The helper's comment must say so, so the
next person knows both exist and why.

---

## 3. Notifications

### Schema

- `notifications.reply_id` → `message_replies(id) on delete cascade`.
  It scopes de-duplication: without it, "has this user already been notified about this
  message?" matches rows from *earlier* replies and silently swallows the new one.
- `notifications_type_check` gains `message_reply` (added `NOT VALID`, as 021 does).

### Triggers, both `after insert` on `message_replies`

**`message_replies_notify_mentions`** — for each id in `mentions`: not the author, approved,
admin or member of the post's project, and never a client when the post is internal. Inserts
type `message_mention` carrying both `message_id` and `reply_id`, so the existing bell copy,
push and email keep working unchanged.

**`message_replies_notify_thread`** — the post's `author_id` plus the distinct `author_id` of
every existing reply on that post, minus the replier, minus anyone already holding a
notification for **this reply**. Same approval/membership/client filter. Type `message_reply`.

Trigger names sort `mentions` before `thread`, so the thread trigger sees the mention rows and
skips those people: one notification each, and the more specific wording wins. **This is the
same naming-order dependency 021 documents; the comment in 022 must repeat the warning.**

Editing a reply does not notify anyone, including for newly added mentions — the triggers fire
`after insert` only. That is a deliberate simplification over posts (where editing can add a
mention); revisit only if it bites.

### Delivery

`deliverReplyNotifications(replyId, …)` in the new actions file follows the message pattern
exactly: read back the rows the triggers wrote via the service-role client, filtered by
`reply_id` and the timestamp returned from the insert, then push per type and email the
mentions. Best-effort — a delivery failure logs and never fails the reply.

Copy:
- `message_reply` push: title `{author} replied to "{post title}"`, body `Tap to open the thread.`
- Bell: `{author}` **replied to** `"{post title}"`
- Routing: `/projects/{project_id}?tab=messages&message={message_id}` — the existing deep link
  already opens the post with its thread.

---

## 4. Server Actions — `src/app/(portal)/projects/message-reply-actions.ts`

```ts
createReply(messageId: string, projectId: string, draft: ReplyDraft): Promise<string>
updateReply(replyId: string, projectId: string, draft: ReplyDraft): Promise<void>
deleteReply(replyId: string, projectId: string): Promise<void>
// ReplyDraft = { bodyHtml: string; mentions: string[] }
```

Same discipline as `message-actions.ts`:

- Validate with a shared `replyDraftError` in `src/lib/messages.ts`, reusing `htmlToText` and
  `normalizeMentions`. Production Next.js redacts thrown Server Action messages, so anything a
  person can fix must be caught client-side by the same function.
- Check returned row counts on update and delete — an RLS `USING` mismatch returns zero rows
  **without** an error. "You can only edit your own replies."
- `revalidatePath('/projects/' + projectId)` after every mutation.

---

## 5. UI

### Detail modal

Below the post body: a divider, `Replies (n)`, then the thread oldest-first. Each reply shows
avatar, name, relative time, an "Edited" marker when `updated_at > created_at`, and the body
through `RichTextBody` (size `xs`, a step down from the post's `sm` body). Edit and Delete appear for the author, and Delete for an
admin; editing swaps the body for the editor in place with Save and Cancel, as task comments
do. Delete goes through `confirmDialog`.

The composer sits at the end of the thread: the shared `RichTextEditor`, placeholder
"Write a reply…", Ctrl/Cmd+Enter to send, a Reply button disabled while empty or while an
image uploads, `uploadPrefix` `messages/${projectId}`. Mentionable people follow the compose
modal's rule — project members plus admins, clients dropped when the post is internal — so the
UI never offers a mention the trigger would discard.

Empty thread: "No replies yet." above the composer.

### Cards

Next to the category pill and edited marker: `3 replies · last 2h ago`, omitted at zero. The
list stays in posting-date order.

### Mobile

The modal is already a full-height slide-over. The thread scrolls with the body and the
composer sits inline at the end rather than pinned, so the phone keyboard does not fight a
fixed element.

No new route, so no new `loading.tsx`.

---

## 6. Data flow

`src/app/(portal)/projects/[id]/page.tsx` extends the messages query to embed replies with
their authors, ordered by `created_at`. A project's threads are small and the page is already
dynamic, so there is no client-side fetching and no new loading state. `MessageWithAuthor`
gains `replies: MessageReplyWithAuthor[]`. Types land in `src/types/index.ts` as usual.

---

## 7. Verification

No test framework exists in this repo, by standing decision. Gates: `npx tsc --noEmit`,
`npm run lint`, `npm run build`, the schema / RLS / UI-convention / design-token agents, and a
manual checklist:

1. Reply to a shared post as a provider; the post's author gets one notification, not two.
2. Reply again as the author; the first replier is notified and the author is not.
3. @mention someone in a reply: exactly one notification, worded as a mention, plus an email.
4. As a client, a shared post shows the thread and the composer; an internal post is not in the
   list at all, and its reply ids return nothing through the API.
5. Clients do not appear in the @ list when replying to an internal post.
6. Edit a reply → "Edited"; nobody is notified.
7. Delete a post → its replies and their notifications go with it.
8. A reply from a since-deleted user still renders, without an author name.
9. Cards show the reply count and last-reply time; list order does not change.
10. Task comments and existing posts behave exactly as before.

## 8. Deploy order

Apply 022 to dev, run the checklist, apply it to prod, **then** merge — the page query embeds
`message_replies`, which errors on a database without 022 and would empty the message board.
This is the order that migrations 020 and 021 established.
