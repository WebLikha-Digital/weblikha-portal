/**
 * LOGIN PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Server Component — reads the status params the auth routes redirect back
 * with, then hands off to the client form.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Metadata } from 'next'
import { LoginForm } from '@/components/modules/auth/LoginForm'

export const metadata: Metadata = { title: 'Sign in' }

/** Friendly text for the codes the auth routes redirect back with. */
const ERROR_COPY: Record<string, string> = {
  missing_code:    'That sign-in link was incomplete. Ask for a new one below.',
  callback_failed: 'That sign-in link has expired or was already used. Ask for a new one below.',
  missing_email:   'Enter your email address first.',
  send_failed:     'We could not send that email. Try again in a moment.',
  profile_missing: 'Your account exists but has no profile yet. Contact your admin.',
  invite_expired:
    'That invite link has already been used. Some company email filters open links automatically — enter your email below and we will send a fresh one.',
  // Not the recipient's fault, so this one does not tell them to ask for a new
  // link — a fresh one built from the same template would fail identically.
  link_misconfigured:
    'That link was not built correctly, so we could not sign you in. This is a setup problem on our side, not something you did — please let your Weblikha contact know.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>
}) {
  const params = await searchParams
  const errorCopy = params.error ? ERROR_COPY[params.error] ?? 'Something went wrong. Try again.' : null
  const sent = params.sent === '1'

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
            Team members can use Google. Clients, use the email and password you set up.
          </p>

          {sent && (
            <div
              role="status"
              className="mb-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success"
            >
              Check your inbox — we sent you a sign-in link.
            </div>
          )}

          {errorCopy && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
            >
              {errorCopy}
            </div>
          )}

          <LoginForm />
        </div>

        <p className="mt-4 text-center text-2xs text-tertiary">
          Access is limited to authorized team members and invited clients.
        </p>
      </div>
    </div>
  )
}
