/**
 * AUTH CALLBACK ROUTE HANDLER
 * ─────────────────────────────────────────────────────────────────────────────
 * The PKCE path. Supabase redirects here after Google OAuth and after a magic
 * link — both are initiated from the same browser that clicks the email, so a
 * code verifier exists in that browser's cookies and `?code=` is redeemable.
 * Exchanges the `code` query param for a session, then sends the user to the
 * dashboard (or back to login on failure).
 *
 * Admin-generated links (client invites, and the recovery email we send on
 * their behalf) have no verifier anywhere and CANNOT use this route — they go
 * to /auth/confirm and verify a token hash instead. See that file's header.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/safe-redirect'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNextPath(searchParams.get('next'))

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[auth/callback]', error.message)
    return NextResponse.redirect(`${origin}/login?error=callback_failed`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
