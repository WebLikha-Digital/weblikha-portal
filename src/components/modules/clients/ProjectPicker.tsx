'use client'
/**
 * PROJECT PICKER
 * ─────────────────────────────────────────────────────────────────────────────
 * Presentational multi-select over projects. Holds no state and calls no
 * actions — both the invite modal and the manage modal own their own selection
 * and render this.
 *
 * Archived projects are hidden unless the client is already assigned to one,
 * so an existing assignment is never silently dropped on save.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { cn } from '@/lib/utils'
import { Badge, statusLabel } from '@/components/ui'
import type { PickerProject } from '@/types'

interface ProjectPickerProps {
  projects:    PickerProject[]
  selectedIds: Set<string>
  onToggle:    (id: string) => void
}

export function ProjectPicker({ projects, selectedIds, onToggle }: ProjectPickerProps) {
  const visible = projects.filter(
    p => p.status !== 'archived' || selectedIds.has(p.id),
  )

  if (visible.length === 0) {
    return (
      <p className="text-sm text-secondary py-3">
        No projects available to assign.
      </p>
    )
  }

  return (
    <div
      className="space-y-1 max-h-64 overflow-y-auto rounded-md border border-subtle p-1"
      role="group"
      aria-label="Assign projects"
    >
      {visible.map(project => {
        const selected = selectedIds.has(project.id)
        return (
          <button
            key={project.id}
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={() => onToggle(project.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left',
              'transition-colors duration-150 active:scale-[0.99]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
              selected ? 'bg-brand/10' : 'hover:bg-bg-surface-3',
            )}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-primary truncate">{project.name}</p>
            </div>
            <Badge status={project.status}>{statusLabel[project.status]}</Badge>
            <div className={cn(
              'size-4 rounded border flex items-center justify-center shrink-0 transition-colors',
              selected
                ? 'bg-brand border-brand text-brand-fg'
                : 'border-[var(--color-border-default)]',
            )}>
              {selected && (
                <svg viewBox="0 0 10 8" className="size-2.5" aria-hidden>
                  <path
                    d="M1 4l3 3 5-6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
