'use client'
/**
 * LOGIN FORM
 * ─────────────────────────────────────────────────────────────────────────────
 * Three ways in, in priority order:
 *   1. Email + password  — how invited clients sign in
 *   2. Google OAuth      — how the team signs in
 *   3. Magic link        — fallback when a password is forgotten, or when an
 *                          invite link was burned by a mail scanner
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button, Input } from '@/components/ui'

export function LoginForm() {
  const router = useRouter()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [busy,     setBusy]     = useState<null | 'password' | 'google'>(null)
  const [error,    setError]    = useState<string | null>(null)

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password || busy) return

    setBusy('password')
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (error) {
      // Supabase returns the same message for "no such user" and "wrong
      // password" by design — don't dress it up into something that leaks
      // whether an account exists.
      setError('That email and password combination did not work.')
      setBusy(null)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  async function handleGoogleSignIn() {
    if (busy) return
    setBusy('google')
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setError(error.message)
      setBusy(null)
    }
    // On success Supabase redirects the browser — nothing more to do here
  }

  return (
    <>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {error}
        </div>
      )}

      {/* ── Email + password ─────────────────────────────────────────────── */}
      <form onSubmit={handlePasswordSignIn} className="flex flex-col gap-3">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@company.com"
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <Button
          type="submit"
          loading={busy === 'password'}
          disabled={!email.trim() || !password || busy !== null}
          className="w-full"
        >
          {busy === 'password' ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {/* Magic-link fallback. Posts the same email to the existing route so it
          still works with JavaScript disabled. */}
      <form action="/auth/magic-link" method="post" className="mt-2">
        <input type="hidden" name="email" value={email} />
        <button
          type="submit"
          disabled={!email.trim() || busy !== null}
          className="w-full rounded px-2 py-1 text-2xs text-secondary transition-colors duration-150 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Forgot it? Email me a sign-in link instead
        </button>
      </form>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--color-border-subtle)]" />
        <span className="text-2xs text-tertiary">or</span>
        <span className="h-px flex-1 bg-[var(--color-border-subtle)]" />
      </div>

      {/* ── Google ───────────────────────────────────────────────────────── */}
      <button
        onClick={handleGoogleSignIn}
        disabled={busy !== null}
        className="flex h-10 w-full items-center justify-center gap-3 rounded-md border border-[var(--color-border-default)] bg-bg-surface-2 text-sm font-medium text-primary transition-colors duration-150 hover:bg-bg-surface-3 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy !== 'google' && (
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
          </svg>
        )}
        {busy === 'google' ? 'Redirecting…' : 'Continue with Google'}
      </button>
    </>
  )
}
