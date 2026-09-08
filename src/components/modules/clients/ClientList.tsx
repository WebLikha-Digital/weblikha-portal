'use client'
/**
 * CLIENT LIST
 * ─────────────────────────────────────────────────────────────────────────────
 * One card per client: name, email, status, assigned-project chips, actions.
 * Cards rather than a table so the same markup works on a phone — the row
 * stacks vertically below sm and lays out horizontally above it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Avatar, Badge } from '@/components/ui'
import type { BadgeProps } from '@/components/ui'
import type { ClientRow, ClientSetupStatus, PickerProject } from '@/types'

interface ClientListProps {
  rows:        ClientRow[]
  allProjects: PickerProject[]
}

const STATUS_META: Record<
  ClientSetupStatus,
  { label: string; variant: BadgeProps['variant'] }
> = {
  active:         { label: 'Active',         variant: 'success' },
  invite_pending: { label: 'Invite pending', variant: 'warning' },
  revoked:        { label: 'Revoked',        variant: 'danger'  },
}

export function ClientList({ rows, allProjects: _allProjects }: ClientListProps) {
  if (rows.length === 0) {
    return (
      <div className="card px-6 py-12 flex flex-col items-center text-center gap-2">
        <p className="text-sm font-medium text-primary">No clients yet</p>
        <p className="text-sm text-secondary max-w-xs">
          Invite a client to give them access to the projects you assign them.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {rows.map(({ user, projects, status }) => {
        const meta = STATUS_META[status]
        return (
          <div
            key={user.id}
            className="card px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Avatar name={user.name} src={user.avatar_url} size="sm" />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-primary truncate">{user.name}</p>
                <Badge variant={meta.variant}>{meta.label}</Badge>
              </div>
              <p className="text-2xs text-secondary truncate">{user.email}</p>

              <div className="flex items-center gap-1 flex-wrap mt-1.5">
                {projects.length === 0
                  ? <span className="text-2xs text-tertiary">No projects assigned</span>
                  : projects.map(p => (
                      <span
                        key={p.id}
                        className="text-2xs text-secondary bg-bg-surface-3 px-2 py-0.5 rounded-full"
                      >
                        {p.name}
                      </span>
                    ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
