'use client'
/**
 * LOGIN PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Google OAuth via Supabase — one click, no password needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGoogleSignIn() {
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // On success Supabase redirects the browser — no need to handle here
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://cdn.prod.website-files.com/6829ba317137e68337ab4113/6829e463f9165ea007955225_Weblikha-Logo.svg"
            alt="Weblikha"
            className="mx-auto h-12 w-auto"
          />
        </div>

        {/* Card */}
        <div className="card p-6">
          <h1 className="mb-1 text-xl">Sign in</h1>
          <p className="mb-6 text-xs text-secondary">
            Use your Google account to access the portal.
          </p>

          {error && (
            <div className="mb-4 rounded-md bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="flex h-10 w-full items-center justify-center gap-3 rounded-md border border-[var(--color-border-default)] bg-bg-surface-2 text-sm font-medium text-primary transition-colors hover:bg-bg-surface-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {/* Google icon */}
            {!loading && (
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
              </svg>
            )}
            {loading ? 'Redirecting…' : 'Continue with Google'}
          </button>
        </div>

        <p className="mt-4 text-center text-2xs text-tertiary">
          Access is limited to authorized team members.
        </p>
      </div>
    </div>
  )
}
