import { createClient } from '@/lib/supabase/server'
import type { ProjectStatus, TaskStatus, UserRole } from '@/types'

/**
 * CLIENT DASHBOARD DATA
 * ─────────────────────────────────────────────────────────────────────────────
 * Every read the client dashboard needs, as the signed-in client under their own
 * RLS. No service-role client, no new policies.
 *
 * EXPLICIT COLUMN LISTS, never select('*'):
 *   - `projects` carries `budget`, and RLS is row-level — the "member or admin"
 *     policy hands a member the whole row (CLAUDE.md, "Budget caveat").
 *   - `users` carries email, employment_type, bio and location. The Team tab
 *     deliberately shows names and roles only.
 * Widening either list is a privacy regression, not a convenience.
 *
 * One task query serves progress, requests and deadlines — same rows, different
 * filtering, and a client's project set is small.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const UPCOMING_DAYS   = 14
const MESSAGE_LIMIT   = 5
const REQUEST_LIMIT   = 6
const DEADLINE_LIMIT  = 6

export interface ClientTeamMember {
  id:         string
  name:       string
  avatar_url: string | null
  role:       UserRole
}

export interface ClientProjectSummary {
  id:         string
  name:       string
  status:     ProjectStatus
  end_date:   string | null
  totalTasks: number
  doneTasks:  number
  nextDue:    { id: string; title: string; due_date: string } | null
  team:       ClientTeamMember[]
}

export interface ClientRequest {
  id:           string
  title:        string
  status:       TaskStatus
  project_id:   string
  project_name: string
  due_date:     string | null
}

export interface ClientDeadline {
  id:           string
  title:        string
  due_date:     string
  project_id:   string
  project_name: string
  overdue:      boolean
}

export interface ClientMessagePreview {
  id:          string
  title:       string
  project_id:  string
  created_at:  string
  author_name: string
}

export interface ClientDashboardData {
  projects: ClientProjectSummary[]
  requests: ClientRequest[]
  overdue:  ClientDeadline[]
  upcoming: ClientDeadline[]
  messages: ClientMessagePreview[]
}

const EMPTY: ClientDashboardData = {
  projects: [], requests: [], overdue: [], upcoming: [], messages: [],
}

interface ProjectRow {
  id:       string
  name:     string
  status:   ProjectStatus
  end_date: string | null
  members:  { user: ClientTeamMember | null }[] | null
}

interface TaskRow {
  id:         string
  project_id: string
  title:      string
  status:     TaskStatus
  due_date:   string | null
  created_by: string | null
}

interface MessageRow {
  id:         string
  title:      string
  project_id: string
  created_at: string
  author:     { name: string } | null
}

/**
 * `YYYY-MM-DD` for `when` in `timeZone`. en-CA formats as ISO, which is what the
 * date columns compare against.
 */
function dayKey(when: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(when)
  } catch {
    return when.toISOString().slice(0, 10)
  }
}

export async function loadClientDashboard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  viewerTimezone: string | null,
): Promise<ClientDashboardData> {
  // Membership first: RLS on `projects` already limits rows, but going through
  // project_members matches how the projects page reads and keeps the `.in()`
  // filters below explicit.
  const { data: memberRows } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('user_id', userId)

  const projectIds = (memberRows ?? []).map((r: { project_id: string }) => r.project_id)
  if (projectIds.length === 0) return EMPTY

  const [projectsRes, tasksRes, messagesRes] = await Promise.all([
    supabase
      .from('projects')
      .select(`
        id, name, status, end_date,
        members: project_members(user: users(id, name, avatar_url, role))
      `)
      .in('id', projectIds)
      .neq('status', 'archived')
      .order('created_at', { ascending: false }),
    supabase
      .from('tasks')
      .select('id, project_id, title, status, due_date, created_by')
      .in('project_id', projectIds),
    supabase
      .from('messages')
      .select('id, title, project_id, created_at, author: users(name)')
      .in('project_id', projectIds)
      .eq('is_client_visible', true)
      .order('created_at', { ascending: false })
      .limit(MESSAGE_LIMIT),
  ])

  if (projectsRes.error) console.error('[client-dashboard] projects fetch failed:', projectsRes.error)
  if (tasksRes.error)    console.error('[client-dashboard] tasks fetch failed:', tasksRes.error)
  if (messagesRes.error) console.error('[client-dashboard] messages fetch failed:', messagesRes.error)

  const projectRows = (projectsRes.data ?? []) as unknown as ProjectRow[]
  const taskRows    = (tasksRes.data    ?? []) as unknown as TaskRow[]
  const messageRows = (messagesRes.data ?? []) as unknown as MessageRow[]

  const nameById = new Map(projectRows.map(p => [p.id, p.name]))

  // A due date is a calendar day, so "today" has to be the VIEWER's calendar
  // day. The server runs in UTC: for a Manila client (UTC+8) a UTC day key
  // still reads as yesterday until 8am local, which would show a task that
  // went overdue at midnight as still upcoming for those eight hours. Falls
  // back to the agency's own zone for anyone who has no timezone set.
  const zone      = viewerTimezone ?? 'Asia/Manila'
  const now       = new Date()
  const todayKey  = dayKey(now, zone)
  const horizon   = dayKey(new Date(now.getTime() + UPCOMING_DAYS * 24 * 60 * 60 * 1000), zone)

  const projects: ClientProjectSummary[] = projectRows.map(project => {
    const tasks = taskRows.filter(t => t.project_id === project.id)
    const dated = tasks
      .filter(t => t.status !== 'done' && t.due_date !== null)
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    const next = dated[0]

    return {
      id:         project.id,
      name:       project.name,
      status:     project.status,
      end_date:   project.end_date,
      totalTasks: tasks.length,
      doneTasks:  tasks.filter(t => t.status === 'done').length,
      nextDue:    next && next.due_date
        ? { id: next.id, title: next.title, due_date: next.due_date }
        : null,
      team: (project.members ?? [])
        .map(m => m.user)
        .filter((u): u is ClientTeamMember => u !== null),
    }
  })

  const requests: ClientRequest[] = taskRows
    .filter(t => t.created_by === userId && t.status !== 'done')
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
    .slice(0, REQUEST_LIMIT)
    .map(t => ({
      id:           t.id,
      title:        t.title,
      status:       t.status,
      project_id:   t.project_id,
      project_name: nameById.get(t.project_id) ?? 'Project',
      due_date:     t.due_date,
    }))

  const dated = taskRows
    .filter((t): t is TaskRow & { due_date: string } => t.status !== 'done' && t.due_date !== null)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))

  const toDeadline = (t: TaskRow & { due_date: string }, overdue: boolean): ClientDeadline => ({
    id:           t.id,
    title:        t.title,
    due_date:     t.due_date,
    project_id:   t.project_id,
    project_name: nameById.get(t.project_id) ?? 'Project',
    overdue,
  })

  // ISO date strings compare correctly as text.
  const overdue  = dated.filter(t => t.due_date <  todayKey).map(t => toDeadline(t, true)).slice(0, DEADLINE_LIMIT)
  const upcoming = dated
    .filter(t => t.due_date >= todayKey && t.due_date <= horizon)
    .map(t => toDeadline(t, false))
    .slice(0, DEADLINE_LIMIT)

  const messages: ClientMessagePreview[] = messageRows.map(m => ({
    id:          m.id,
    title:       m.title,
    project_id:  m.project_id,
    created_at:  m.created_at,
    author_name: m.author?.name ?? 'Someone',
  }))

  return { projects, requests, overdue, upcoming, messages }
}
