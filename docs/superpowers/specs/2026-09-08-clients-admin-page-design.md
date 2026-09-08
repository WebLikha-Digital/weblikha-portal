# Client Portal Stage 2 — `/clients` admin page

**Date:** 2026-09-08
**Status:** Approved, not yet implemented
**Scope:** UI only. All five Server Actions already exist in
`src/app/(portal)/clients/actions.ts` and are not modified by this work.

---

## Purpose

Give the admin one screen to invite clients, see who has finished onboarding, assign
projects, and cut off access. Nothing else in the client portal can be exercised until
this exists: Stage 1's invite/set-password flow has never been run end to end because
there is no UI to invite from, and Stages 3 and 4 both need real client accounts to
test against.

## Out of scope

- The message board (Stage 3) and the client-facing dashboard (Stage 4).
- Any change to `clients/actions.ts`.
- Any migration. See "Setup state" below for why this stays true.

---

## Decisions

### Setup state is read from `auth.users`, not stored

`public.users` has no column recording whether a client ever set a password, and
migration 014 does not touch `auth.users`. Rather than add one, the page reads
`last_sign_in_at` for each client through the service role and derives status:

| Condition | Status |
|---|---|
| `!approved` | **Revoked** |
| `last_sign_in_at == null` | **Invite pending** |
| otherwise | **Active** |

`last_sign_in_at` becomes non-null the moment the invite link is exchanged at
`/auth/callback`, so a null value means the client never clicked — exactly the state
in which "Resend invite" is the useful action.

Cost is N `getUserById` calls per page load, issued with `Promise.all`. At agency
scale N is small. Rejected alternatives: deriving status from `approved` alone (cannot
distinguish "never clicked" from "active", which makes the Resend button guesswork),
and adding `users.setup_completed_at` in a migration 015 (cheaper reads, but pulls a
schema change and a prod migration into what is meant to be a UI-only stage).

### Project assignment happens in a modal

Client rows are cards showing assigned projects as chips, with a "Manage projects"
button opening a checkbox modal that saves once via `setClientProjects`.

Chosen over an inline expandable row (gets tall on mobile, list jumps when several are
open) and over per-chip add/remove controls (one `setClientProjects` round-trip per
click, and a dropdown is the weakest of the three on a phone). A modal is also the one
layout that behaves identically on mobile and desktop, satisfying the standing rule
that both are built in the same pass.

### Clients is a sidebar item, not a sixth mobile tab

`ADMIN_TABS` in `MobileTabBar.tsx` already carries five tabs; a sixth leaves roughly
16% width each, too cramped to tap reliably. Clients is a low-frequency admin task
where Dashboard / Projects / Team / Revenue / Settings are daily ones, so it is
reachable on mobile through the `MobileNav` drawer (which renders the full sidebar)
and not promoted to the tab bar.

---

## Files

| File | Role |
|---|---|
| `src/app/(portal)/clients/page.tsx` | Server Component. Admin guard, four reads, groups memberships. |
| `src/app/(portal)/clients/loading.tsx` | Skeleton: header + 3 card rows. |
| `src/app/(portal)/clients/setup-state.ts` | `fetchClientSetupState(ids)` → `Map<string, string \| null>`. |
| `src/components/modules/clients/ClientList.tsx` | `'use client'`. Rows, optimistic state, modal ownership. |
| `src/components/modules/clients/InviteClientModal.tsx` | Email + name + optional projects → `inviteClient`. |
| `src/components/modules/clients/ManageProjectsModal.tsx` | Checkbox list → `setClientProjects`. |
| `src/components/modules/clients/ProjectPicker.tsx` | Shared checkbox list rendered by both modals. |

Modified: `src/components/layout/sidebar.tsx` (one `ADMIN_NAV` entry).

### Why `setup-state.ts` is a separate module

Every export in a `'use server'` file becomes a callable RPC endpoint. Putting the
auth-read helper in `actions.ts` would publish it as one. It lives in a plain module
imported only by `page.tsx`.

The `server-only` package is not installed in this repo, so the module carries no
compile-time guard. It is protected in two other ways: `createAdminClient()` throws on
`typeof window !== 'undefined'`, and it reads `SUPABASE_SERVICE_ROLE_KEY`, which is not
`NEXT_PUBLIC_`-prefixed and is therefore undefined in a client bundle.

### Deviation to note

`page.tsx` imports `createAdminClient`, whose header scopes it to "Server Actions and
Route Handlers". A Server Component is the same trust boundary and the admin guard runs
before the import is used, so this is within the rule's intent — but it widens a
documented line and should be reflected in that header comment when implemented.

---

## Data flow

`page.tsx`:

1. Auth + admin guard; non-admins `redirect('/dashboard')` (mirrors `settings/page.tsx`).
2. `users` where `role = 'client'`, ordered by name.
3. `projects` → `id, name, status` for the pickers.
4. `project_members` where `user_id` in the client ids.
5. `fetchClientSetupState(clientIds)`.

Memberships are grouped into `Map<userId, Project[]>` server-side, so `ClientList`
receives a flat array of `{ user, projects, status }` and does no joining of its own.

---

## Interaction

All five mutations run through `withToast` (`src/components/ui/toast.tsx`) so a thrown
action surfaces as a toast rather than crashing the tree, with `useOptimistic`
reverting the row — the same shape as `ApprovalQueue`. Every button carries hover,
`focus-visible`, and press states, plus a pending state that disables it in flight.

Revoke is gated on `confirmDialog`, and the copy states the consequence that CLAUDE.md
calls out explicitly:

> **Revoke access for {name}?**
> They'll be signed out of the portal and removed from all {n} assigned projects.
> Restoring them later does **not** restore project access — you'll need to reassign
> projects deliberately.

Empty state: when no clients exist, the list is replaced by a short prompt with the
Invite button, not an empty card stack.

---

## Verification

- `npm run check` (lint + typecheck) — must stay at the current zero-error baseline.
- Manual: invite a real address, confirm the email arrives via Resend SMTP, complete
  `/set-password`, and confirm the row flips from **Invite pending** to **Active**.
  This doubles as the first end-to-end test of Stage 1.
- Agents per CLAUDE.md: `ui-convention-checker`, `design-token-auditor`,
  `rls-security-reviewer`.
