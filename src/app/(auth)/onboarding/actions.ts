'use server'
/**
 * ONBOARDING ACTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Sets the profile fields collected on first sign-in and stamps onboarded_at,
 * which is the only thing (portal)/layout.tsx checks. Nothing else writes it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isValidAvatarUrl, onboardingDraftError } from '@/lib/profile'

export async function completeOnboarding(input: {
  phone:     string
  timezone:  string
  company:   string
  avatarUrl: string | null
}): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role, onboarded_at').eq('id', user.id).single()

  // Onboarding happens once. The UI never shows the form again, but this is a
  // reachable endpoint — without this it would re-stamp onboarded_at and
  // overwrite a profile the person has since edited on /profile.
  if (profile?.onboarded_at) return

  const isClient = profile?.role === 'client'

  const problem = onboardingDraftError(input, isClient)
  if (problem) throw new Error(problem)

  if (!isValidAvatarUrl(input.avatarUrl, user.id)) {
    throw new Error('That photo could not be saved.')
  }

  const { data, error } = await supabase
    .from('users')
    .update({
      timezone:     input.timezone,
      company:      isClient ? input.company.trim() : null,
      avatar_url:   input.avatarUrl,
      onboarded_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select('id')

  if (error) {
    // guard_user_timezone() (migration 024) raises errcode 22023 with
    // "Unknown timezone: <value>" when Intl.supportedValuesOf offers a zone
    // Postgres's tzdata does not recognize. Production Next.js redacts the
    // real message, so this is the only chance to hand the person something
    // actionable instead of an opaque failure with no way out.
    const isTimezoneRejection = error.code === '22023' || /unknown timezone/i.test(error.message)
    if (isTimezoneRejection) {
      throw new Error('We could not save that timezone — pick the nearest city instead.')
    }
    throw new Error(error.message)
  }
  if (!data || data.length === 0) throw new Error('Could not save your details. Try again.')

  // phone lives in user_private (migration 024), not on users — see the
  // header comment there. These two writes are not atomic: if this second
  // one fails, users.onboarded_at is already set (so the welcome screen will
  // not show again) but the phone number was not saved. Throwing surfaces
  // that to the caller as a failure rather than a silent partial save; the
  // person can fix it on /profile afterward.
  const { error: privateError } = await supabase
    .from('user_private')
    .upsert({ user_id: user.id, phone: input.phone.trim() }, { onConflict: 'user_id' })

  if (privateError) throw new Error(privateError.message)

  revalidatePath('/', 'layout')
}
