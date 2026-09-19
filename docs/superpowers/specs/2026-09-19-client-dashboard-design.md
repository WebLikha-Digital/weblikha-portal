# Client Dashboard — Design

**Date:** 2026-09-19
**Status:** Approved, ready for an implementation plan
**Stage:** Client portal, Stage 4 — the last real gap

---

## 1. Why

A client signs in and lands on `/dashboard`, which branches admin versus everyone-else. "Everyone
else" means the **provider** dashboard: my open tasks, my points this month, my assigned projects.
Every one of those queries filters on the signed-in user as an assignee, and a client is never an
assignee — so the queries return nothing and the page renders bare. It does not error, which is
worse: it looks like the product has nothing to say to them.

This is the first screen a paying client sees. Everything it needs already exists — projects with
status, tasks with due dates, the message board, and now profiles with avatars and timezones.

### Decisions taken during design

| Question | Decision | Why |
|---|---|---|
| Whose deadlines? | **Every dated task on their projects**, not just what they filed | Clients already see the full to-do list including internal tasks, so this is consistent — and "what lands this week" is the question they open the portal to answer. |
| Show the team? | **Yes — avatars per project card**, names and roles only | They are paying for a service; seeing people behind it matters. The profile work (024) makes it nearly free. No `employment_type`, no phone, no birthday. |
| What is "progress"? | **Completed tasks over total tasks** on the project | Clients see every task, so this is the honest number rather than a client-visible-only subset that would disagree with what the to-do tab shows. |
| Where does it live? | **A third dashboard component**, with `dashboard/page.tsx` reduced to a role router | Three dashboards inline in one file would be ~350 lines of three unrelated screens. The page is the file being changed anyway. |
| New tables or columns? | **None** | Everything needed is already in the schema. No migration, so this ships without a database step for the first time in five features. |

Out of scope: charts, a client-facing activity feed, anything editable (the dashboard only links to
where actions already live), notification preferences, and the "Added by client" badge (backlog #3
— related but independently useful, and it belongs to the to-do list, not here).

---

## 2. Data

Five reads, all executed as the signed-in client under their own RLS. No service-role client, no
new policies.

| Block | Query |
|---|---|
| Projects | `projects` filtered to their memberships, **explicit columns** — `id, name, client_name, status, start_date, end_date, description` |
| Progress | `tasks` for those projects: `id, project_id, status, title, due_date, created_by` |
| Their requests | the same task rows, filtered client-side to `created_by = me and status <> 'done'` |
| Deadlines | the same task rows, filtered to those with a `due_date` |
| Messages | `messages` on those projects where `is_client_visible`, newest 5, with `author: users(id, name, avatar_url)` |
| Team | `project_members` with `user: users(id, name, avatar_url, role, job_title, timezone)` |

**The one rule that matters:** never `select('*')` on `projects` or `users` here.

- `projects` carries `budget`, and RLS is row-level — the "member or admin" policy hands a member
  the whole row. `src/app/(portal)/projects/page.tsx` already selects an explicit list mirroring
  the `client_projects` view for exactly this reason; this page copies that list.
- `users` carries `employment_type`, `email`, `bio` and `location`. The Team tab deliberately shows
  names and roles only. Two branches in a row had to retrofit this after review caught it; the
  column list here is explicit from the start.

One task query serves progress, requests and deadlines — the rows are the same, only the filtering
differs, and a client's project set is small enough that three round trips would be waste.

---

## 3. The screen

Greeting and today's date, matching the other two dashboards.

**Three stat cards:** active projects, open requests, overdue items. The third is the one that
earns its place — non-zero means there is something to talk about.

**Project cards** (the main block, one per project): name, status badge, a progress bar with
"12 of 20 tasks done", the next upcoming deadline, and a row of team avatars. The card links to
the project.

**Two columns, stacked on a phone:**

- **Your requests** — open tasks they filed, each with its status and project, linking to that
  project's to-do tab. Empty state: "Nothing open. You can add a request from a project's to-do
  list." — it names where the action lives instead of just saying "none".
- **Recent messages** — the last five shared posts: title, author, relative time, each linking to
  `/projects/{id}?tab=messages&message={id}`, the deep link the board already supports.

**Deadlines**, last: overdue first in danger colour, then the next 14 days. The whole block is
omitted when both are empty rather than rendering an empty container.

**Empty states are the point, not an afterthought.** A client with no assigned projects sees a
short line saying their projects appear here once the team adds them — not a spinner, not silence,
not a broken-looking grid. That is the exact failure this feature exists to fix.

Everything is a Server Component; no client-side fetching, matching the existing dashboards. Mobile
and desktop classes in the same pass, as always.

---

## 4. Structure

`src/app/(portal)/dashboard/page.tsx` becomes a role router of roughly thirty lines: read the
profile, render `AdminDashboard`, `ProviderDashboard` or `ClientDashboard`.

The three move to `src/components/modules/dashboard/`. Admin and Provider move **verbatim** — no
behaviour changes, no query changes, no styling changes. They are being relocated because the file
they live in is the file this feature has to modify, and a third screen inline makes it unwieldy.
Any change to them beyond the import path is out of scope and should be rejected in review.

`dashboard/loading.tsx` already exists; it gains a shape closer to the client layout, since that is
now the most common first paint for the portal's newest users.

---

## 5. Verification

No test framework exists in this repo, by standing decision. Gates: `npx tsc --noEmit`,
`npm run lint`, `npm run build`, the RLS / UI-convention / design-token agents (no schema agent —
there is no migration), and a manual checklist:

1. Sign in as a client with projects: cards, progress, deadlines and messages all render.
2. Sign in as a client with **no** projects: the empty state reads as intended, nothing is broken.
3. View the page source as a client: no `budget`, no `employment_type`, no `email`, no `phone`,
   no `birthdate` anywhere in the payload.
4. Progress matches what the project's to-do tab shows for the same project.
5. Overdue items appear in danger colour and above upcoming ones; a project with no dated tasks
   shows no deadline line.
6. A shared message links through and opens that post; an internal post never appears.
7. The admin dashboard and the provider dashboard are byte-identical in behaviour to before.
8. Phone width: everything stacks, nothing overflows.

## 6. Deploy

**No migration.** This merges and deploys on its own — the first feature in this sequence with no
database step. Normal PR, CI, merge.
