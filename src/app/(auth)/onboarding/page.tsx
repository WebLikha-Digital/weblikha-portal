/**
 * ONBOARDING PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Deliberately in the (auth) group, outside the portal shell: a page inside
 * (portal) would be caught by the same gate that sent the user here and
 * redirect to itself forever.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingForm } from '@/components/modules/profile/OnboardingForm'

export const metadata: Metadata = { title: 'Welcome' }

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, name, role, avatar_url, approved, onboarded_at')
    .eq('id', authUser.id)
    .single()

  if (!profile) redirect('/login?error=profile_missing')
  if (profile.role !== 'admin' && !profile.approved) redirect('/pending')
  if (profile.onboarded_at) redirect('/dashboard')

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://cdn.prod.website-files.com/6829ba317137e68337ab4113/6829e463f9165ea007955225_Weblikha-Logo.svg"
            alt="Weblikha"
            className="mx-auto h-12 w-auto"
          />
        </div>

        <div className="card p-6 sm:p-8">
          <h1 className="text-lg font-display font-semibold text-primary">
            Welcome to the Weblikha portal
          </h1>
          <p className="mt-1 mb-6 text-sm text-secondary">
            A few details so the team knows who you are and when you&apos;re around.
          </p>

          <OnboardingForm
            userId={profile.id}
            name={profile.name}
            isClient={profile.role === 'client'}
            avatarUrl={profile.avatar_url}
          />
        </div>

        {/* Escape hatch: if completeOnboarding ever fails (a transient write,
            or a timezone Postgres's tzdata rejects), this screen must not be
            a dead end — copied from (auth)/pending/page.tsx. */}
        <div className="mt-4 text-center">
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-secondary hover:text-primary transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
