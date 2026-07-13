/**
 * PROJECT DETAIL PAGE
 * Shows a single project's header + tabbed content (to-dos, messages, team).
 * To-dos include per-task comment threads (task_comments).
 * Tab switching is handled client-side in ProjectTabsLayout — no URL params needed.
 */
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui'
import { ProjectTabsLayout } from '@/components/modules/projects/ProjectTabsLayout'
import { formatDate, formatPeso } from '@/lib/utils'
import { ChevronRight, CalendarDays, Wallet } from 'lucide-react'
import type {
  ProjectDetail, TaskListWithTasks, MessageWithAuthor, User, ProjectTemplate,
} from '@/types'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('projects').select('name').eq('id', id).single()
  return { title: data?.name ?? 'Project' }
}

export default async function ProjectDetailPage({ params }: Props) {
  const { id }    = await params
  const supabase  = await createClient()

  // Current user
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const { data: currentProfile } = await supabase
    .from('users').select('role').eq('id', authUser!.id).single()
  const isAdmin = currentProfile?.role === 'admin'

  // Project + members
  const { data: project } = await supabase
    .from('projects')
    .select('*, members: project_members(*, user: users(*))')
    .eq('id', id)
    .single()

  if (!project) notFound()

  // All approved providers (for TeamTab add-member picker)
  const { data: allProviders } = await supabase
    .from('users').select('*')
    .eq('role', 'provider').eq('approved', true)
    .order('name', { ascending: true })

  // Admins are mentionable in every project even when not on the roster —
  // matches the recipient boundary notifyMentions enforces server-side
  const { data: adminUsers } = await supabase
    .from('users').select('*')
    .eq('role', 'admin').eq('approved', true)
    .order('name', { ascending: true })

  // Task lists + tasks + assignees + comment threads
  const { data: taskListsRaw } = await supabase
    .from('task_lists')
    .select('*, tasks(*, assignee: users(*), comments: task_comments(*, author: users(*)))')
    .eq('project_id', id)
    .order('position', { ascending: true })
    .order('position', { referencedTable: 'tasks', ascending: true })

  // Messages + authors
  const { data: messagesRaw } = await supabase
    .from('messages')
    .select('*, author: users(*)')
    .eq('project_id', id)
    .order('created_at', { ascending: false })

  // Templates (for TodosTab apply-template picker)
  const { data: templatesRaw } = await supabase
    .from('project_templates')
    .select('id, name, description, created_by, created_at, updated_at')
    .order('name', { ascending: true })

  const taskLists = (taskListsRaw  ?? []) as TaskListWithTasks[]
  const messages  = (messagesRaw   ?? []) as MessageWithAuthor[]
  const templates = (templatesRaw  ?? []) as ProjectTemplate[]

  const members          = project.members as ProjectDetail['members']
  const memberIds        = new Set(members.map(m => m.user_id))
  const availableMembers = ((allProviders ?? []) as User[]).filter(u => !memberIds.has(u.id))

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-secondary mb-5 min-w-0">
        <Link href="/projects" className="shrink-0 hover:text-primary transition-colors">Projects</Link>
        <ChevronRight className="size-3.5 shrink-0 text-tertiary" />
        <span className="text-primary truncate">{project.name}</span>
      </nav>

      {/* Project header */}
      <div className="card p-5 mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <p className="label-caps mb-1">{project.client_name}</p>
            <h1 className="text-xl font-display font-semibold text-primary">{project.name}</h1>
          </div>
          <Badge status={project.status} />
        </div>
        {project.description && (
          <p className="text-sm text-secondary mb-3 leading-relaxed">{project.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-secondary">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <CalendarDays className="size-3.5 shrink-0 text-tertiary" />
            {formatDate(project.start_date)} → {formatDate(project.end_date)}
          </span>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Wallet className="size-3.5 shrink-0 text-tertiary" />
            {formatPeso(project.budget)}
          </span>
        </div>
      </div>

      {/* Tabs + content — instant client-side switching */}
      <ProjectTabsLayout
        projectId={id}
        currentUserId={authUser!.id}
        taskLists={taskLists}
        messages={messages}
        members={members}
        admins={(adminUsers ?? []) as User[]}
        availableMembers={availableMembers}
        templates={templates}
        isAdmin={isAdmin}
      />
    </div>
  )
}
