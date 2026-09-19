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
      timezone:        draft.timezone,
      job_title:       blank(draft.jobTitle),
      location:        blank(draft.location),
      bio:             blank(draft.bio),
      company:         isClient ? blank(draft.company) : null,
      company_website: isClient ? blank(draft.companyWebsite) : null,
      avatar_url:      draft.avatarUrl,
    })
    .eq('id', user.id)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Could not save your profile. Try again.')

  // phone and birthdate live in user_private (migration 024), not on users —
  // see the header comment there. These two writes are not atomic: if this
  // second one fails, the rest of the profile has already saved but phone
  // and birthdate have not — throw so the caller sees a failure rather than
  // a silent partial save.
  const { error: privateError } = await supabase
    .from('user_private')
    .upsert(
      { user_id: user.id, phone: blank(draft.phone), birthdate: draft.birthdate || null },
      { onConflict: 'user_id' },
    )

  if (privateError) throw new Error(privateError.message)

  // The sidebar and every avatar in the portal read this row.
  revalidatePath('/', 'layout')
}
