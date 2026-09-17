'use client'
/**
 * MESSAGE COMPOSE MODAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Create and edit. Mounted by the parent only while open.
 *
 * Order: category → title → rich-text body → visibility → footer.
 *
 * Visibility: team members get a "Visible to client" switch, OFF by default;
 * the submit button names the outcome. Clients have no switch — always shared.
 * Locked after posting (migration 020).
 *
 * Mentions: project members + approved admins. On an INTERNAL post clients are
 * removed from the list, and if the switch is turned off after a client was
 * mentioned, a note explains they won't be notified. Migration 021's trigger
 * enforces the same rule in the database.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { createMessage, updateMessage } from '@/app/(portal)/projects/message-actions'
import { MESSAGE_TITLE_MAX, messageDraftError, plainTextToHtml } from '@/lib/messages'
import {
  RichTextEditor, type MentionCandidate, type RichTextValue,
} from '@/components/modules/editor/RichTextEditor'
import { CategoryPicker } from './CategoryPicker'
import { CategoryManagerModal } from './CategoryManagerModal'
import type {
  MessageCategory, MessageWithAuthor, ProjectMember, User, UserRole,
} from '@/types'

interface SharedProps {
  projectId:  string
  viewerRole: UserRole
  categories: MessageCategory[]
  members:    (ProjectMember & { user: User })[]
  admins:     User[]
  onClose:    () => void
}

type MessageComposeModalProps =
  | (SharedProps & { mode: 'create'; onPosted: (messageId: string) => void })
  | (SharedProps & { mode: 'edit'; message: MessageWithAuthor; onSaved: () => void })

export function MessageComposeModal(props: MessageComposeModalProps) {
  const isEdit   = props.mode === 'edit'
  const isClient = props.viewerRole === 'client'
  const isAdmin  = props.viewerRole === 'admin'

  const initialHtml = props.mode === 'edit' ? plainTextToHtml(props.message.body) : ''

  const [title, setTitle] = useState(props.mode === 'edit' ? props.message.title : '')
  const [body, setBody]   = useState<RichTextValue>({
    html:      initialHtml,
    mentions:  props.mode === 'edit' ? props.message.mentions : [],
    isEmpty:   props.mode !== 'edit',
    uploading: false,
  })
  const [categoryId, setCategoryId] = useState<string | null>(
    props.mode === 'edit' ? props.message.category_id : null,
  )
  const [clientVisible, setClientVisible] = useState(
    props.mode === 'edit' ? props.message.is_client_visible : false,
  )
  const [managing, setManaging] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const shared = isClient || clientVisible

  const roleById = useMemo(() => {
    const map = new Map<string, UserRole>()
    for (const m of props.members) map.set(m.user_id, m.user.role)
    for (const a of props.admins) map.set(a.id, 'admin')
    return map
  }, [props.members, props.admins])

  const allCandidates = useMemo<MentionCandidate[]>(() => {
    const items: MentionCandidate[] = props.members.map(m => ({ id: m.user_id, name: m.user.name }))
    for (const a of props.admins) {
      if (!items.some(i => i.id === a.id)) items.push({ id: a.id, name: a.name })
    }
    return items.sort((a, b) => a.name.localeCompare(b.name))
  }, [props.members, props.admins])

  const mentionables = useMemo(
    () => (shared ? allCandidates : allCandidates.filter(c => roleById.get(c.id) !== 'client')),
    [shared, allCandidates, roleById],
  )

  const mentionsClientOnInternal =
    !shared && body.mentions.some(id => roleById.get(id) === 'client')

  const { onClose } = props
  const close = useCallback(() => {
    if (!isPending) onClose()
  }, [isPending, onClose])

  useEffect(() => {
    if (managing) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close, managing])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (body.uploading) {
      setError('Wait for images to finish uploading.')
      return
    }
    const draft = { title, bodyHtml: body.html, mentions: body.mentions, categoryId }
    const problem = messageDraftError(draft)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        if (props.mode === 'create') {
          const id = await createMessage(props.projectId, { ...draft, isClientVisible: shared })
          toast.success(shared ? 'Message posted.' : 'Posted internally.')
          props.onPosted(id)
        } else {
          await updateMessage(props.message.id, props.projectId, draft)
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
        className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-bg-surface-1 shadow-2xl flex flex-col"
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

          <CategoryPicker
            categories={props.categories}
            value={categoryId}
            onChange={setCategoryId}
            canManage={isAdmin}
            onManage={() => setManaging(true)}
            disabled={isPending}
          />

          <Input
            label="Title"
            id="message-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={MESSAGE_TITLE_MAX}
            disabled={isPending}
            placeholder="e.g. Homepage design is ready for review"
          />

          <div className="flex flex-col gap-1">
            <p className="text-xs text-secondary font-medium">Message</p>
            <RichTextEditor
              mentionables={mentionables}
              uploadPrefix={`messages/${props.projectId}`}
              onChange={setBody}
              initialContent={initialHtml}
              placeholder="Write your update or question…"
              disabled={isPending}
              contentClassName="[&_.ProseMirror]:min-h-48"
            />
            {mentionsClientOnInternal && (
              <p className="text-2xs text-warning">
                Clients mentioned here won&apos;t be notified — this post is internal.
              </p>
            )}
          </div>

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

      {managing && (
        <CategoryManagerModal
          categories={props.categories}
          onClose={() => setManaging(false)}
        />
      )}
    </>
  )
}
