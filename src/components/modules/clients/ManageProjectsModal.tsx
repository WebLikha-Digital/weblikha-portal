'use client'
/**
 * MANAGE PROJECTS MODAL
 * ─────────────────────────────────────────────────────────────────────────────
 * Slide-over matching NewProjectModal. Saves the full desired set in one call —
 * setClientProjects reconciles adds and removes itself.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui'
import { toast, withToast } from '@/components/ui/toast'
import { setClientProjects } from '@/app/(portal)/clients/actions'
import { ProjectPicker } from './ProjectPicker'
import type { ClientRow, PickerProject } from '@/types'

interface ManageProjectsModalProps {
  row:         ClientRow
  allProjects: PickerProject[]
  onClose:     () => void
}

export function ManageProjectsModal({ row, allProjects, onClose }: ManageProjectsModalProps) {
  const [selectedIds, setSelected] = useState<Set<string>>(
    () => new Set(row.projects.map(p => p.id)),
  )
  const [isPending, startTransition] = useTransition()

  // Escape closes, matching the confirm dialog's behaviour.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSave() {
    startTransition(async () => {
      await withToast(
        async () => {
          await setClientProjects(row.user.id, [...selectedIds])
          toast.success(`Updated ${row.user.name}'s projects.`)
          onClose()
        },
        'Could not update project assignments.',
      )
    })
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Manage projects for ${row.user.name}`}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-bg-surface-1 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-primary truncate">Manage projects</h2>
            <p className="text-2xs text-secondary truncate">{row.user.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-secondary hover:text-primary transition-colors rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <ProjectPicker
            projects={allProjects}
            selectedIds={selectedIds}
            onToggle={toggle}
          />
          <p className="text-2xs text-secondary mt-2">
            {selectedIds.size} project{selectedIds.size === 1 ? '' : 's'} selected
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-subtle">
          <Button variant="outline" size="md" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button size="md" loading={isPending} onClick={handleSave}>
            {isPending ? 'Saving…' : 'Save projects'}
          </Button>
        </div>
      </div>
    </>
  )
}
