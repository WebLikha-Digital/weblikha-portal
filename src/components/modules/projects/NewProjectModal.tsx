'use client'
/**
 * NEW PROJECT MODAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Slide-over panel for creating a new project. Includes member selector so
 * team members (and eventually clients) can be added at creation time.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useRef, useState, useTransition } from 'react'
import { X, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui'
import { createProject } from '@/app/(portal)/projects/actions'
import type { User } from '@/types'

const STATUS_OPTIONS = [
  { value: 'discovery',   label: 'Discovery' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'review',      label: 'Review' },
  { value: 'completed',   label: 'Completed' },
]

interface NewProjectModalProps {
  teamMembers: User[]
}

export function NewProjectModal({ teamMembers }: NewProjectModalProps) {
  const [open, setOpen]           = useState(false)
  const [selectedIds, setSelected] = useState<Set<string>>(new Set())
  const [error, setError]         = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function toggleMember(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSubmit(formData: FormData) {
    setError(null)
    selectedIds.forEach(id => formData.append('member_ids', id))
    startTransition(async () => {
      try {
        await createProject(formData)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.')
      }
    })
  }

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-9 px-4 rounded-md bg-brand text-sm font-medium text-brand-fg hover:bg-brand-hover transition-colors"
      >
        <Plus className="size-4" /> New project
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-over panel */}
      <div className={cn(
        'fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-bg-surface-1 shadow-2xl flex flex-col transition-transform duration-300',
        open ? 'translate-x-0' : 'translate-x-full',
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
          <h2 className="text-base font-semibold text-primary">New project</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-secondary hover:text-primary transition-colors"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Form */}
        <form ref={formRef} action={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {error && (
            <div className="rounded-md bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          {/* Project name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-secondary" htmlFor="name">
              Project name <span className="text-danger">*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              placeholder="e.g. Rethink Website Redesign"
              className="h-9 w-full rounded-md border border-[var(--color-border-default)] bg-bg-surface-2 px-3 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Client name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-secondary" htmlFor="client_name">
              Client name <span className="text-danger">*</span>
            </label>
            <input
              id="client_name"
              name="client_name"
              type="text"
              required
              placeholder="e.g. Rethink Group of Companies"
              className="h-9 w-full rounded-md border border-[var(--color-border-default)] bg-bg-surface-2 px-3 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-secondary" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue="in_progress"
              className="h-9 w-full rounded-md border border-[var(--color-border-default)] bg-bg-surface-2 px-3 text-sm text-white focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary" htmlFor="start_date">
                Start date <span className="text-danger">*</span>
              </label>
              <input
                id="start_date"
                name="start_date"
                type="date"
                required
                className="h-9 w-full rounded-md border border-[var(--color-border-default)] bg-bg-surface-2 px-3 text-sm text-white focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-secondary" htmlFor="end_date">
                End date <span className="text-danger">*</span>
              </label>
              <input
                id="end_date"
                name="end_date"
                type="date"
                required
                className="h-9 w-full rounded-md border border-[var(--color-border-default)] bg-bg-surface-2 px-3 text-sm text-white focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          {/* Budget */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-secondary" htmlFor="budget">
              Budget (PHP)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-tertiary">₱</span>
              <input
                id="budget"
                name="budget"
                type="number"
                min="0"
                step="1000"
                defaultValue="0"
                className="h-9 w-full rounded-md border border-[var(--color-border-default)] bg-bg-surface-2 pl-7 pr-3 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-secondary" htmlFor="description">
              Description <span className="text-tertiary">(optional)</span>
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              placeholder="Brief overview of the project scope..."
              className="w-full rounded-md border border-[var(--color-border-default)] bg-bg-surface-2 px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand resize-none"
            />
          </div>

          {/* Team members */}
          {teamMembers.length > 0 && (
            <div className="space-y-2">
              <div>
                <p className="text-xs font-medium text-secondary">Assign team members</p>
                <p className="text-2xs text-tertiary mt-0.5">Clients can be added after the project is created.</p>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto rounded-md border border-subtle p-1">
                {teamMembers.map(member => {
                  const selected = selectedIds.has(member.id)
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleMember(member.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors',
                        selected ? 'bg-brand/10' : 'hover:bg-bg-surface-3',
                      )}
                    >
                      <Avatar name={member.name} src={member.avatar_url} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-primary truncate">{member.name}</p>
                        <p className="text-2xs text-secondary capitalize">{member.specialty}</p>
                      </div>
                      <div className={cn(
                        'size-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                        selected
                          ? 'bg-brand border-brand text-brand-fg'
                          : 'border-[var(--color-border-default)]',
                      )}>
                        {selected && (
                          <svg viewBox="0 0 10 8" className="size-2.5 fill-current">
                            <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
              {selectedIds.size > 0 && (
                <p className="text-2xs text-secondary">{selectedIds.size} member{selectedIds.size !== 1 ? 's' : ''} selected</p>
              )}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-subtle">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-9 px-4 rounded-md border border-subtle text-sm text-secondary hover:text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            form={undefined}
            type="submit"
            disabled={isPending}
            onClick={() => formRef.current?.requestSubmit()}
            className="flex items-center gap-2 h-9 px-4 rounded-md bg-brand text-sm font-medium text-brand-fg hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {isPending ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </div>
  