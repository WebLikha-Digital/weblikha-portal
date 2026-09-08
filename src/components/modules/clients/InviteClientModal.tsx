'use client'
/**
 * INVITE CLIENT MODAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends a Supabase invite that lands the client on /set-password. Projects can
 * be assigned up front; inviteClient reads them from the `projectIds` fields.
 *
 * Errors render inline rather than as a toast: the panel stays open on failure
 * so a mistyped address can be corrected without retyping the whole form.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useState, useTransition } from 'react'
import { X, UserPlus } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import { inviteClient } from '@/app/(portal)/clients/actions'
import { ProjectPicker } from './ProjectPicker'
import type { PickerProject } from '@/types'

export function InviteClientModal({ allProjects }: { allProjects: PickerProject[] }) {
  const [open, setOpen]            = useState(false)
  const [selectedIds, setSelected] = useState<Set<string>>(new Set())
  const [error, setError]          = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const close = useCallback(() => {
    setOpen(false)
    setError(null)
    setSelected(new Set())
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, isPending, close])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSubmit(formData: FormData) {
    setError(null)
    selectedIds.forEach(id => formData.append('projectIds', id))
    const email = String(formData.get('email') ?? '')

    startTransition(async () => {
      try {
        await inviteClient(formData)
        toast.success(`Invite sent to ${email}.`)
        close()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not send the invite.')
      }
    })
  }

  return (
    <>
      <Button
        size="md"
        icon={<UserPlus className="size-4" />}
        onClick={() => setOpen(true)}
      >
        Invite client
      </Button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => { if (!isPending) close() }}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Invite a client"
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-bg-surface-1 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
              <h2 className="text-base font-semibold text-primary">Invite client</h2>
              <button
                onClick={() => { if (!isPending) close() }}
                disabled={isPending}
                className="text-secondary hover:text-primary transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <form id="invite-client-form" action={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {error && (
                <div
                  role="alert"
                  className="rounded-md bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger"
                >
                  {error}
                </div>
              )}

              <Input
                label="Client name"
                id="name"
                name="name"
                type="text"
                required
                placeholder="e.g. Jo Santos"
              />

              <Input
                label="Email address"
                id="email"
                name="email"
                type="email"
                required
                placeholder="jo@acmecorp.com"
              />

              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-secondary">Assign projects</p>
                  <p className="text-2xs text-tertiary mt-0.5">
                    Optional — you can assign projects later.
                  </p>
                </div>
                <ProjectPicker
                  projects={allProjects}
                  selectedIds={selectedIds}
                  onToggle={toggle}
                />
              </div>
            </form>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-subtle">
              <Button variant="outline" size="md" onClick={close} disabled={isPending}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="invite-client-form"
                size="md"
                loading={isPending}
              >
                {isPending ? 'Sending…' : 'Send invite'}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
