'use client'
/**
 * CLIENT LIST
 * ─────────────────────────────────────────────────────────────────────────────
 * One card per client: name, email, status, assigned-project chips, actions.
 * Cards rather than a table so the same markup works on a phone — the row
 * stacks vertically below sm and lays out horizontally above it.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useOptimistic, useState, useTransition } from 'react'
import { Mail, Ban, RotateCcw, FolderCog } from 'lucide-react'
import { Avatar, Badge, Button } from '@/components/ui'
import type { BadgeProps } from '@/components/ui'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import { toast, withToast } from '@/components/ui/toast'
import {
  resendClientInvite,
  revokeClientAccess,
  restoreClientAccess,
} from '@/app/(portal)/clients/actions'
import { ManageProjectsModal } from './ManageProjectsModal'
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

export function ClientList({ rows, allProjects }: ClientListProps) {
  const [, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [managing, setManaging] = useState<ClientRow | null>(null)

  // Only `status` moves optimistically; project chips refresh via revalidatePath.
  const [optimisticRows, patchStatus] = useOptimistic(
    rows,
    (state: ClientRow[], patch: { id: string; status: ClientSetupStatus }) =>
      state.map(r => (r.user.id === patch.id ? { ...r, status: patch.status } : r)),
  )

  function handleResend(row: ClientRow) {
    setBusyId(row.user.id)
    startTransition(async () => {
      await withToast(
        async () => {
          await resendClientInvite(row.user.id)
          toast.success(`Sent a fresh setup link to ${row.user.email}.`)
        },
        'Could not resend the invite.',
      )
      setBusyId(null)
    })
  }

  async function handleRevoke(row: ClientRow) {
    const count = row.projects.length
    const ok = await confirmDialog({
      title: `Revoke access for ${row.user.name}?`,
      message:
        `They'll be signed out of the portal and removed from ` +
        `${count} assigned project${count === 1 ? '' : 's'}. Restoring them later ` +
        `does not restore project access — you'll need to reassign projects deliberately.`,
      confirmLabel: 'Revoke access',
    })
    if (!ok) return

    setBusyId(row.user.id)
    startTransition(async () => {
      patchStatus({ id: row.user.id, status: 'revoked' })
      await withToast(
        async () => {
          await revokeClientAccess(row.user.id)
          toast.success(`${row.user.name} no longer has portal access.`)
        },
        'Could not revoke access.',
      )
      setBusyId(null)
    })
  }

  function handleRestore(row: ClientRow) {
    setBusyId(row.user.id)
    startTransition(async () => {
      patchStatus({ id: row.user.id, status: 'invite_pending' })
      await withToast(
        async () => {
          await restoreClientAccess(row.user.id)
          toast.success(`${row.user.name} can sign in again. Reassign their projects.`)
        },
        'Could not restore access.',
      )
      setBusyId(null)
    })
  }

  if (optimisticRows.length === 0) {
    return (
      <div className="card px-6 py-12 flex flex-col items-center text-center gap-2">
        <p className="text-sm font-medium text-primary">No clients yet</p>
        <p className="text-sm text-secondary max-w-xs">
          Invite a client with the button above to give them access to the
          projects you assign them.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {optimisticRows.map(({ user, projects, status }) => {
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

            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              <Button
                size="sm"
                variant="ghost"
                icon={<FolderCog className="size-3.5" />}
                onClick={() => setManaging({ user, projects, status })}
              >
                Manage projects
              </Button>
              {status === 'invite_pending' && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Mail className="size-3.5" />}
                  loading={busyId === user.id}
                  onClick={() => handleResend({ user, projects, status })}
                >
                  Resend
                </Button>
              )}
              {status === 'revoked' ? (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<RotateCcw className="size-3.5" />}
                  loading={busyId === user.id}
                  onClick={() => handleRestore({ user, projects, status })}
                >
                  Restore
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Ban className="size-3.5" />}
                  loading={busyId === user.id}
                  onClick={() => handleRevoke({ user, projects, status })}
                  className="text-tertiary hover:text-danger hover:bg-danger/10"
                >
                  Revoke
                </Button>
              )}
            </div>
          </div>
        )
      })}

      {managing && (
        <ManageProjectsModal
          row={managing}
          allProjects={allProjects}
          onClose={() => setManaging(null)}
        />
      )}
    </div>
  )
}
