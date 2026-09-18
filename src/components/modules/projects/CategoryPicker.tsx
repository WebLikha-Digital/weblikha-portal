'use client'
/**
 * CATEGORY PICKER
 * ─────────────────────────────────────────────────────────────────────────────
 * Button + listbox: None, then active categories by position. Only an existing
 * post whose SAVED category is archived may keep it selected, shown as
 * "(archived)" — pass that category's id as `keepArchivedId`. A newly-composed
 * post, or one whose category has since been switched away, never offers an
 * archived category as a choice.
 * Keyboard: arrows move, Enter/Space choose, Escape closes ONLY the list —
 * it stops propagation so the surrounding modal's Escape listener doesn't fire.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MessageCategory } from '@/types'

interface CategoryPickerProps {
  categories:      MessageCategory[]
  value:           string | null
  onChange:        (id: string | null) => void
  canManage:       boolean
  onManage:        () => void
  disabled?:       boolean | undefined
  /** The only archived category id allowed to appear, as "(archived)" — the
   *  post's own saved category when editing. Omit/null on a new post. */
  keepArchivedId?: string | null | undefined
}

interface Option {
  id:       string | null
  label:    string
  emoji:    string | null
  archived: boolean
}

export function CategoryPicker({
  categories, value, onChange, canManage, onManage, disabled = false, keepArchivedId = null,
}: CategoryPickerProps) {
  const [open, setOpen]     = useState(false)
  const [active, setActive] = useState(0)
  const rootRef    = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  const selected = categories.find(c => c.id === value) ?? null
  const selectedArchivedKept = Boolean(selected?.archived_at && selected.id === keepArchivedId)

  const options: Option[] = [
    { id: null, label: 'None', emoji: null, archived: false },
    ...(selectedArchivedKept && selected
      ? [{ id: selected.id, label: selected.name, emoji: selected.emoji, archived: true }]
      : []),
    ...categories
      .filter(c => !c.archived_at)
      .sort((a, b) => a.position - b.position)
      .map(c => ({ id: c.id, label: c.name, emoji: c.emoji, archived: false })),
  ]

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  useEffect(() => {
    if (open) optionRefs.current[active]?.focus()
  }, [open, active])

  function openList() {
    const index = options.findIndex(o => o.id === value)
    setActive(index < 0 ? 0 : index)
    setOpen(true)
  }

  function choose(id: string | null) {
    onChange(id)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!open) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(i => (i + 1) % options.length)
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => (i - 1 + options.length) % options.length)
    }
  }

  const optionClass =
    'flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors duration-150 ' +
    'hover:bg-bg-surface-3 active:bg-bg-surface-3 focus-visible:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand'

  return (
    <div ref={rootRef} className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="inline-flex max-w-full items-center gap-1.5 h-8 px-3 rounded-md border border-subtle text-sm text-secondary hover:text-primary hover:border-[var(--color-border-default)] active:opacity-80 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="truncate">
          {selected && (!selected.archived_at || selectedArchivedKept)
            ? `${selected.emoji} ${selected.name}${selected.archived_at ? ' (archived)' : ''}`
            : 'Pick a category (optional)'}
        </span>
        <ChevronDown className="size-3.5 shrink-0" aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Message category"
          className="absolute left-0 z-10 mt-1 w-full sm:w-64 card shadow-lg py-1"
        >
          {options.map((option, index) => {
            const isSelected = option.id === value
            return (
              <button
                key={option.id ?? 'none'}
                ref={el => { optionRefs.current[index] = el }}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => choose(option.id)}
                className={cn(optionClass, isSelected ? 'text-primary font-medium' : 'text-secondary')}
              >
                <span className="w-5 shrink-0 text-center" aria-hidden>{option.emoji ?? ''}</span>
                <span className="flex-1 truncate">
                  {option.label}
                  {option.archived && <span className="text-tertiary"> (archived)</span>}
                </span>
                {isSelected && <Check className="size-3.5 shrink-0 text-brand" aria-hidden />}
              </button>
            )
          })}

          {canManage && (
            <>
              <div className="my-1 border-t border-subtle" />
              <button
                type="button"
                onClick={() => { setOpen(false); onManage() }}
                className={cn(optionClass, 'text-secondary')}
              >
                <Settings2 className="size-3.5 shrink-0" aria-hidden />
                Edit categories…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
