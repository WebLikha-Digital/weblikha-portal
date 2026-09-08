'use server'
/**
 * SETTINGS SERVER ACTIONS — Approvals + Template CRUD
 * All mutations are admin-only. revalidatePath('/settings') keeps fresh.
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { getSiteUrl } from '@/lib/site-url'

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
  const { data: approved, error } = await supabase
    .from('users').update({ approved: true }).eq('id', userId)
    .select('email, name').single()
  if (error) throw new Error(error.message)
  revalidatePath('/settings')
  await sendApprovalEmail(approved.email, approved.name)
}

/**
 * Notify a newly approved member by email. Best-effort: approval already
 * succeeded, so email failures are logged, never thrown.
 */
async function sendApprovalEmail(email: string, name: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[approveUser] RESEND_API_KEY not set — skipping approval email')
    return
  }
  try {
    const resend = new Resend(apiKey)
    const portalUrl = getSiteUrl()
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM ?? 'Weblikha Portal <onboarding@resend.dev>',
      to: email,
      subject: "You're approved — welcome to the Weblikha Portal",
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#101010;color:#ffffff;border-radius:12px;">
          <h1 style="font-size:20px;margin:0 0 16px;">Welcome aboard, ${name}!</h1>
          <p style="color:#b3b3b3;line-height:1.6;margin:0 0 24px;">
            Your Weblikha Portal account has been approved. You can now log in
            to see your projects, tasks, and performance points.
          </p>
          <a href="${portalUrl}/login"
             style="display:inline-block;background:#FDD33C;color:#101010;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">
            Log in to the portal
          </a>
        </div>`,
    })
    if (error) console.error('[approveUser] Resend error:', error.message)
  } catch (err) {
    console.error('[approveUser] Failed to send approval email:', err)
  }
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
