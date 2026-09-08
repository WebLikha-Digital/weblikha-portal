'use client'
import { useState, useTransition, useOptimistic } from 'react'
import { Avatar } from '@/components/ui'
import { UserPlus, X, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { addProjectMember, removeProjectMember } from '@/app/(portal)/projects/actions'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import type { ProjectMember, User, UserRole } from '@/types'

interface TeamTabProps {
  projectId:        string
  members:          (ProjectMember & { user: User })[]
  availableMembers: User[]
  isAdmin:          boolean
  viewerRole:       UserRole
}

type MemberAction =
  | { type: 'add';    member: ProjectMember & { user: User } }
  | { type: 'remove'; userId: string }

function memberReducer(
  state: (ProjectMember & { user: User })[],
  action: MemberAction,
): (ProjectMember & { user: User })[] {
  switch (action.type) {
    case 'add':    return [...state, action.member]
    case 'remove': return state.filter(m => m.user_id !== action.userId)
  }
}

export function TeamTab({ projectId, members, availableMembers, isAdmin, viewerRole }: TeamTabProps) {
  // Clients see names and roles only — no email, no employment_type. That is
  // an agency-internal detail (CLAUDE.md, "Client portal"), and the client
  // branch of the project query no longer fetches it, so rendering it here
  // would print `undefined` besides leaking intent.
  const isClientViewer = viewerRole === 'client'
  const [, startTransition] = useTransition()
  const [optimisticMembers, dispatch] = useOptimistic(members, memberReducer)
  const [showPicker, setShowPicker]   = useState(false)

  // Derive available list from optimistic state so picker updates immediately
  const currentIds        = new Set(optimisticMembers.map(m => m.user_id))
  const optimisticAvail   = availableMembers.filter(u => !currentIds.has(u.id))

  const providers = optimisticMembers.filter(m => m.user.role !== 'client')
  const clients   = optimisticMembers.filter(m => m.user.role === 'client')

  function handleAdd(user: User) {
    const optimisticMember: ProjectMember & { user: User } = {
      id:              `temp-${Date.now()}`,
      project_id:      projectId,
      user_id:         user.id,
      role_in_project: 'member',
      joined_at:       new Date().toISOString(),
      user,
    }
    setShowPicker(false)
    startTransition(async () => {
      dispatch({ type: 'add', member: optimisticMember })
      await addProjectMember(projectId, user.id)
    })
  }

  async function handleRemove(userId: string) {
    const name = optimisticMembers.find(m => m.user_id === userId)?.user.name ?? 'this member'
    const ok = await confirmDialog({
      title:        `Remove ${name} from this project?`,
      message:      'They will lose access to its tasks and message board.',
      confirmLabel: 'Remove',
    })
    if (!ok) return
    startTransition(async () => {
      dispatch({ type: 'remove', userId })
      await removeProjectMember(projectId, userId)
    })
  }

  return (
    <div className="space-y-6 max-w-lg">

      {providers.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">
            Team · {providers.length}
          </h3>
          <div className="space-y-2">
            {providers.map(m => (
              <div key={m.user_id} className={cn('card flex items-center gap-3 px-4 py-3 transition-opacity', m.id.startsWith('temp-') && 'opacity-60')}>
                <Avatar name={m.user.name} src={m.user.avatar_url} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary">{m.user.name}</p>
                  <p className="text-2xs text-secondary capitalize">{m.user.specialty}</p>
                </div>
                <span className="text-2xs text-secondary bg-bg-surface-3 px-2 py-0.5 rounded-full">
                  {m.role_in_project || m.user.role}
                </span>
                {isAdmin && m.user.role === 'provider' && !m.id.startsWith('temp-') && (
                  <button
                    onClick={() => handleRemove(m.user_id)}
                    className="text-tertiary hover:text-danger transition-colors ml-1"
                    title={`Remove ${m.user.name}`}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {clients.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">
            Clients · {clients.length}
          </h3>
          <div className="space-y-2">
            {clients.map(m => (
              <div key={m.user_id} className="card flex items-center gap-3 px-4 py-3">
                <Avatar name={m.user.name} src={m.user.avatar_url} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-primary">{m.user.name}</p>
                  {!isClientViewer && (
                    <p className="text-2xs text-secondary">{m.user.email}</p>
                  )}
                </div>
                <span className="text-2xs text-info bg-info/10 px-2 py-0.5 rounded-full">
                  Client
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {optimisticMembers.length === 0 && (
        <p className="text-sm text-secondary py-8 text-center">No members assigned yet.</p>
      )}

      {isAdmin && (
        <div className="relative">
          <button
            onClick={() => setShowPicker(v => !v)}
            className={cn(
              'flex items-center gap-2 h-8 px-3 rounded-md border text-sm transition-colors',
              showPicker
                ? 'border-brand text-brand bg-warning-bg'
                : 'border-subtle text-secondary hover:text-primary hover:border-[var(--color-border-default)]'
            )}
          >
            <UserPlus className="size-3.5" />
            Add member
            <ChevronDown className={cn('size-3.5 transition-transform', showPicker && 'rotate-180')} />
          </button>

          {showPicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowPicker(false)} />
              <div className="absolute top-10 left-0 z-20 w-64 rounded-lg border border-subtle bg-bg-surface-2 shadow-lg overflow-hidden">
                {optimisticAvail.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-secondary">
                    All approved providers are already in this project.
                  </p>
                ) : (
                  <ul>
                    {optimisticAvail.map(u => (
                      <li key={u.id}>
                        <button
                          onClick={() => handleAdd(u)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-bg-surface-3 transition-colors text-left"
                        >
                          <Avatar name={u.name} src={u.avatar_url} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-primary truncate">{u.name}</p>
                            <p className="text-2xs text-secondary capitalize">{u.specialty}</p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
