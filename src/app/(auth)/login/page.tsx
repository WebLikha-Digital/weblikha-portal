/**
 * LOGIN PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Magic link auth via Supabase — team members get a link emailed to them.
 * No password management needed.
 *
 * Future: add SSO for the team if needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sign In' }

export default function LoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  const error = searchParams['error']

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <span className="font-display text-2xl font-semibold text-brand">
            weblikha
          </span>
          <p className="mt-1 text-xs text-secondary">Internal Portal</p>
        </div>

        {/* Card */}
        <div className="card p-6">
          <h1 className="mb-1 text-xl">Sign in</h1>
          <p className="mb-6 text-xs text-secondary">
            We&apos;ll send a magic link to your email — no password needed.
          </p>

          {error === 'profile_missing' && (
            <div className="mb-4 rounded-md bg-danger-bg border border-danger px-3 py-2 text-xs text-danger-fg">
              Account setup incomplete. Contact your admin.
            </div>
          )}

          {/* Magic link form — action handled by Route Handler at /auth/magic-link */}
          <form action="/auth/magic-link" method="post" className="space-y-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-xs text-secondary font-medium">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@weblikha.com"
                className="h-9 w-full rounded-md border border-[var(--color-border-default)] bg-bg-surface-2 px-3 text-sm text-primary placeholder:text-tertiary transition-colors focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
            <button
              type="submit"
              className="h-9 w-full rounded-md bg-brand text-sm font-medium text-brand-fg transition-colors hover:bg-brand-hover active:scale-[0.98]"
            >
              Send magic link
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-2xs text-tertiary">
          Only @weblikha.com emails can access this portal.
        </p>
      </div>
    </div>
  )
}
