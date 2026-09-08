# Supabase email templates for the client invite flow

**The code in this repo does nothing until these templates are changed by hand.**
`/auth/confirm` exists to verify a token hash, but Supabase's *default* templates never
emit one — they emit `{{ .ConfirmationURL }}`, which is the broken path. Paste the bodies
below into the Supabase dashboard for **each** project (dev and prod are separate projects
with separate template settings).

---

## Why this is necessary at all

`@supabase/ssr` 0.5.2 hardcodes `flowType: "pkce"` (`createBrowserClient.js:37`,
`createServerClient.js:29`). PKCE requires a *code verifier* stored in the browser of the
person who will click the link.

| Flow | Who starts it | Verifier exists? | Works with `?code=`? |
|---|---|---|---|
| Google OAuth | the user's own browser | yes | ✅ yes — keep using `/auth/callback` |
| Magic link (`/auth/magic-link`) | server, for that same user | yes, in their cookies | ✅ yes — keep using `/auth/callback` |
| **Client invite** (`inviteUserByEmail`) | **the admin, for someone else** | **no — nowhere** | ❌ no |
| **Resend / recovery** | admin, for someone else | previously landed in the **admin's** cookies | ❌ no |

For the bottom two, GoTrue cannot issue a `?code=` the recipient can redeem, so it falls
back to returning the session in the **URL fragment** — which is never sent to the server,
so `/auth/callback` sees no `code`, redirects to `/login?error=missing_code`, and the
single-use token has already been burned by that click.

`verifyOtp({ token_hash, type })` needs no verifier: the hash in the email *is* the
credential. `{{ .TokenHash }}` in the template is what puts that hash in the email.

---

## Where to paste

Supabase Dashboard → your project → **Authentication → Emails → Templates**
(older dashboards: **Authentication → Email Templates**).

Edit the **Message body** field only. Leave the subject lines however you like them.

### 1. Template: **Invite user**

```html
<h2>You've been invited to the Weblikha Portal</h2>

<p>Hi — Weblikha Digital has set up a portal account for you. You'll use it to follow your
project, file requests, and message the team.</p>

<p>Click below to choose a password and finish setting up your account:</p>

<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password">
    Set your password
  </a>
</p>

<p>This link can only be used once. If it stops working, ask your Weblikha contact to send
a fresh one, or enter your email on the sign-in page to request a new link.</p>
```

### 2. Template: **Reset password**

Used by the **Resend** button on `/clients` as well as by genuine password resets — both go
through `resetPasswordForEmail`, so both render this template.

```html
<h2>Set a new password</h2>

<p>Someone (probably you, or your Weblikha contact) asked for a fresh link to your Weblikha
Portal account.</p>

<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/set-password">
    Choose a new password
  </a>
</p>

<p>This link can only be used once and expires shortly. If you didn't ask for it, you can
ignore this email — your current password still works.</p>
```

---

## Getting the details exactly right

These are pasted by hand and a wrong value fails **silently**, so check each one:

- **`type` must match the template.** `type=invite` on Invite user, `type=recovery` on
  Reset password. A mismatched `type` makes GoTrue's `/verify` reject the hash, the user
  lands on `/login?error=invite_expired`, and the token is consumed — indistinguishable
  from a genuinely expired link. `/auth/confirm` only accepts
  `invite | recovery | magiclink | email`; anything else is rejected before the call.
