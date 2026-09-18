# Editing Window — Design

**Date:** 2026-09-18
**Status:** Approved, ready for an implementation plan
**Stage:** Follow-up to the message board (posts, replies) and task comments

---

## 1. Why

Two problems, one rule.

**Admins can rewrite other people's words.** Matthew, signed in as admin, sees Edit on a post a
client wrote. That is not a UI slip: migration 004 grants `messages: admin all` (`FOR ALL`), and
migration 008 grants the same on `task_comments`. The database genuinely allows it. Nobody asked
for it, and a client's message being silently reworded by the agency is the kind of thing that
destroys the trust the client portal exists to build.

**Anyone can silently rewrite history later.** Today an author can edit their own post from six
months ago. The card shows "Edited", but not what changed, and a client who acted on the original
has no way to tell. Basecamp's answer is a short grace period, and that is the behaviour Matthew
asked for.

So: **the author, and only the author, may edit — and only for a while after posting.**

### Decisions taken during design

| Question | Decision | Why |
|---|---|---|
| Where does the window live? | **Agency-wide, admin-editable, in Settings**, default 15 minutes | One number for the portal. The same shape as message categories: one shared list, admins edit it. An env var would not be editable without a deploy. |
| Does it apply to admins on their own posts? | **Yes — one rule for everyone** | One rule to explain, one code path to get right. An admin needing to change an older post deletes and reposts, which is already the answer for a mis-set visibility (020). |
| Is deleting time-limited too? | **No — editing only** | Deleting is visible: the thing is gone. A late edit rewrites history silently, which is the actual risk. Authors delete their own whenever; admins delete anything. |
| Where is it enforced? | **In RLS**, via a helper used by all three update policies | A stale tab, a direct PostgREST call and the app all hit the same rule. Server Actions add the readable error, not the enforcement. |
| Live countdown in the UI? | **No** | A button vanishing under the cursor is worse than a clear failure message. The stale-tab save fails with "The editing window has closed." |

Out of scope: an edit history or diff, a "last edited by" record, per-project windows, and any
change to who may *delete*.

---

## 2. Data model — migration `023_edit_window.sql`

### The setting

```sql
create table if not exists public.app_settings (
  id                  smallint primary key default 1 check (id = 1),
  edit_window_minutes integer not null default 15
                        check (edit_window_minutes between 1 and 1440),
  updated_at          timestamptz not null default now()
);
```

One row, forever — the `check (id = 1)` makes a second row impossible, so there is never a
"which settings row?" question. Seeded on apply with `insert … on conflict do nothing`.
`set_updated_at` trigger, as every table here has.

RLS: any approved user may `select` (the UI needs the number to decide whether to render Edit);
only `is_admin()` may `update`. No insert or delete policy — the row is created by the migration
and is not meant to be replaced.

This table is deliberately single-purpose rather than a generic key/value store. A `settings(key,
value)` table reads as flexible but gives up type checking, per-setting constraints, and any
chance of a meaningful column comment. When a second setting arrives it becomes a second column.

### The helper

```sql
public.within_edit_window(created_at timestamptz) returns boolean
  -- now() < created_at + (edit_window_minutes || ' minutes')::interval
```

`stable`, `security definer`, `set search_path = public, pg_temp` — definer so the check does not
depend on the caller being able to read `app_settings`, and so a future tightening of that table's
read policy cannot silently disable editing for everyone.

### Policy changes

**`messages`** — replace `messages: admin all` (004) with three narrower policies:

| Policy | Rule |
|---|---|
| `messages: admin reads all` | `select` using `is_admin()` |
| `messages: admin inserts own` | `insert` with check `is_admin() and author_id = auth.uid()` |
| `messages: admin deletes any` | `delete` using `is_admin()` |

No admin update policy — that is the removal. Then the per-role author-update policies —
020's `messages: provider edits own` and 014's `messages: client edits own` — are dropped and
replaced by a single role-agnostic one:

```sql
create policy "messages: author updates own in window"
  on public.messages for update
  using      (author_id = auth.uid() and public.within_edit_window(created_at))
  with check (author_id = auth.uid());
```

020's immutable-columns trigger still blocks changes to visibility, project and author, so this
policy only ever governs title, body, category and mentions.

