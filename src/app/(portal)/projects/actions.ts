'use server'
/**
 * PROJECT SERVER ACTIONS
 * Tasks, task lists, comments, members, and templates.
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

export async function renameTaskList(taskListId: string, projectId: string, name: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Admin only.')

  const trimmed = name.trim()
  if (!trimmed) throw new Error('Phase name cannot be empty.')

  const { error } = await supabase
    .from('task_lists').update({ name: trimmed }).eq('id', taskListId)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
}

/** Swap a phase with its neighbor (direction: -1 = up, +1 = down). */
export async function moveTaskList(taskListId: string, projectId: string, direction: -1 | 1) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Admin only.')

  const { data: lists } = await supabase
    .from('task_lists')
    .select('id, position')
    .eq('project_id', projectId)
    .order('position', { ascending: true })

  const ordered = lists ?? []
  const index   = ordered.findIndex(l => l.id === taskListId)
  const swapWith = ordered[index + direction]
  const current  = ordered[index]
  if (!current || !swapWith) return // already at the edge

  await supabase.from('task_lists').update({ position: swapWith.position }).eq('id', current.id)
  await supabase.from('task_lists').update({ position: current.position }).eq('id', swapWith.id)
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
  const description = formData.get('description')?.toString().trim() || null
  const dueDate     = formData.get('due_date')?.toString() ?? ''
  const assigneeId  = formData.get('assignee_id')?.toString() || null
  const pointsValue = parseInt(formData.get('points_value')?.toString() ?? '60', 10)

  if (!title || !dueDate || !projectId || !taskListId) {
    throw new Error('Title, due date, project and phase are required.')
  }

  // Append to the end of the list
  const { count } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('task_list_id', taskListId)

  const { error } = await supabase.from('tasks').insert({
    project_id:   projectId,
    task_list_id: taskListId,
    title,
    description,
    due_date:     dueDate,
    assignee_id:  assigneeId,
    points_value: isNaN(pointsValue) ? 60 : pointsValue,
    status:       'pending',
    position:     count ?? 0,
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

export async function updateTask(
  taskId: string,
  projectId: string,
  fields: {
    title?:        string
    description?:  string | null
    due_date?:     string
    assignee_id?:  string | null
    points_value?: number
  },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  const { data: task } = await supabase
    .from('tasks').select('assign