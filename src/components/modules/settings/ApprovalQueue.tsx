'use client'
import { useTransition, useOptimistic } from 'react'
import { Avatar } from '@/components/ui'
import { Check, X } from 'lucide-react'
import { approveUser, rejectUser } from '@/app/(portal)/settings/actions'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import type { User } from '@/types'

export function ApprovalQueue({ pending }: { pending: User[] }) {
  const [, startTransition] = useTransition()
  const [queue, dispatch] = useOptimistic(
    pending,
    (state: User[], userId: string) => state.filter(u => u.id !== userId),
  )

  function handleApprove(userId: string) {
    startTransition(async () => {
      dispatch(userId)
      await approveUser(userId)
    })
  }

  async function handleReject(userId: string) {
    const ok = await confirmDialog({
      title:        'Reject this signup?',
      message:      'Their account will be removed and they will need to sign up again.',
      confirmLabel: 'Reject',
    })
    if (!ok) return
    startTransition(async () => {
      dispatch(userId)
      await rejectUser(userId)
    })
  }

  if (queue.length === 0) {
    return (
      <p className="text-sm text-secondary py-3">No pending approvals.</p>
    )
  }

  return (
    <div className="space-y-2">
      {queue.map(user => (
        <div
          key={user.id}
          className="card flex items-center gap-3 px-4 py-3"
        >
          <Avatar name={user.name} src={user.avatar_url} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-primary">{user.name}</p>
            <p className="text-2xs text-secondary">{user.email}</p>
          </div>
          <span className="text-2xs text-secondary bg-bg-surface-3 px-2 py-0.5 rounded-full capitalize shrink-0">
            {user.specialty}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => handleApprove(user.id)}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-success/10 text-success text-xs font-medium hover:bg-success/20 transition-colors"
              title="Approve"
            >
              <Check className="size-3" /> Approve
            </button>
            <button
              onClick={() => handleReject(user.id)}
              className="flex items-center gap-1 h-7 px-2 rounded-md text-tertiary hover:text-danger hover:bg-danger/10 transition-colors"
              title="Reject"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
