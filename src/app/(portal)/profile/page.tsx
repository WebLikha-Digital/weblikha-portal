/**
 * PROFILE PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Your own details. Viewing someone else's profile is not a thing here — the
 * Team tab already lists people.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileForm } from '@/components/modules/profile/ProfileForm'
import type { User } from '@/types'

export const metadata: Metadata = { title: 'Profile' }

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('*').eq('id', authUser.id).single()
  if (!profile) redirect('/login?error=profile_missing')

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-xl font-display font-semibold text-primary">Profile</h1>
        <p className="text-sm text-secondary mt-1">
          How you appear to the rest of the portal.
        </p>
      </div>

      <ProfileForm user={profile as User} />
    </div>
  )
}
