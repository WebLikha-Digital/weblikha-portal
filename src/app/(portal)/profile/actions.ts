'use server'
/**
 * PROFILE ACTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Self-service edits only. Migration 016's guard_user_privileged_columns()
 * rejects any attempt to change role, approved or email here, so this action
 * does not need to re-check them — but it must never pass them through either.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isValidAvatarUrl, profileDraftError, type ProfileDraft } from '@/lib/profile'

export async function updateProfile(
  draft: ProfileDraft & { avatarUrl: string | null },
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  const isClient = profile?.role === 'client'

  const problem = profileDraftError(draft, isClient)
  if (problem) throw new Error(problem)

  if (!isValidAvatarUrl(draft.avatarUrl, user.id)) {
    throw new Error('That photo could not be saved.')
  }

  const blank = (value: string) => (value.trim() === '' ? null : value.trim())

  const { data, error } = await supabase
    .from('users')
    .update({
      name:            draft.name.trim(),
      phone:           blank(draft.phone),
      timezone:        draft.timezone,
      job_title:       blank(draft.jobTitle),
      location:        blank(draft.location),
      bio:             blank(draft.bio),
      birthdate:       draft.birthdate || null,
      company:         isClient ? blank(draft.company) : null,
      company_website: isClient ? blank(draft.companyWebsite) : null,
      avatar_url:      draft.avatarUrl,
    })
    .eq('id', user.id)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Could not save your profile. Try again.')

  // The sidebar and every avatar in the portal read this row.
  revalidatePath('/', 'layout')
}
