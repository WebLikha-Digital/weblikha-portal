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
import { onboardingDraftError } from '@/lib/profile'

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

  const { data, error } = await supabase
    .from('users')
    .update({
      phone:        input.phone.trim(),
      timezone:     input.timezone,
      company:      isClient ? input.company.trim() : null,
      avatar_url:   input.avatarUrl,
      onboarded_at: new Date().toISOString(),
    })
    .eq('id', user.id)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Could not save your details. Try again.')

  revalidatePath('/', 'layout')
}
