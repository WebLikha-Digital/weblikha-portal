'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Admin only.')
  return supabase
}

/**
 * Upsert admin_points + admin_note for a provider in a given period.
 * Uses select-then-insert/update to avoid zeroing task_points / deadline_points
 * (Supabase upsert would overwrite those with the provided defaults).
 */
export async function updateAdminPoints(
  userId: string,
  month: number,
  year: number,
  adminPoints: number,
  adminNote: string | null,
) {
  const supabase = await requireAdmin()

  const { data: existing } = await supabase
    .from('performance_periods')
    .select('id')
    .eq('user_id', userId)
    .eq('period_month', month)
    .eq('period_year', year)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('performance_periods')
      .update({ admin_points: adminPoints, admin_note: adminNote })
      .eq('id', existing.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('performance_periods')
      .insert({
        user_id:      userId,
        period_month: month,
        period_year:  year,
        admin_points: adminPoints,
        admin_note:   adminNote,
      })
    if (error) throw new Error(error.message)
  }

  revalidatePath('/team')
  revalidatePath('/dashboard')
}

/**
 * Toggle a provider's employment type between 'in-house' and 'outsource'.
 */
export async function updateEmploymentType(
  userId: string,
  employmentType: 'in-house' | 'outsource',
) {
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('users')
    .update({ employment_type: employmentType })
    .eq('id', userId)
  if (error) throw new Error(error.message)
  revalidatePath('/team')
}

/**
 * Replace the skills array for a provider.
 * Ordering matters — skills[0] is the primary display skill.
 */
export async function updateUserSkills(
  userId: string,
  skills: string[],
) {
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('users')
    .update({ skills })
    .eq('id', userId)
  if (error) throw new Error(error.message)
  revalidatePath('/team')
}
