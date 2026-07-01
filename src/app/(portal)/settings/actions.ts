'use server'
/**
 * SETTINGS SERVER ACTIONS — Approvals + Template CRUD
 * All mutations are admin-only. revalidatePath('/settings') keeps fresh.
 */
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

// Approvals

export async function approveUser(userId: string) {
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('users').update({ approved: true }).eq('id', userId)
  if (error) throw new Error(error.message)
  revalidatePath('/settings')
  // TODO: send Resend email (see memory: project_resend_reminder)
}

export async function rejectUser(userId: string) {
  const supabase = await requireAdmin()
  const { error } = await supabase.from('users').delete().eq('id', userId)
  if (error) throw new Error(error.message)
  revalidatePath('/settings')
}

// Templates

export async function createTemplate(name: string, description?: string) {
  const supabase = await requireAdmin()
  const { data, error } = await supabase
    .from('project_templates')
    .insert({ name: name.trim(), description: description?.trim() || null })
    .select().single()
  if (error) throw new Error(error.message)
  revalidatePath('/settings')
  return data
}

export async function updateTemplate(id: string, name: string, description: string | null) {
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('project_templates')
    .update({ name: name.trim(), description: description?.trim() || null })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/settings')
}

export async function deleteTemplate(id: string) {
  const supabase = await requireAdmin()
  await supabase.from('project_templates').delete().eq('id', id)
  revalidatePath('/settings')
}

// Phases

export async function createTemplatePhase(templateId: string, name: string, position: number) {
  const supabase = await requireAdmin()
  const { data, error } = await supabase
    .from('template_task_lists')
    .insert({ template_id: templateId, name: name.trim(), position })
    .select().single()
  if (error) throw new Error(error.message)
  revalidatePath('/settings')
  return data
}

export async function updateTemplatePhase(id: string, name: string) {
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('template_task_lists').update({ name: name.trim() }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/settings')
}

export async function deleteTemplatePhase(id: string) {
  const supabase = await requireAdmin()
  await supabase.from('template_task_lists').delete().eq('id', id)
  revalidatePath('/settings')
}

// Tasks

export async function createTemplateTask(
  taskListId: string,
  title: string,
  pointsValue: number,
  position: number,
) {
  const supabase = await requireAdmin()
  const { data, error } = await supabase
    .from('template_tasks')
    .insert({
      template_task_list_id: taskListId,
      title: title.trim(),
      points_value: pointsValue,
      position,
    })
    .select().single()
  if (error) throw new Error(error.message)
  revalidatePath('/settings')
  return data
}

export async function deleteTemplateTask(id: string) {
  const supabase = await requireAdmin()
  await supabase.from('template_tasks').delete().eq('id', id)
  revalidatePath('/settings')
}
