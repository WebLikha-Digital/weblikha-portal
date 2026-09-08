import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ClientList } from '@/components/modules/clients/ClientList'
import { InviteClientModal } from '@/components/modules/clients/InviteClientModal'
import { fetchClientSetupState } from './setup-state'
import type { ClientRow, ClientSetupStatus, PickerProject, User } from '@/types'

export const metadata: Metadata = { title: 'Clients' }

function deriveStatus(
  approved:     boolean,
  lastSignInAt: string | null,
): ClientSetupStatus {
  if (!approved)     return 'revoked'
  if (!lastSignInAt) return 'invite_pending'
  return 'active'
}

export default async function ClientsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user!.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: clientsRaw } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'client')
    .order('name', { ascending: true })

  const clients = (clientsRaw ?? []) as User[]

  // Every project, including archived ones. Filtering archived here would drop
  // the chip for a client already assigned to one; the picker filters instead.
  const { data: projectsRaw } = await supabase
    .from('projects')
    .select('id, name, status')
    .order('name', { ascending: true })

  const allProjects = (projectsRaw ?? []) as PickerProject[]
  const clientIds   = clients.map(c => c.id)

  const memberships = clientIds.length > 0
    ? (await supabase
        .from('project_members')
        .select('user_id, project_id')
        .in('user_id', clientIds)).data ?? []
    : []

  const setupState = await fetchClientSetupState(clientIds)

  const projectsById = new Map(allProjects.map(p => [p.id, p]))
  const byUser       = new Map<string, PickerProject[]>()

  for (const m of memberships) {
    const project = projectsById.get(m.project_id)
    if (!project) continue
    byUser.set(m.user_id, [...(byUser.get(m.user_id) ?? []), project])
  }

  const rows: ClientRow[] = clients.map(c => ({
    user:     c,
    projects: byUser.get(c.id) ?? [],
    status:   deriveStatus(c.approved, setupState.get(c.id) ?? null),
  }))

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-semibold text-primary">Clients</h1>
          <p className="text-sm text-secondary mt-1">
            Invite clients, assign them projects, and manage portal access.
          </p>
        </div>
        <InviteClientModal allProjects={allProjects} />
      </div>

      <ClientList rows={rows} allProjects={allProjects} />
    </div>
  )
}
