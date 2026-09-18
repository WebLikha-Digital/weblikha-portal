'use client'
/**
 * MESSAGE REPLY THREAD
 * ─────────────────────────────────────────────────────────────────────────────
 * Flat list of replies under a post, oldest first, plus the composer.
 *
 * A reply is exactly as visible as its post (migration 022), so there is no
 * visibility control here. On an INTERNAL post the mention list drops clients,
 * matching what notify_message_reply_mentions enforces in the database.
 *
 * Edit and Delete follow the post's rule: the author for both, an admin for
 * delete. The database is the real gate; this only decides what to show.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useRef, useState, useTransition } from 'react'
import { Pencil, Send, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/ui'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import { toast, withToast } from '@/components/ui/toast'
import { cn, formatRelative } from '@/lib/utils'
import { isEdited, replyDraftError } from '@/lib/messages'
import {
  RichTextEditor,
  type MentionCandidate,
  type RichTextEditorHandle,
  type RichTextValue,
} from '@/components/modules/editor/RichTextEditor'
import { RichTextBody } from '@/components/modules/editor/RichTextBody'
import {
  createReply, deleteReply, updateReply,
} from '@/app/(portal)/projects/message-reply-actions'
import type { MessageReplyWithAuthor, ProjectMember, User, UserRole } from '@/types'

interface MessageReplyThreadProps {
  messageId:       string
  projectId:       string
  replies:         MessageReplyWithAuthor[]
  isClientVisible: boolean
  currentUserId:   string
  viewerRole:      UserRole
  members:         (ProjectMember & { user: User })[]
  admins:          User[]
}

const EMPTY_VALUE: RichTextValue = { html: '', mentions: [], isEmpty: true, uploading: false }

export function MessageReplyThread({
  messageId,
  projectId,
  replies,
  isClientVisible,
  currentUserId,
  viewerRole,
  members,
  admins,
}: MessageReplyThreadProps) {
  const composerRef = useRef<RichTextEditorHandle>(null)
  const [draft, setDraft]       = useState<RichTextValue>(EMPTY_VALUE)
  const [editingId, setEditing] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<RichTextValue>(EMPTY_VALUE)
  const [busyId, setBusyId]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isAdmin = viewerRole === 'admin'

  // Same rule as the compose modal: members + admins, clients dropped when the
  // post is internal, so the UI never offers a mention the trigger discards.
  const mentionables = useMemo<MentionCandidate[]>(() => {
    const items: MentionCandidate[] = members
      .filter(m => isClientVisible || m.user.role !== 'client')
      .map(m => ({ id: m.user_id, name: m.user.name }))
    for (const a of admins) {
      if (!items.some(i => i.id === a.id)) items.push({ id: a.id, name: a.name })
    }
    return items.sort((a, b) => a.name.localeCompare(b.name))
  }, [members, admins, isClientVisible])

  const ordered = useMemo(
    () => [...replies].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [replies],
  )

  function submitNew() {
    if (draft.uploading) {
      toast.error('Wait for images to finish uploading.')
      return
    }
    const problem = replyDraftError({ bodyHtml: draft.html, mentions: draft.mentions })
    if (problem) {
      toast.error(problem)
      return
    }
    const payload = { bodyHtml: draft.html, mentions: draft.mentions }
    setBusyId('new')
    startTransition(async () => {
      await withToast(async () => {
        await createReply(messageId, projectId, payload)
        composerRef.current?.clear()
        setDraft(EMPTY_VALUE)
        toast.success('Reply posted.')
      }, 'Could not post the reply.')
      setBusyId(null)
    })
  }

  function saveEdit(replyId: string) {
    if (editDraft.uploading) {
      toast.error('Wait for images to finish uploading.')
      return
    }
    const problem = replyDraftError({ bodyHtml: editDraft.html, mentions: editDraft.mentions })
    if (problem) {
      toast.error(problem)
      return
    }
    const payload = { bodyHtml: editDraft.html, mentions: editDraft.mentions }
    setBusyId(replyId)
    startTransition(async () => {
      await withToast(async () => {
        await updateReply(replyId, projectId, payload)
        setEditing(null)
        toast.success('Reply updated.')
      }, 'Could not save the reply.')
      setBusyId(null)
    })
  }

  async function remove(reply: MessageReplyWithAuthor) {
    const ok = await confirmDialog({
      title:        'Delete this reply?',
      message:      'It will be removed for everyone who can see this message.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    setBusyId(reply.id)
    startTransition(async () => {
      await withToast(async () => {
        await deleteReply(reply.id, projectId)
        toast.success('Reply deleted.')
      }, 'Could not delete the reply.')
      setBusyId(null)
    })
  }

  const iconButton =
    'p-1.5 rounded-md text-tertiary hover:text-primary hover:bg-bg-surface-3 active:opacity-70 ' +
    'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' +
    'disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <section className="border-t border-subtle pt-4 space-y-4" aria-label="Replies">
      <h3 className="text-xs font-medium text-secondary">
        {ordered.length === 0 ? 'Replies' : `Replies (${ordered.length})`}
      </h3>

      {ordered.length === 0 && (
        <p className="text-xs text-tertiary">No replies yet.</p>
      )}

      <ul className="space-y-4">
        {ordered.map(reply => {
          const isAuthor  = reply.author_id === currentUserId
          const canDelete = isAuthor || isAdmin
          const busy      = busyId === reply.id

          return (
            <li key={reply.id} className="group flex gap-2.5">
              <Avatar
                name={reply.author?.name ?? 'Unknown'}
                src={reply.author?.avatar_url ?? null}
                size="xs"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-xs font-medium text-primary">
                    {reply.author?.name ?? 'Unknown'}
                  </span>
                  <span className="text-2xs text-tertiary">
                    {formatRelative(reply.created_at)}
                    {isEdited(reply) && ' · Edited'}
                  </span>

                  {(isAuthor || canDelete) && editingId !== reply.id && (
                    <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                      {isAuthor && (
                        <button
                          type="button"
                          className={iconButton}
                          disabled={isPending}
                          onClick={() => {
                            setEditing(reply.id)
                            setEditDraft({
                              html:      reply.body,
                              mentions:  reply.mentions,
                              isEmpty:   false,
                              uploading: false,
                            })
                          }}
                          aria-label="Edit reply"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className={cn(iconButton, 'hover:text-danger hover:bg-danger/10')}
                          disabled={isPending}
                          onClick={() => { void remove(reply) }}
                          aria-label="Delete reply"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </span>
                  )}
                </div>

                {editingId === reply.id ? (
                  <div className="mt-1.5">
                    <RichTextEditor
                      mentionables={mentionables}
                      uploadPrefix={`messages/${projectId}`}
                      onChange={setEditDraft}
                      initialContent={reply.body}
                      placeholder="Edit your reply…"
                      disabled={isPending}
                      autoFocus
                      onSubmitShortcut={() => saveEdit(reply.id)}
                      onEscape={() => setEditing(null)}
                      footer={
                        <div className="flex items-center justify-end gap-2 px-2 py-1.5 border-t border-subtle">
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            disabled={isPending}
                            className="h-7 px-2 text-xs text-secondary hover:text-primary active:opacity-70 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(reply.id)}
                            disabled={isPending || editDraft.isEmpty || editDraft.uploading}
                            className="h-7 px-3 text-xs bg-brand text-bg-base font-medium rounded-md hover:bg-brand/90 active:scale-[0.98] disabled:opacity-40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            {busy ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      }
                    />
                  </div>
                ) : (
                  <div className="mt-0.5">
                    <RichTextBody body={reply.body} size="xs" />
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <RichTextEditor
        ref={composerRef}
        mentionables={mentionables}
        uploadPrefix={`messages/${projectId}`}
        onChange={setDraft}
        placeholder="Write a reply…"
        disabled={isPending}
        onSubmitShortcut={submitNew}
        footer={
          <div className="flex items-center justify-end gap-2 px-2 py-1.5 border-t border-subtle">
            <button
              type="button"
              onClick={submitNew}
              disabled={isPending || draft.isEmpty || draft.uploading}
              className="flex items-center gap-1.5 h-7 px-3 text-xs bg-brand text-bg-base font-medium rounded-md hover:bg-brand/90 active:scale-[0.98] disabled:opacity-40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Send className="size-3" />
              {busyId === 'new' ? 'Posting…' : 'Reply'}
            </button>
          </div>
        }
      />
    </section>
  )
}
