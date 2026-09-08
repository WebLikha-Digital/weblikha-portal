/**
 * MAGIC LINK ROUTE HANDLER
 * ─────────────────────────────────────────────────────────────────────────────
 * Receives email from the login form, triggers a Supabase OTP (magic link)
 * email, then redirects the user back to /login with a status param.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const formData = await request.formData()
  const email = formData.get('email')?.toString().trim() ?? ''

  const origin = new URL(request.url).origin
  const redirectTo = `${origin}/auth/callback`

  if (!email) {
    return NextResponse.redirect(`${origin}/login?error=missing_email`, { status: 303 })
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      // Magic link is a sign-IN path, not a sign-UP path. Without this,
      // anyone who knows the URL can mint themselves an account.
      shouldCreateUser: false,
    },
  })

  if (error) {
    console.error('[magic-link]', error.message)
    return NextResponse.redirect(`${origin}/login?error=send_failed`, { status: 303 })
  }

  return NextResponse.redirect(`${origin}/login?sent=1`, { status: 303 })
}
