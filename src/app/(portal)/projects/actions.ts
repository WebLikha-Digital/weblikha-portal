'use server'
/**
 * PROJECT SERVER ACTIONS
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { TaskStatus } from '@/types'

export async function createProject(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('id, role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Only admins can create projects.')

  const name        = formData.get('name')?.toString().trim() ?? ''
  const client_name = formData.get('client_name')?.toString().trim() ?? ''
  const status      = formData.get('status')?.toString() ?? 'discovery'
  const start_date  = formData.get('start_date')?.toString() ?? ''
  const end_date    = formData.get('end_date')?.toString() ?? ''
  const budget      = parseFloat(formData.get('budget')?.toString() ?? '0')
  const description = formData.get('description')?.toString().trim() || null
  const memberIds   = formData.getAll('member_ids').map(v => v.toString())

  if (!name || !client_name || !start_date || !end_date) {
    throw new Error('Please fill in all required fields.')
  }

  const { data: project, error } = await supabase
    .from('projects')
    .insert({ name, client_name, status, start_date, end_date, budget, description, created_by: profile.id })
    .select('id')
    .single()

  if (error || !project) throw new Error(error?.message ?? 'Failed to create project.')

  const allMemberIds = Array.from(new Set([profile.id, ...memberIds]))
  if (allMemberIds.length > 0) {
    await supabase.from('project_members').insert(
      allMemberIds.map(uid => ({
        project_id:      project.id,
        user_id:         uid,
        role_in_project: uid === profile.id ? 'admin' : 'member',
      }))
    )
  }

  revalidatePath('/projects')
  redirect(`/projects/${project.id}`)
}

export async function addProjectMember(projectId: string, userId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Admin only.')

  const { error } = await supabase.from('project_members').insert({
    project_id:      projectId,
    user_id:         userId,
    role_in_project: 'member',
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}

export async function removeProjectMember(projectId: string, userId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Admin only.')

  await supabase.from('project_members')
    .delete().eq('project_id', projectId).eq('user_id', userId)
  revalidatePath(`/projects/${projectId}`)
}

// ── Task list (phase) actions ──────────────────────────────────────────────────

export async function createTaskList(projectId: string, name: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { count } = await supabase
    .from('task_lists')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)

  const { error } = await supabase.from('task_lists').insert({
    project_id: projectId,
    name:       name.trim(),
    position:   count ?? 0,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}

export async function deleteTaskList(taskListId: string, projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Admin only.')

  await supabase.from('task_lists').delete().eq('id', taskListId)
  revalidatePath(`/projects/${projectId}`)
}

// ── Task actions ───────────────────────────────────────────────────────────────

export async function createTask(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const projectId   = formData.get('project_id')?.toString() ?? ''
  const taskListId  = formData.get('task_list_id')?.toString() ?? ''
  const title       = formData.get('title')?.toString().trim() ?? ''
  const dueDate     = formData.get('due_date')?.toString() ?? ''
  const assigneeId  = formData.get('assignee_id')?.toString() || null
  const pointsValue = parseInt(formData.get('points_value')?.toString() ?? '60', 10)

  if (!title || !dueDate || !projectId || !taskListId) {
    throw new Error('Title, due date, project and phase are required.')
  }

  const { error } = await supabase.from('tasks').insert({
    project_id:   projectId,
    task_list_id: taskListId,
    title,
    due_date:     dueDate,
    assignee_id:  assigneeId,
    points_value: isNaN(pointsValue) ? 60 : pointsValue,
    status:       'pending',
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}

export async function updateTaskStatus(taskId: string, status: TaskStatus, projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('tasks').update({ status }).eq('id', taskId)
  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
}

export async function deleteTask(taskId: string, projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Admin only.')

  await supabase.from('tasks').delete().eq('id', taskId)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
}

// ── Template actions ───────────────────────────────────────────────────────────

export async function applyTemplate(projectId: string, templateId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Admin only.')

  const { data: template, error: tErr } = await supabase
    .from('project_templates')
    .select('*, task_lists: template_task_lists(*, tasks: template_tasks(*))')
    .eq('id', templateId)
    .single()

  if (tErr || !template) throw new Error('Template not found.')

  const { count: existingCount } = await supabase
    .from('task_lists')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)

  let positionOffset = existingCount ?? 0

  const sortedLists = [...(template.task_lists ?? [])].sort(
    (a: { position: number }, b: { position: number }) => a.position - b.position
  )

  for (const tList of sortedLists) {
    const { data: newList, error: lErr } = await supabase
      .from('task_lists')
      .insert({ project_id: projectId, name: tList.name, position: positionOffset++ })
      .select('id')
      .single()

    if (lErr || !newList) continue

    const sortedTasks = [...(tList.tasks ?? [])].sort(
      (a: { position: number }, b: { position: number }) => a.position - b.position
    )

    if (sortedTasks.length > 0) {
      const defaultDue = new Date()
      defaultDue.setDate(defaultDue.getDate() + 30)
      const dueDateStr = defaultDue.toISOString().split('T')[0]!

      await supabase.from('tasks').insert(
        sortedTasks.map((t: { title: string; points_value: number }) => ({
          project_id:   projectId,
          task_list_id: newList.id,
          title:        t.title,
          due_date:     dueDateStr,
          points_value: t.points_value ?? 60,
          status:       'pending',
        }))
      )
    }
  }

  revalidatePath(`/projects/${projectId}`)
}
