/**
 * AUTH CONFIRM ROUTE HANDLER (token_hash / verifyOtp)
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS — do not "simplify" it back to exchangeCodeForSession.
 *
 * `@supabase/ssr` hardcodes `flowType: 'pkce'`, so every link our own app
 * asks for carries a code verifier in the requesting browser's cookies, and
 * `/auth/callback?code=…` can redeem it. That covers Google OAuth and the
 * magic link — both are initiated by the person who then clicks the email.
 *
 * A client INVITE is not. `admin.auth.admin.inviteUserByEmail()` is generated
 * server-side by the admin, for somebody else's inbox. No PKCE verifier is
 * ever created for the client's browser, so GoTrue cannot emit a `?code=`
 * they could redeem — it falls back to returning the session in the URL
 * *fragment*, which a server route never sees. `/auth/callback` finds no
 * `code`, bounces to `/login?error=missing_code`, and the single-use token is
 * burned by that click.
 *
 * `verifyOtp({ token_hash, type })` needs no verifier at all: the hash in the
 * email IS the credential. That makes an admin-generated invite (and a
 * recovery link) redeemable by whoever opens the email, which is the whole
 * point. Pair this route with `{{ .TokenHash }}` in the Supabase email
 * templates — see docs/client-invite-email-templates.md.
 *
 * verifyOtp is called on the SERVER client so the session it returns is
 * written to cookies on this response, before the redirect. By the time
 * /set-password renders, the user is signed in.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/safe-redirect'
import { NextResponse } from 'next/server'

/**
 * The only OTP types this app emits. `type` comes straight off the query
 * string, so it is allowlisted rather than passed through — `EmailOtpType`
 * itself widens to `string & {}` and would accept anything.
 */
const ALLOWED_OTP_TYPES = ['invite', 'recovery', 'magiclink', 'email'] as const satisfies readonly EmailOtpType[]

type AllowedOtpType = (typeof ALLOWED_OTP_TYPES)[number]

function isAllowedOtpType(value: string | null): value is AllowedOtpType {
  return value !== null && (ALLOWED_OTP_TYPES as readonly string[]).includes(value)
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)

  const tokenHash = searchParams.get('token_hash')
  const type      = searchParams.get('type')
  const next      = safeNextPath(searchParams.get('next'))

  // Neither param present at all means this request did not come from a
  // {{ .TokenHash }} template. It is the fingerprint of Supabase's DEFAULT
  // template: that one sends the user to /auth/v1/verify, which consumes the
  // token itself and then bounces here with the session in the URL fragment
  // and no query params. Worth its own error code, because "the template was
  // never updated" and "this link is genuinely spent" are the same screen
  // otherwise — and blaming the recipient's mail filter for a dashboard
  // misconfiguration costs an invite and an afternoon.
  if (!tokenHash && type === null) {
    console.error(
      '[auth/confirm] no token_hash and no type — the Supabase email template is '
      + 'almost certainly still the default {{ .ConfirmationURL }}. See '
      + 'docs/client-invite-email-templates.md.',
    )
    return NextResponse.redirect(`${origin}/login?error=link_misconfigured`)
  }

  if (!tokenHash || !isAllowedOtpType(type)) {
    console.error(
      '[auth/confirm] missing or unsupported params',
      { hasTokenHash: Boolean(tokenHash), type },
    )
    return NextResponse.redirect(`${origin}/login?error=invite_expired`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error) {
    // Nearly always an already-consumed or expired hash. `invite_expired`
    // already carries the "your mail filter may have opened it" copy.
    console.error('[auth/confirm]', error.message)
    return NextResponse.redirect(`${origin}/login?error=invite_expired`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
