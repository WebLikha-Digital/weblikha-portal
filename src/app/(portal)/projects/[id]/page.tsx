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
  ProjectDetail, ProjectSummary, TaskListWithTasks, MessageWithAuthor, User, ProjectTemplate,
  UserRole,
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
  const { data: currentProfile, error: profileError } = await supabase
    .from('users').select('role').eq('id', authUser!.id).single()
  if (profileError) {
    // Non-fatal: the fallback below already treats an unresolved profile as
    // provider-like, so log and let that degraded-but-functional path run.
    console.error('[projects/[id]] current-user profile fetch failed — falling back to provider view:', profileError)
  }
  const isAdmin  = currentProfile?.role === 'admin'
  const isClient = currentProfile?.role === 'client'
  // Fallback matches the pre-existing implicit behaviour: an unresolved
  // profile was already treated as "not admin, not client" (i.e. provider-like).
  const viewerRole: UserRole = (currentProfile?.role as UserRole | undefined) ?? 'provider'

  // Project + members. Client-role queries use an explicit column list that
  // omits budget — RLS is row-level, so `select('*')` would hand a client
  // the whole row including budget (see CLAUDE.md "Budget caveat"). The
  // members embed also uses an explicit column list for a client viewer —
  // the same one used at src/app/(portal)/projects/page.tsx — because
  // `users(*)` would leak `employment_type`, `email`, `skills` and
  // `approved` for every project member into the client's RSC payload;
  // admin and provider viewers keep the full row (providers seeing
  // `employment_type` is intended). The select string is kept literal per
  // branch (not built at runtime) because supabase-js parses the select
  // string at the type level.
  const { data: projectRaw, error: projectError } = isClient
    ? await supabase
        .from('projects')
        .select('id, name, client_name, status, start_date, end_date, description, created_at, members: project_members(*, user: users(id, name, avatar_url, specialty, role))')
        .eq('id', id)
        .single()
    : await supabase
        .from('projects')
        .select('*, members: project_members(*, user: users(*))')
        .eq('id', id)
        .single()

  // PGRST116 ("no rows") from .single() is the legitimate 404 case — bad id,
  // or RLS hides the row from this viewer. Any other error is a real query
  // failure (e.g. an ambiguous embed) and must not be treated as "doesn't
  // exist" — this is the primary fetch the whole page depends on.
  if (projectError && projectError.code !== 'PGRST116') {
    console.error('[projects/[id]] project fetch failed:', projectError)
    throw new Error('Failed to load this project. See server logs for details.')
  }

  if (!projectRaw) notFound()

  const project = projectRaw as ProjectSummary & { members: ProjectDetail['members'] }

  // All approved providers (for TeamTab add-member picker) — admin only.
  // A client or provider payload has no business carrying every approved
  // provider's full row (employment_type included) just to feed a picker
  // only an admin can open.
  const { data: allProviders, error: allProvidersError } = isAdmin
    ? await supabase
        .from('users').select('*')
        .eq('role', 'provider').eq('approved', true)
        .order('name', { ascending: true })
    : { data: [] as User[], error: null }
  if (allProvidersError) {
    // Non-fatal: only feeds the admin add-member picker, not the page's
    // primary content — degrade to an empty picker rather than failing the page.
    console.error('[projects/[id]] approved-providers fetch failed — add-member picker will be empty:', allProvidersError)
  }

  // Task lists + tasks + assignees + creators + comment threads.
  // `tasks` has TWO foreign keys to `public.users` — `assignee_id` (since
  // migration 001) and `created_by` (added by migration 014, for the
  // "Added by client" badge). A bare `users(*)` embed under `tasks` is
  // therefore ambiguous: PostgREST cannot guess which FK to join through
  // and returns an error instead of data — which this file used to swallow
  // by destructuring only `data`, so the failure rendered as the page's
  // ordinary "no phases yet" empty state. Every `users` embed under `tasks`
  // must carry an explicit `users!<fk_column>` hint. `task_lists` has only
  // one FK to `users` (`created_by`), so its embed is unambiguous without a
  // hint — but the hint is added anyway for symmetry with `tasks` and to
  // stay unambiguous if a second FK is ever added there too.
  const { data: taskListsRaw, error: taskListsError } = await supabase
    .from('task_lists')
    .select(`
      *,
      creator: users!created_by(id, name, role),
      tasks(
        *,
        assignee: users!assignee_id(*),
        creator: users!created_by(id, name, role),
        comments: task_comments(*, author: users(*))
      )
    `)
    .eq('project_id', id)
    .order('position', { ascending: true })
    .order('position', { referencedTable: 'tasks', ascending: true })

  // This is the page's primary content — the To-dos tab — so a query error
  // here must not be allowed to masquerade as "no phases yet". Throw loudly
  // instead of silently rendering an empty list.
  if (taskListsError) {
    console.error('[projects/[id]] task_lists fetch failed:', taskListsError)
    throw new Error('Failed to load project phases and tasks. See server logs for details.')
  }

  // Messages + authors. `messages.author_id` has only one FK to `users`, so
  // this embed is unambiguous. Treated as non-essential to the whole page:
  // one tab among three, so log and degrade to an empty message board
  // rather than failing the entire page over it.
  const { data: messagesRaw, error: messagesError } = await supabase
    .from('messages')
    .select('*, author: users(*)')
    .eq('project_id', id)
    .order('created_at', { ascending: false })
  if (messagesError) {
    console.error('[projects/[id]] messages fetch failed — message board will render empty:', messagesError)
  }

  // Templates (for TodosTab apply-template picker) — non-essential, degrade
  // to an empty picker rather than failing the page.
  const { data: templatesRaw, error: templatesError } = await supabase
    .from('project_templates')
    .select('id, name, description, created_by, created_at, updated_at')
    .order('name', { ascending: true })
  if (templatesError) {
    console.error('[projects/[id]] project_templates fetch failed — apply-template picker will be empty:', templatesError)
  }

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
          {project.budget !== undefined && (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Wallet className="size-3.5 shrink-0 text-tertiary" />
              {formatPeso(project.budget)}
            </span>
          )}
        </div>
      </div>

      {/* Tabs + content — instant client-side switching */}
      <ProjectTabsLayout
        projectId={id}
        currentUserId={authUser!.id}
        taskLists={taskLists}
        messages={messages}
        members={members}
        availableMembers={availableMembers}
        templates={templates}
        isAdmin={isAdmin}
        viewerRole={viewerRole}
      />
    </div>
  )
}