**`task_comments`** — same split of `task_comments: admin all` (008) into read-all, insert-own
(admins already post comments) and delete-any, and `task_comments: author updates own` (009) gains
`and public.within_edit_window(created_at)`.

**`message_replies`** — `message_replies: update own` (022) gains the same clause. Its
`can_read_message(message_id)` term stays.

**A note the migration must carry:** an admin's ability to *read* every project's messages and
comments is unchanged, as is delete. Only the silent-rewrite power goes away.

---

## 3. Server Actions

`updateMessage`, `updateReply` and `updateTaskComment` already check the returned row count, because an
RLS `USING` mismatch returns zero rows without an error. Today they say "You can only edit your own
…". That message is now sometimes wrong — the row may be yours and simply out of time.

Each one re-reads the row on a zero-row result to tell the two apart, and throws the accurate one:

- not yours, or gone → "You can only edit your own messages." (existing wording per table)
- yours but expired → "The editing window has closed."

One extra query only on the failure path.

A new `updateEditWindow(minutes: number)` Server Action in `settings/actions.ts` validates 1–1440
with a shared `editWindowError()` (so client and server use identical rules), writes the single
row, and revalidates. RLS rejects a non-admin; the row-count check turns that into "Only admins can
change the editing window."

---

## 4. UI

### Settings page

A new admin-only card, "Editing window", alongside the approval queue and template builder: a
number input in minutes, a Save button disabled while unchanged or in flight, and one line of
explanation — *"How long after posting someone can still edit their own message, reply or
comment. Deleting is not affected."* Toast on success, inline error on a rejected value.

### Everywhere an Edit button exists

`MessageDetailModal`, `MessageReplyThread` and `TodoItem`'s comment list render Edit only when the
viewer is the author **and** the row is still inside the window. When it is not, the button is
absent — not disabled — and Delete keeps its current rules. So on a client's post an admin now sees
Delete alone, which is the thing Matthew noticed.

A shared `canEditWithin(createdAt, minutes)` in `src/lib/messages.ts` is the single expression of
"still editable", used by all three.

### Getting the number to the components

`(portal)/layout.tsx` already fetches the signed-in user for every authenticated page. It reads
`edit_window_minutes` in the same pass and provides it through a small client context
(`EditWindowProvider` in `src/components/layout/`), which `PortalShell` wraps around its children.
The three components read it with `useEditWindow()`.

The alternative — threading a prop from the project page through `ProjectTabsLayout` → tab →
card → modal — touches five files per consumer and would have to be repeated for the todo tree.
A context is the smaller change and the setting is genuinely global.

If the settings read fails, the provider falls back to 15 and logs. A missing setting must not
break the page.

### Deliberately not built

A live countdown that removes the button as the clock runs out. It needs a timer per row, and the
stale-tab case still has to be handled server-side anyway. An edit begun before expiry and saved
after it fails with the toast — the sharpest edge in this design, and acceptable at 15 minutes.

---

## 5. Verification

No test framework exists in this repo, by standing decision. Gates: `npx tsc --noEmit`,
`npm run lint`, `npm run build`, the schema / RLS / UI-convention / design-token agents, and a
manual checklist:

1. As admin, a client's post shows Delete and **no** Edit. Same for a client's task comment.
2. As admin, `PATCH`ing another user's message through PostgREST directly is rejected.
3. Post a message, edit it immediately — works. Set the window to 1 minute, wait, reload: Edit is gone.
4. With Edit open from before expiry, save after expiry → "The editing window has closed.", nothing changes.
5. A reply and a task comment behave identically to a post.
6. Delete is unaffected at every age, for author and admin.
7. Settings: change 15 → 30, reload a project, confirm a 20-minute-old post is editable again by its author.
8. A non-admin cannot reach the Settings card, and a direct write to `app_settings` is rejected.
9. Existing rows created before 023 behave by the same clock — an old post is not editable.

## 6. Deploy order

Apply 023 to dev, run the checklist, apply to prod, **then** merge. The layout query reads
`app_settings`, which does not exist on a database without 023; the provider's fallback keeps the
page alive, but every Edit button would be governed by a default the database cannot enforce.
