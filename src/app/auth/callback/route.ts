/**
 * AUTH CALLBACK ROUTE HANDLER
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase redirects here after the user clicks the magic link in their email.
 * Exchanges the `code` query param for a session, then sends the user to the
 * dashboard (or back to login on failure).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

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