- **`{{ .TokenHash }}`** — capital T, capital H, spaces inside the braces. Not
  `{{ .Token }}` (that's the 6-digit OTP) and not `{{ .ConfirmationURL }}`.
- **`next=/set-password`** — leading slash, no origin. `/auth/confirm` rejects anything
  that isn't a single-slash-prefixed path and falls back to `/dashboard`, which would drop
  an invited client into the portal without a password set.
- **Use a plain `&`** between the query params, not `&amp;`. Supabase does not HTML-escape
  the template body for you, and `&amp;` would arrive as a literal parameter name.
- **Do not add `redirect_to=`** to the URL. It is not needed — `next` does that job here —
  and an unallowlisted value would be dropped.

### `{{ .SiteURL }}` vs. a hardcoded origin — use `{{ .SiteURL }}`

Dev and production are **separate Supabase projects** (`tydreidoqzndxjftpyzd` and
`vhsuyouczctnkvnnjzgg`) with independent template and URL settings. `{{ .SiteURL }}`
renders each project's own **Site URL**, so the identical template body is correct in both
places, and a custom-domain change later is a one-field edit under URL Configuration rather
than a template rewrite. Hardcoding `https://portal.weblikha.com` would work in prod and
silently send dev invites to production.

The one prerequisite: **Site URL must actually be right in each project.**

| Project | Authentication → URL Configuration → Site URL |
|---|---|
| Dev `tydreidoqzndxjftpyzd` | `http://localhost:3000` |
| Prod `vhsuyouczctnkvnnjzgg` | `https://<production-domain>` (no trailing slash) |

Note this is *not* the same as `NEXT_PUBLIC_SITE_URL` in `.env.local` / Vercel. That env var
feeds `getSiteUrl()` for the `redirectTo` we pass to the Auth API; `{{ .SiteURL }}` is a
Supabase-side setting. They should agree, and they are configured separately.

---

## Redirect URLs to allowlist

Authentication → **URL Configuration → Redirect URLs**. GoTrue validates the `redirectTo`
we send with `inviteUserByEmail` and `resetPasswordForEmail` against this list *at send
time* and rejects the call outright if it doesn't match, so the invite never leaves.
`passwordSetupUrl()` now sends `<site>/auth/confirm?next=/set-password`.

The `/**` wildcard is required — a bare origin does not match a path, and without a match
Supabase silently ignores `redirectTo` and falls back to the Site URL.

**Dev project — add:**

```
http://localhost:3000/**
```

**Prod project — add both:**

```
https://<production-domain>/**
https://weblikha-portal-*-<vercel-scope>.vercel.app/**
```

The second entry covers Vercel preview deployments, where the hostname is generated per
build. It only matters if invites are ever sent from a preview; `getSiteUrl()` falls back to
`VERCEL_URL` there, so leave `NEXT_PUBLIC_SITE_URL` unset for the Preview scope.

---

## Also confirm the SMTP sender

Authentication → **Emails → SMTP Settings** must point at Resend on the verified domain.
If the sender is ever reset to `onboarding@resend.dev`, Resend delivers **only** to the
account owner and every client invite fails silently with no error anywhere.

---

## How to verify it worked

Do this on **dev** first, with a real inbox you control that is *not* the admin account.

1. **Templates saved.** Reopen both templates in the dashboard and confirm the body still
   contains `{{ .TokenHash }}` and the right `type=`. The editor discards changes if you
   navigate away without saving.
2. **Send an invite.** `/clients` → Invite client, with a real address. It should appear in
   the list as **Invite pending**.
3. **Inspect the email before clicking.** The link must look like
   `http://localhost:3000/auth/confirm?token_hash=pkce_…&type=invite&next=/set-password`.
   If you see `.../auth/v1/verify?token=…` instead, the template did not save — the default
   `{{ .ConfirmationURL }}` is still in there. Stop and fix that.
4. **Open it in a different browser or a private window** — one with no Supabase session at
   all. This is the whole point of the fix: it must be redeemable by someone who is not the
   admin. It should land on `/set-password` showing the invited email address, not on
   `/login`.
5. **Set a password.** You should end up on `/dashboard` as that client.
6. **Sign out and sign back in** with email + password on `/login`. This proves the password
   actually persisted rather than the session merely existing.
7. **Test Resend.** Back on `/clients` as admin, the row now reads **Active** — the Resend
   button must still be visible (it is shown for every non-revoked row precisely because a
   mail scanner can flip a row to Active without the client ever seeing the page). Click it,
   check the email links to `/auth/confirm?...&type=recovery&next=/set-password`, and redeem
   it in a private window.
8. **Check the negative path.** Click an already-used link a second time. Expect a redirect
   to `/login?error=invite_expired` with the "some company email filters open links
   automatically" copy — and a `[auth/confirm]` line in the server log.
9. **Regression check the untouched flows.** Sign in with Google, and request a magic link
   from `/login`. Both still go through `/auth/callback?code=` and must still work.

Then repeat steps 1–3 on **prod** after applying migration 014 there.
