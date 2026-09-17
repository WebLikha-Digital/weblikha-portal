'use client'
/**
 * MESSAGES TAB
 * ─────────────────────────────────────────────────────────────────────────────
 * Card list plus two modals. The open post lives in ?message=<id> so a
 * notification can deep-link to it.
 *
 * quietIds: ids that may briefly be missing from props for a legitimate reason —
 * just posted (props arrive after revalidation) or being deleted. Without it,
 * the "no longer available" check would fire a false error in both cases. An id
 * leaves the quiet set when it arrives in props, when its delete fails, or when
 * the message closes — closing clears the whole set, which is safe because
 * onClose() clears ?message= first, so nothing can race the revalidated props.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Eye, MessageSquare, Plus } from 'lucide-react'
import { Avatar, Button } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import { formatRelative } from '@/lib/utils'
import { isEdited } from '@/lib/messages'
import { replaceSearchParams } from '@/lib/url-state'
import { MessageComposeModal } from './MessageComposeModal'
import { MessageDetailModal } from './MessageDetailModal'
import type { MessageWithAuthor, UserRole } from '@/types'

interface MessagesTabProps {
  messages:      MessageWithAuthor[]
  projectId:     string
  currentUserId: string
  viewerRole:    UserRole
}

export function MessagesTab({ messages, projectId, currentUserId, viewerRole }: MessagesTabProps) {
  const searchParams = useSearchParams()
  const openId       = searchParams.get('message')
  const isClient     = viewerRole === 'client'

  const [composing, setComposing] = useState(false)
  const [editing, setEditing]     = useState<MessageWithAuthor | null>(null)
  const quietIds = useRef(new Set<string>())

  const openMessage = openId ? messages.find(m => m.id === openId) ?? null : null

  useEffect(() => {
    if (openMessage) {
      // The message has arrived in props (e.g. after posting) — no longer quiet.
      if (openId) quietIds.current.delete(openId)
      return
    }
    if (openId === null) {
      // Closed. Release everything — onClose() clears ?message= first, so
      // nothing can race the revalidated props after this point.
      quietIds.current.clear()
      return
    }
    if (quietIds.current.has(openId)) return
    toast.error('That message is no longer available.')
    replaceSearchParams({ message: null })
  }, [openId, openMessage])

  function openPost(id: string) {
    replaceSearchParams({ tab: 'messages', message: id })
  }

  function closePost() {
    replaceSearchParams({ message: null })
  }

  const newButton = (
    <Button
      variant="outline"
      size="sm"
      icon={<Plus className="size-3.5" />}
      onClick={() => setComposing(true)}
    >
      New message
    </Button>
  )

  return (
    <>
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <MessageSquare className="size-8 text-tertiary mb-3" aria-hidden />
          <p className="text-primary font-medium">No messages yet</p>
          <p className="text-sm text-secondary mt-1 max-w-xs">
            {isClient
              ? 'Ask a question or share an update with the team.'
              : 'Post a milestone update, or share one with the client.'}
          </p>
          <div className="mt-4">{newButton}</div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-end">{newButton}</div>

          {messages.map(msg => (
            <button
              key={msg.id}
              type="button"
              onClick={() => openPost(msg.id)}
              className="card w-full p-4 text-left transition-colors duration-150 hover:border-[var(--color-border-default)] active:bg-bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <div className="flex items-start gap-3">
                <Avatar
                  name={msg.author?.name ?? 'Unknown'}
                  src={msg.author?.avatar_url ?? null}
                  size="sm"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="min-w-0 text-sm font-medium text-primary truncate">{msg.title}</h3>
                    {!isClient && msg.is_client_visible && (
                      <span className="shrink-0 flex items-center gap-1 text-2xs text-info bg-info/10 px-2 py-0.5 rounded-full">
                        <Eye className="size-3" aria-hidden /> Client sees this
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-secondary line-clamp-2 leading-relaxed break-words">
                    {msg.body}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 mt-2 text-2xs text-tertiary">
                    <span>{msg.author?.name ?? 'Unknown'}</span>
                    <span aria-hidden>·</span>
                    <span>{formatRelative(msg.created_at)}</span>
                    {isEdited(msg) && (
                      <>
                        <span aria-hidden>·</span>
                        <span>Edited</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {composing && (
        <MessageComposeModal
          mode="create"
          projectId={projectId}
          viewerRole={viewerRole}
          onClose={() => setComposing(false)}
          onPosted={id => {
            quietIds.current.add(id)
            setComposing(false)
            openPost(id)
          }}
        />
      )}

      {editing && (
        <MessageComposeModal
          mode="edit"
          projectId={projectId}
          viewerRole={viewerRole}
          message={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}

      {openMessage && !editing && (
        <MessageDetailModal
          message={openMessage}
          projectId={projectId}
          viewerRole={viewerRole}
          currentUserId={currentUserId}
          onClose={closePost}
          onEdit={() => setEditing(openMessage)}
          onDeleteStart={id => quietIds.current.add(id)}
          onDeleteFailed={id => quietIds.current.delete(id)}
        />
      )}
    </>
  )
}
