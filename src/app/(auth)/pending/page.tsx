/**
 * PENDING APPROVAL PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Shown to signed-in users who haven't been approved by an admin yet.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Awaiting Approval' }

export default function PendingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <div className="w-full max-w-sm text-center">
        {/* Logo */}
        <div className="mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://cdn.prod.website-files.com/6829ba317137e68337ab4113/6829e463f9165ea007955225_Weblikha-Logo.svg"
            alt="Weblikha"
            className="mx-auto h-12 w-auto"
          />
        </div>

        <div className="card p-8">
          {/* Icon */}
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-warning/10">
            <svg className="size-6 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>

          <h1 className="text-lg font-semibold text-primary mb-2">
            Awaiting approval
          </h1>
          <p className="text-sm text-secondary leading-relaxed mb-6">
            Your account has been created. A Weblikha admin will review and approve
            your access shortly. You&apos;ll be able to sign in once approved.
          </p>

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-secondary hover:text-primary transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>

        <p className="mt-4 text-2xs text-tertiary">
          Questions? Reach out to your admin directly.
        </p>
      </div>
    </div>
 