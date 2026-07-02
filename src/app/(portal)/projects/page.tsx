/**
 * PROJECTS LIST PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Role-aware:
 *   - Admin: sees all projects, can create new ones
 *   - Provider: sees only assigned projects, no "New project" button
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ProjectCard } from '@/components/modules/projects/ProjectCard'
import { NewProjectModal } from '@/components/modules/projects/NewProjectModal'
import type { ProjectWithMembers, User } from '@/types'
import { FolderOpen } from 'lucide-react'

export const metadata: Metadata = { title: 'Projects' }

export default async function ProjectsPage() {
  const supabase = await createClient()

  const { data: { user: authUser } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', authUser!.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  let projects: ProjectWithMembers[]

  if (isAdmin) {
    const { data } = await supabase
      .from('projects')
      .select(`
        *,
        members: project_members (
          *,
          user: users (*)
        ),
        revenue_entries (*)
      `)
      .order('created_at', { ascending: false })
    projects = (data ?? []) as ProjectWithMembers[]
  } else {
    // Provider: only projects they're a member of
    const { data: memberRows } = await supabase
      .from('project_members')
      .select('project_id')
      .eq('user_id', authUser!.id)

    const projectIds = (memberRows ?? []).map((r: { project_id: string }) => r.project_id)

    if (projectIds.length === 0) {
      projects = []
    } else {
      // Providers: no revenue_entries (admin-only RLS) in the embed
      const { data } = await supabase
        .from('projects')
        .select('*, members: project_members(*, user: users(id, name, avatar_url, specialty, role))')
        .in('id', projectIds)
        .order('created_at', { ascending: false })

      projects = (data ?? []).map(p => ({ ...p, revenue_entries: [] })) as ProjectWithMembers[]
    }
  }

  // Fetch providers for member selector (admin only)
  const { data: teamMembers } = isAdmin
    ? await supabase.from('users').select('*').eq('role', 'provider').order('name', { ascending: true })
    : { data: [] }

  const members = (teamMembers ?? []) as User[]

  const active   = projects.filter(p => ['in_progress', 'discovery', 'review'].includes(p.status))
  const inactive = projects.filter(p => ['completed', 'archived'].includes(p.status))

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-display font-semibold text-primary">Projects</h1>
          <p className="text-sm text-secondary mt-0.5">
            {projects.length} project{projects.length !== 1 ? 's' : ''} total
          </p>
        </div>
        {isAdmin && <NewProjectModal teamMembers={members} />}
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen className="size-10 text-tertiary mb-3" />
          <p className="text-primary font-medium">
            {isAdmin ? 'No projects yet' : 'No projects assigned to you yet'}
          </p>
          <p className="text-sm text-secondary mt-1">
            {isAdmin ? 'Create your first project to get started.' : 'Your admin will assign you to a project soon.'}
          </p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">
                Active · {active.length}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {active.map(p => <ProjectCard key={p.id} project={p} />)}
              </div>
            </section>
          )}

          {inactive.length > 0 && (
            <section>
              <h2 className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">
                Completed / Archived · {inactive.length}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                {inactive.map(p => <ProjectCard key={p.id} project={p} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
