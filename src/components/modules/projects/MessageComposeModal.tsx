'use client'
/**
 * MESSAGE COMPOSE MODAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Create and edit. Mounted by the parent only while open.
 *
 * Visibility: team members get a "Visible to client" switch, OFF by default, and
 * the submit button names the outcome ("Post internally" / "Post to client") so
 * the setting is visible at the moment of posting. Clients get no switch — their
 * posts are always shared. In edit mode visibility is read-only: migration 020
 * locks it after posting.
 *
 * Validation runs client-side with the same rules as the Server Actions, because
 * production Next.js redacts thrown Server Action messages.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { Button, Input, Textarea } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { createMessage, updateMessage } from '@/app/(portal)/projects/message-actions'
import { MESSAGE_BODY_MAX, MESSAGE_TITLE_MAX, messageDraftError } from '@/lib/messages'
import type { MessageWithAuthor, UserRole } from '@/types'

type MessageComposeModalProps =
  | {
      mode:       'create'
      projectId:  string
      viewerRole: UserRole
      onClose:    () => void
      onPosted:   (messageId: string) => void
    }
  | {
      mode:       'edit'
      projectId:  string
      viewerRole: UserRole
      message:    MessageWithAuthor
      onClose:    () => void
      onSaved:    () => void
    }

export function MessageComposeModal(props: MessageComposeModalProps) {
  const isEdit   = props.mode === 'edit'
  const isClient = props.viewerRole === 'client'

  const [title, setTitle] = useState(props.mode === 'edit' ? props.message.title : '')
  const [body, setBody]   = useState(props.mode === 'edit' ? props.message.body : '')
  const [clientVisible, setClientVisible] = useState(
    props.mode === 'edit' ? props.message.is_client_visible : false,
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const { onClose } = props
  const close = useCallback(() => {
    if (!isPending) onClose()
  }, [isPending, onClose])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const problem = messageDraftError({ title, bodyHtml: body, mentions: [], categoryId: null })
    if (problem) {
      setError(problem)
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        if (props.mode === 'create') {
          const shared = isClient || clientVisible
          const id = await createMessage(props.projectId, {
            title,
            bodyHtml:        body,
            mentions:        [],
            categoryId:      null,
            isClientVisible: shared,
          })
          toast.success(shared ? 'Message posted.' : 'Posted internally.')
          props.onPosted(id)
        } else {
          await updateMessage(props.message.id, props.projectId, {
            title,
            bodyHtml:   body,
            mentions:   [],
            categoryId: props.message.category_id,
          })
          toast.success('Message updated.')
          props.onSaved()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
      }
    })
  }

  const submitLabel = isPending
    ? (isEdit ? 'Saving…' : 'Posting…')
    : isEdit
      ? 'Save changes'
      : isClient
        ? 'Post'
        : clientVisible ? 'Post to client' : 'Post internally'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={close} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit message' : 'New message'}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-bg-surface-1 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-subtle">
          <h2 className="text-base font-semibold text-primary">
            {isEdit ? 'Edit message' : 'New message'}
          </h2>
          <button
            onClick={close}
            disabled={isPending}
            className="text-secondary hover:text-primary active:opacity-70 transition-colors duration-150 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <form
          id="message-compose-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5"
        >
          {error && (
            <div
              role="alert"
              className="rounded-md bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger"
            >
              {error}
            </div>
          )}

          <Input
            label="Title"
            id="message-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={MESSAGE_TITLE_MAX}
            disabled={isPending}
            placeholder="e.g. Homepage design is ready for review"
          />

          <Textarea
            label="Message"
            id="message-body"
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={MESSAGE_BODY_MAX}
            disabled={isPending}
            rows={10}
            placeholder="Write your update or question…"
          />

          {/* Visibility */}
          {isEdit ? (
            <div className="rounded-md border border-subtle px-3 py-2.5">
              <p className="text-xs font-medium text-primary">
                {clientVisible ? 'Visible to client' : 'Internal only'}
              </p>
              <p className="text-2xs text-tertiary mt-0.5">
                Visibility can&apos;t be changed after posting.
              </p>
            </div>
          ) : isClient ? (
            <p className="text-2xs text-tertiary">Everyone on this project will see this.</p>
          ) : (
            <div className="flex items-start justify-between gap-4 rounded-md border border-subtle px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-primary">Visible to client</p>
                <p className="text-2xs text-tertiary mt-0.5">
                  {clientVisible
                    ? 'The client will see this post.'
                    : 'Only the agency team will see this post.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={clientVisible}
                aria-label="Visible to client"
                onClick={() => setClientVisible(v => !v)}
                disabled={isPending}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition duration-150',
                  'hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand active:opacity-80',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  clientVisible ? 'bg-brand' : 'bg-bg-surface-3',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-block size-4 rounded-full bg-bg-base transition-transform duration-150',
                    clientVisible ? 'translate-x-4' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>
          )}
        </form>

        <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-subtle">
          <Button variant="outline" size="md" onClick={close} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="message-compose-form" size="md" loading={isPending}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </>
  )
}
