'use client'
/**
 * MESSAGE DETAIL MODAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Full post. Edit and Delete appear for the author or an admin — the same rule
 * migration 020's policies enforce. Delete calls onDeleteStart first so the
 * parent does not mistake the post disappearing from props for a dead link.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useTransition } from 'react'
import { Eye, Lock, Pencil, Trash2, X } from 'lucide-react'
import { Avatar, Button } from '@/components/ui'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import { toast, withToast } from '@/components/ui/toast'
import { formatRelative } from '@/lib/utils'
import { isEdited } from '@/lib/messages'
import { deleteMessage } from '@/app/(portal)/projects/message-actions'
import { RichTextBody } from '@/components/modules/editor/RichTextBody'
import { MessageCategoryPill } from './MessageCategoryPill'
import { MessageReplyThread } from './MessageReplyThread'
import type { MessageWithAuthor, ProjectMember, User, UserRole } from '@/types'

interface MessageDetailModalProps {
  message:       MessageWithAuthor
  projectId:     string
  viewerRole:    UserRole
  currentUserId: string
  members:       (ProjectMember & { user: User })[]
  admins:        User[]
  onClose:        () => void
  onEdit:         () => void
  onDeleteStart:  (messageId: string) => void
  onDeleteFailed: (messageId: string) => void
}

export function MessageDetailModal({
  message,
  projectId,
  viewerRole,
  currentUserId,
  members,
  admins,
  onClose,
  onEdit,
  onDeleteStart,
  onDeleteFailed,
}: MessageDetailModalProps) {
  const [isPending, startTransition] = useTransition()
  const canManage = viewerRole === 'admin' || message.author_id === currentUserId
  const isClient  = viewerRole === 'client'

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isPending, onClose])

  async function handleDelete() {
    const ok = await confirmDialog({
      title:        'Delete this message?',
      message:      'It will be removed for everyone on this project.',
      confirmLabel: 'Delete',
    })
    if (!ok) return

    startTransition(async () => {
      await withToast(async () => {
        onDeleteStart(message.id)
        try {
          await deleteMessage(message.id, projectId)
        } catch (err) {
          onDeleteFailed(message.id)
          throw err
        }
        toast.success('Message deleted.')
        onClose()
      }, 'Could not delete the message.')
    })
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={() => { if (!isPending) onClose() }}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={message.title}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-bg-surface-1 shadow-2xl flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-subtle">
          <h2 className="min-w-0 text-base font-semibold text-primary break-words">
            {message.title}
          </h2>
          <button
            onClick={() => { if (!isPending) onClose() }}
            disabled={isPending}
            className="shrink-0 text-secondary hover:text-primary active:opacity-70 transition-colors duration-150 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar
              name={message.author?.name ?? 'Unknown'}
              src={message.author?.avatar_url ?? null}
              size="sm"
            />
            <div className="min-w-0 text-2xs text-tertiary">
              <p className="text-sm text-primary truncate">{message.author?.name ?? 'Unknown'}</p>
              <p>
                Posted {formatRelative(message.created_at)}
                {isEdited(message) && <> · Edited {formatRelative(message.updated_at)}</>}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
          <MessageCategoryPill category={message.category} />
          {!isClient && (
            message.is_client_visible ? (
              <span className="inline-flex items-center gap-1 text-2xs text-info bg-info/10 px-2 py-0.5 rounded-full">
                <Eye className="size-3" aria-hidden /> Client sees this
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-2xs text-secondary bg-bg-surface-3 px-2 py-0.5 rounded-full">
                <Lock className="size-3" aria-hidden /> Internal only
              </span>
            )
          )}
          </div>

          <RichTextBody body={message.body} size="sm" />

          <MessageReplyThread
            messageId={message.id}
            projectId={projectId}
            replies={message.replies}
            isClientVisible={message.is_client_visible}
            currentUserId={currentUserId}
            viewerRole={viewerRole}
            members={members}
            admins={admins}
          />
        </div>

        {canManage && (
          <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-subtle">
            <Button
              variant="ghost"
              size="md"
              icon={<Trash2 className="size-4" />}
              onClick={handleDelete}
              loading={isPending}
              className="text-tertiary hover:text-danger hover:bg-danger/10"
            >
              Delete
            </Button>
            <Button
              variant="outline"
              size="md"
              icon={<Pencil className="size-4" />}
              onClick={onEdit}
              disabled={isPending}
            >
              Edit
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
