'use server'
/**
 * MESSAGE CATEGORY SERVER ACTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin-only is enforced by migration 021's RLS. Categories are agency-wide, so
 * every project page is revalidated. Archiving replaces deleting.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { categoryDraftError } from '@/lib/messages'

const DUPLICATE_NAME = 'An active category already uses that name.'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return supabase
}

function revalidateProjects() {
  revalidatePath('/projects/[id]', 'page')
}

export async function createCategory(input: { name: string; emoji: string }): Promise<void> {
  const supabase = await requireUser()
  const problem  = categoryDraftError(input)
  if (problem) throw new Error(problem)

  const { data: last } = await supabase
    .from('message_categories')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase
    .from('message_categories')
    .insert({
      name:     input.name.trim(),
      emoji:    input.emoji.trim(),
      position: (last?.position ?? -1) + 1,
    })

  if (error) {
    if (error.code === '23505') throw new Error(DUPLICATE_NAME)
    throw new Error(error.message)
  }
  revalidateProjects()
}

export async function updateCategory(
  id: string,
  input: { name: string; emoji: string },
): Promise<void> {
  const supabase = await requireUser()
  const problem  = categoryDraftError(input)
  if (problem) throw new Error(problem)

  const { data, error } = await supabase
    .from('message_categories')
    .update({ name: input.name.trim(), emoji: input.emoji.trim() })
    .eq('id', id)
    .select('id')

  if (error) {
    if (error.code === '23505') throw new Error(DUPLICATE_NAME)
    throw new Error(error.message)
  }
  if (!data || data.length === 0) throw new Error('Only admins can edit categories.')
  revalidateProjects()
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const supabase = await requireUser()

  for (const [index, id] of orderedIds.entries()) {
    const { data, error } = await supabase
      .from('message_categories')
      .update({ position: index })
      .eq('id', id)
      .select('id')
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) throw new Error('Only admins can reorder categories.')
  }
  revalidateProjects()
}

export async function archiveCategory(id: string): Promise<void> {
  const supabase = await requireUser()

  const { data, error } = await supabase
    .from('message_categories')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('Only admins can archive categories.')
  revalidateProjects()
}

export async function restoreCategory(id: string): Promise<void> {
  const supabase = await requireUser()

  const { data, error } = await supabase
    .from('message_categories')
    .update({ archived_at: null })
    .eq('id', id)
    .select('id')

  if (error) {
    if (error.code === '23505') throw new Error(DUPLICATE_NAME)
    throw new Error(error.message)
  }
  if (!data || data.length === 0) throw new Error('Only admins can restore categories.')
  revalidateProjects()
}
