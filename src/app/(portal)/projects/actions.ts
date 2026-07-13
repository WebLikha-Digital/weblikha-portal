'use server'
/**
 * PROJECT SERVER ACTIONS
 * Tasks, task lists, comments, members, and templates.
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Resend } from 'resend'
import { sendPushToUsers } from '@/lib/push'
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

/** Move a phase to a new index within the project (drag-and-drop). */
export async function reorderTaskList(taskListId: string, projectId: string, toIndex: number) {
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

  const ordered   = lists ?? []
  const fromIndex = ordered.findIndex(l => l.id === taskListId)
  if (fromIndex === -1) throw new Error('Phase not found.')

  const clamped = Math.max(0, Math.min(toIndex, ordered.length - 1))
  if (clamped === fromIndex) return

  const next = [...ordered]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return
  next.splice(clamped, 0, moved)

  // Rewrite only the positions that changed
  await Promise.all(
    next.flatMap((l, i) =>
      l.position === i
        ? []
        : [supabase.from('task_lists').update({ position: i }).eq('id', l.id)]
    )
  )
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

  if (assigneeId) {
    await notifyAssignment(supabase, assigneeId, user.id, title, projectId)
  }

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
    .from('tasks').select('assignee_id, title').eq('id', taskId).single()
  if (!task) throw new Error('Task not found.')

  const isAssignee = task.assignee_id === user.id
  if (!isAdmin && !isAssignee) {
    throw new Error('Only admins or the assignee can edit this task.')
  }

  const updates: Record<string, unknown> = {}
  if (fields.title !== undefined) {
    const title = fields.title.trim()
    if (!title) throw new Error('Title cannot be empty.')
    updates.title = title
  }
  if (fields.description !== undefined) updates.description = fields.description
  if (fields.due_date !== undefined)    updates.due_date    = fields.due_date
  if (fields.assignee_id !== undefined) {
    // Providers may only assign to themselves or unassign — never to someone else
    if (!isAdmin && fields.assignee_id !== null && fields.assignee_id !== user.id) {
      throw new Error('You can only assign this task to yourself.')
    }
    updates.assignee_id = fields.assignee_id
  }

  // Points affect incentive payouts — admin only
  if (fields.points_value !== undefined) {
    if (!isAdmin) throw new Error('Only admins can change points.')
    updates.points_value = fields.points_value
  }

  if (Object.keys(updates).length === 0) return

  const { error } = await supabase
    .from('tasks').update(updates).eq('id', taskId)
  if (error) throw new Error(error.message)

  // Push the new assignee when the task changed hands
  if (
    fields.assignee_id !== undefined &&
    fields.assignee_id !== null &&
    fields.assignee_id !== task.assignee_id
  ) {
    await notifyAssignment(
      supabase,
      fields.assignee_id,
      user.id,
      fields.title?.trim() || task.title,
      projectId,
    )
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
}

/**
 * Move a task to a new index, optionally into another phase (drag-and-drop).
 * Delegates to the reorder_task RPC (migration 012): security definer, so any
 * project member can reorder; renumbering runs atomically in one transaction.
 */
export async function reorderTask(
  taskId: string,
  projectId: string,
  toListId: string,
  toIndex: number,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase.rpc('reorder_task', {
    p_task_id:    taskId,
    p_to_list_id: toListId,
    p_to_index:   toIndex,
  })
  if (error) throw new Error(error.message)

  revalidatePath(`/projects/${projectId}`)
}

/** A project member claims an unassigned task for themselves. */
export async function claimTask(taskId: string, projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Guarded update: only succeeds while the task is still unassigned.
  // RLS ("tasks: member claims unassigned") enforces project membership.
  const { data, error } = await supabase
    .from('tasks')
    .update({ assignee_id: user.id })
    .eq('id', taskId)
    .is('assignee_id', null)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('This task was already claimed by someone else.')
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
}

/**
 * Extracts comment-attachment storage paths from rich-text bodies so the
 * underlying images can be removed when comments/tasks are deleted.
 */
function extractAttachmentPaths(bodies: string[]): string[] {
  const paths = new Set<string>()
  for (const body of bodies) {
    for (const match of body.matchAll(/comment-attachments\/([^"'\s)]+)/g)) {
      if (match[1]) paths.add(decodeURIComponent(match[1]))
    }
  }
  return Array.from(paths)
}

export async function deleteTask(taskId: string, projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Admin only.')

  // Collect attachment paths before comments cascade-delete
  const { data: comments } = await supabase
    .from('task_comments').select('body').eq('task_id', taskId)
  const paths = extractAttachmentPaths((comments ?? []).map(c => c.body))

  await supabase.from('tasks').delete().eq('id', taskId)

  // Best-effort image cleanup — a failure here shouldn't block the delete
  if (paths.length > 0) {
    await supabase.storage.from('comment-attachments').remove(paths)
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/dashboard')
}

// ── Task comment actions ───────────────────────────────────────────────────────
// RLS enforces the real permissions (admin or project member, author-only delete);
// these actions stay thin and surface DB errors.
// In-app notifications are inserted by DB triggers (migration 013); the email
// side of mentions is handled here since it needs Resend.

/**
 * Email + push newly @mentioned users. Best-effort: the comment already saved,
 * so notification failures are logged, never thrown. In-app notifications are
 * handled separately by the notify_comment_mentions trigger (migration 013).
 */
async function notifyMentions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  mentionIds: string[],
  authorId: string,
  taskId: string,
  projectId: string,
) {
  const targets = Array.from(new Set(mentionIds)).filter(id => id !== authorId)
  if (targets.length === 0) return

  try {
    // Only project members and admins may be notified — the mentions array is
    // client-supplied and must not become a cross-project notification channel.
    const [{ data: memberRows }, { data: adminRows }] = await Promise.all([
      supabase.from('project_members').select('user_id').eq('project_id', projectId).in('user_id', targets),
      supabase.from('users').select('id').eq('role', 'admin').in('id', targets),
    ])
    const allowed = new Set([
      ...(memberRows ?? []).map(r => r.user_id),
      ...(adminRows ?? []).map(r => r.id),
    ])
    const validTargets = targets.filter(id => allowed.has(id))
    if (validTargets.length === 0) return

    const [{ data: users }, { data: task }, { data: author }] = await Promise.all([
      supabase.from('users').select('email, name').in('id', validTargets),
      supabase.from('tasks').select('title').eq('id', taskId).single(),
      supabase.from('users').select('name').eq('id', authorId).single(),
    ])

    const authorName = author?.name ?? 'A teammate'
    const taskTitle  = task?.title ?? 'a task'
    const portalUrl  = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

    await sendPushToUsers(validTargets, {
      title: `${authorName} mentioned you`,
      body:  taskTitle,
      url:   `/projects/${projectId}?tab=todos`,
    })

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn('[mentions] RESEND_API_KEY not set — skipping mention emails')
      return
    }
    if (!users || users.length === 0) return

    const resend = new Resend(apiKey)
    const results = await Promise.all(users.map(u =>
      resend.emails.send({
        from: process.env.RESEND_FROM ?? 'Weblikha Portal <onboarding@resend.dev>',
        to: u.email,
        subject: `${authorName} mentioned you on "${taskTitle}"`,
        html: `
          <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#101010;color:#ffffff;border-radius:12px;">
            <h1 style="font-size:18px;margin:0 0 16px;">${authorName} mentioned you</h1>
            <p style="color:#b3b3b3;line-height:1.6;margin:0 0 24px;">
              You were mentioned in a comment on the to-do
              <strong style="color:#ffffff;">${taskTitle}</strong>.
            </p>
            <a href="${portalUrl}/projects/${projectId}?tab=todos"
               style="display:inline-block;background:#FDD33C;color:#101010;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">
              Open the to-do
            </a>
          </div>`,
      })
    ))
    // The SDK returns errors instead of throwing — surface them in the logs
    for (const r of results) {
      if (r.error) console.error('[mentions] Resend error:', r.error.message)
    }
  } catch (err) {
    console.error('[mentions] Failed to notify mentioned users:', err)
  }
}

/** Push the new assignee (never the actor). Best-effort, mirrors notifyMentions. */
async function notifyAssignment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assigneeId: string,
  actorId: string,
  taskTitle: string,
  projectId: string,
) {
  if (assigneeId === actorId) return
  try {
    const { data: actor } = await supabase
      .from('users').select('name').eq('id', actorId).single()
    await sendPushToUsers([assigneeId], {
      title: 'New task assigned',
      body:  `${actor?.name ?? 'A teammate'} assigned you "${taskTitle}"`,
      url:   `/projects/${projectId}?tab=todos`,
    })
  } catch (err) {
    console.error('[push] Failed to notify assignee:', err)
  }
}

export async function createTaskComment(
  taskId: string,
  projectId: string,
  body: string,
  mentions: string[] = [],
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const trimmed = body.trim()
  if (!trimmed) throw new Error('Comment cannot be empty.')
  if (trimmed.length > 20000) throw new Error('Comment is too long.')

  const { error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, author_id: user.id, body: trimmed, mentions })
  if (error) throw new Error(error.message)

  await notifyMentions(supabase, mentions, user.id, taskId, projectId)

  revalidatePath(`/projects/${projectId}`)
}

export async function updateTaskComment(
  commentId: string,
  projectId: string,
  body: string,
  mentions: string[] = [],
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const trimmed = body.trim()
  if (!trimmed) throw new Error('Comment cannot be empty.')
  if (trimmed.length > 20000) throw new Error('Comment is too long.')

  // Snapshot previous mentions so only newly added people get emailed
  const { data: existing } = await supabase
    .from('task_comments')
    .select('mentions, task_id')
    .eq('id', commentId)
    .single()

  // RLS: only the author (or admin) can update; others match zero rows
  const { error } = await supabase
    .from('task_comments')
    .update({ body: trimmed, mentions })
    .eq('id', commentId)
  if (error) throw new Error(error.message)

  if (existing) {
    const previous    = existing.mentions ?? []
    const newMentions = mentions.filter(m => !previous.includes(m))
    await notifyMentions(supabase, newMentions, user.id, existing.task_id, projectId)
  }

  revalidatePath(`/projects/${projectId}`)
}

export async function deleteTaskComment(commentId: string, projectId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Grab the body first so attached images can be cleaned up
  const { data: comment } = await supabase
    .from('task_comments').select('body').eq('id', commentId).single()

  const { error } = await supabase
    .from('task_comments').delete().eq('id', commentId)
  if (error) throw new Error(error.message)

  // Best-effort image cleanup
  const paths = extractAttachmentPaths(comment ? [comment.body] : [])
  if (paths.length > 0) {
    await supabase.storage.from('comment-attachments').remove(paths)
  }

  revalidatePath(`/projects/${projectId}`)
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
