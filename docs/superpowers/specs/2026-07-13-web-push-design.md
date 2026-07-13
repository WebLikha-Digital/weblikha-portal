# Web Push Notifications (PWA Service Worker) — Design

**Date:** 2026-07-13
**Status:** Approved by Matthew

## Goal

Deliver push notifications to team members' devices for the events that already
create in-app bell notifications (migration 013): **@mentions in task comments**
and **task assignments**. This completes the PWA groundwork (manifest + icons
shipped in the "Mobile PWA" commit) with a service worker — push-only, no
offline caching.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Service worker scope | Push-only. No offline/app-shell caching (live-data tool; stale-cache risk outweighs benefit). |
| Which events push | Exactly mirror the bell: `mention` and `task_assigned`. No new notification types. |
| Opt-in UX | "Enable push notifications" row inside the bell dropdown. Dismissible, remembered in localStorage. |
| Delivery architecture | Send from the existing Server Actions (same sites as Resend mention emails), using the `web-push` npm package with VAPID keys. No Edge Functions, no third-party push service. |

## Architecture

```
[browser gesture in bell dropdown]
  → Notification.requestPermission()
  → registration.pushManager.subscribe(VAPID public key)
  → insert row into push_subscriptions (own-row RLS)

[Server Action: mention / assignment]
  → existing DB trigger inserts bell notification (unchanged)
  → sendPushToUsers(recipients, payload)        src/lib/push.ts (server-only)
      → admin client reads recipients' push_subscriptions
      → web-push sendNotification per subscription
      → 404/410 response → delete that subscription row

[public/sw.js]
  push event          → showNotification(title, body, icon, data.url)
  notificationclick   → focus existing portal tab or open data.url
```

## Schema — migration `014_push_subscriptions.sql`

```
push_subscriptions
  id          uuid pk default gen_random_uuid()
  user_id     uuid not null → users(id) on delete cascade
  endpoint    text not null unique          -- push service URL, identifies device
  p256dh      text not null                 -- client public key
  auth        text not null                 -- client auth secret
  user_agent  text                          -- device label for debugging
  created_at  timestamptz not null default now()
  updated_at  timestamptz not null default now()  + set_updated_at trigger
```

- Index: `idx_push_subscriptions_user` on `(user_id)`.
- One row per browser/device; a user may have several (phone + laptop).
- Upsert on `endpoint` conflict when re-subscribing.

### RLS

Owner-only for **all** operations (`user_id = auth.uid()` for select / insert /
update / delete). No directory read, no admin policy, no security-definer RPC —
subscription keys let anyone push to that device, so they are never exposed to
other users. Use `gen_random_uuid()`, not `uuid_generate_v4()` (CLI
search_path rule).

### Server-side reads: admin client

When user A mentions user B, the Server Action runs under A's session and
correctly cannot read B's subscriptions. Sending therefore uses a new
**server-only admin client**:

- `src/lib/supabase/admin.ts` — creates a Supabase client with
  `SUPABASE_SERVICE_ROLE_KEY`; imports the `server-only` package so any
  accidental client-side import fails the build.
- Used **exclusively** inside `src/lib/push.ts` (subscription reads + dead-row
  deletes). Never in components, never in the browser.

## Client side

### `public/sw.js`

Plain JavaScript, no build step, push-only:

- `push` event → parse JSON payload `{ title, body, url }` →
  `self.registration.showNotification(title, { body, icon: '/icons/icon-192.png',
  badge: '/icons/icon-192.png', data: { url } })`.
- `notificationclick` → close notification, focus an open portal window if one
  exists, else `clients.openWindow(data.url)`.

### Registration + subscription (new client module/component)

- SW registration runs quietly on portal load (no permission needed to register).
- Bell dropdown gains an **"Enable push notifications"** row, visible only when:
  `'serviceWorker' in navigator && 'PushManager' in window`, permission is
  `'default'`, and the user hasn't dismissed it (localStorage flag).
  - Tap → permission prompt → `pushManager.subscribe({ userVisibleOnly: true,
    applicationServerKey: <NEXT_PUBLIC_VAPID_PUBLIC_KEY> })` → save subscription
    via new Server Actions in `src/app/(portal)/actions.ts` (shell-level, since
    the bell lives in PortalShell, not under one route): `savePushSubscription`
    (upsert on endpoint) and `deletePushSubscription` → success toast, row
    disappears.
  - "Not now" dismiss → localStorage flag, row hidden.
  - Permission `denied` → row hidden, no nagging.
- iOS Safari only exposes `PushManager` once the portal is installed to the
  home screen, so the row naturally appears only in the installed PWA — no
  platform special-casing.
- Standing rules apply: pending state on the enable button, toast on outcome,
  focus-visible styles, mobile + desktop in the same pass.

## Send path

### `src/lib/push.ts` (server-only)

```ts
sendPushToUsers(userIds: string[], payload: { title: string; body: string; url: string }): Promise<void>
```

- No-ops with one `console.warn` if VAPID env vars are missing (dev without keys keeps working).
- Reads all subscriptions for `userIds` via the admin client.
- `web-push` `sendNotification` per subscription, VAPID-signed.
- `404`/`410` response → delete that subscription row (self-cleaning table).
- Other errors → `console.error` (mirrors Resend per-send logging). Never throws
  into the calling action.

### Call sites in `src/app/(portal)/projects/actions.ts`

Fire-and-forget alongside the existing email/trigger flow (recipient rules
identical to the migration-013 triggers — never self, only newly added mentions
on edit):

| Event | Site | Payload |
|---|---|---|
| Mention (new comment) | `createTaskComment` (beside `sendMentionEmails`) | title: `{actor} mentioned you` · body: task title · url: `/projects/{projectId}?tab=todos` |
| Mention (edited comment, new mentions only) | `updateTaskComment` | same as above |
| Assigned on create | `createTask` when `assignee_id` set and ≠ actor | title: `New task assigned` · body: `{actor} assigned you "{task title}"` · same url |
| Reassigned | `updateTask` when `assignee_id` changes to another user | same as assigned |

`claimTask` sends nothing (self-assignment; the bell trigger also skips it).
The deep-link matches the bell's existing navigation
(`/projects/{project_id}?tab=todos`).

## Environment variables

| Var | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | .env.local + Vercel (all envs) | safe to expose |
| `VAPID_PRIVATE_KEY` | .env.local + Vercel | secret |
| `VAPID_SUBJECT` | .env.local + Vercel | `mailto:weblikhadigital@gmail.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | .env.local (dev project key) + Vercel prod (already present) | server-only |

Generate keys once per environment pair with `npx web-push generate-vapid-keys`.
Update `.env.local.example`.

## Error handling summary

- Dead/expired subscriptions: deleted on 404/410.
- Missing VAPID config: sends skipped with a single warning.
- Push failure: logged, never fails the user's action.
- Unsupported browser / denied permission: enable row hidden.

## Testing

1. `npm run check` (lint + typecheck).
2. Manual smoke: enable push on Chrome desktop and Android Chrome (and iOS
   installed PWA if available); from a second account, mention and assign the
   first user; verify pushes arrive **with the portal closed** and clicking one
   opens the right project tab.
3. Verify a 410 cleanup by unsubscribing in browser settings and re-triggering
   (row should disappear from `push_subscriptions`).
4. RLS check: as user A, `select * from push_subscriptions` returns only A's rows.

## Out of scope (explicitly)

Per-type notification preferences, offline/app-shell caching, pushes for
message-board posts, Badging API, notification grouping.
