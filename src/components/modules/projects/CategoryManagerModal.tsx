'use client'
/**
 * CATEGORY MANAGER (admins)
 * ─────────────────────────────────────────────────────────────────────────────
 * Opened on top of the compose modal. Its Escape listener runs in the CAPTURE
 * phase and stops propagation, so Escape closes only this panel — the compose
 * modal beneath listens in the bubble phase (same approach as ConfirmHost).
 * Archive is reversible and posts keep their category, so it has no confirm.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState, useTransition } from 'react'
import { ArrowDown, ArrowUp, Archive, ChevronRight, Plus, RotateCcw, X } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { toast, withToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { CATEGORY_EMOJI_MAX, CATEGORY_NAME_MAX, categoryDraftError } from '@/lib/messages'
import {
  archiveCategory, createCategory, reorderCategories, restoreCategory, updateCategory,
} from '@/app/(portal)/projects/message-category-actions'
import type { MessageCategory } from '@/types'

interface CategoryManagerModalProps {
  categories: MessageCategory[]
  onClose:    () => void
}

type Draft = { name: string; emoji: string }

export function CategoryManagerModal({ categories, onClose }: CategoryManagerModalProps) {
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId]         = useState<string | null>(null)
  const [drafts, setDrafts]         = useState<Record<string, Draft>>({})
  const [newDraft, setNewDraft]     = useState<Draft>({ name: '', emoji: '' })
  const [showArchived, setShowArchived] = useState(false)

  const active   = categories.filter(c => !c.archived_at).sort((a, b) => a.position - b.position)
  const archived = categories.filter(c => c.archived_at)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (!isPending) onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [isPending, onClose])

  function valueFor(c: MessageCategory): Draft {
    return drafts[c.id] ?? { name: c.name, emoji: c.emoji }
  }

  function isDirty(c: MessageCategory): boolean {
    const d = drafts[c.id]
    return !!d && (d.name !== c.name || d.emoji !== c.emoji)
  }

  function setDraft(id: string, patch: Partial<Draft>, base: Draft) {
    setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] ?? base), ...patch } }))
  }

  function run(id: string, action: () => Promise<void>, success: string, fallback: string) {
    setBusyId(id)
    startTransition(async () => {
      await withToast(async () => {
        await action()
        toast.success(success)
      }, fallback)
      setBusyId(null)
    })
  }

  function save(c: MessageCategory) {
    const draft   = valueFor(c)
    const problem = categoryDraftError(draft)
    if (problem) {
      toast.error(problem)
      return
    }
    run(c.id, async () => {
      await updateCategory(c.id, draft)
      setDrafts(prev => {
        const next = { ...prev }
        delete next[c.id]
        return next
      })
    }, 'Category saved.', 'Could not save the category.')
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= active.length) return
    const ids = active.map(c => c.id)
    const a = ids[index]
    const b = ids[target]
    if (a === undefined || b === undefined) return
    ids[index]  = b
    ids[target] = a
    run(a, () => reorderCategories(ids), 'Order updated.', 'Could not reorder categories.')
  }

  function add() {
    const problem = categoryDraftError(newDraft)
    if (problem) {
      toast.error(problem)
      return
    }
    run('new', async () => {
      await createCategory(newDraft)
      setNewDraft({ name: '', emoji: '' })
    }, 'Category added.', 'Could not add the category.')
  }

  const iconButton =
    'p-1.5 rounded-md text-secondary hover:text-primary hover:bg-bg-surface-3 active:opacity-70 ' +
    'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' +
    'disabled:opacity-40 disabled:cursor-not-allowed'

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
        aria-label="Edit message categories"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-bg-surface-1 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-subtle">
          <h2 className="text-base font-semibold text-primary">Message categories</h2>
          <button
            onClick={() => { if (!isPending) onClose() }}
            disabled={isPending}
            className={iconButton}
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
          <p className="text-2xs text-tertiary">
            Categories are shared by every project. Tip: press Win + . or Ctrl + Cmd + Space for emoji.
          </p>

          <ul className="space-y-2">
            {active.map((c, index) => {
              const v    = valueFor(c)
              const busy = busyId === c.id
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-subtle p-2">
                  <input
                    aria-label="Emoji"
                    value={v.emoji}
                    maxLength={CATEGORY_EMOJI_MAX}
                    onChange={e => setDraft(c.id, { emoji: e.target.value }, v)}
                    disabled={isPending}
                    className="w-12 h-9 rounded-md border border-[var(--color-border-default)] bg-bg-surface-1 text-center text-base focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
                  />
                  <div className="min-w-0 flex-1">
                    <Input
                      aria-label="Name"
                      value={v.name}
                      maxLength={CATEGORY_NAME_MAX}
                      onChange={e => setDraft(c.id, { name: e.target.value }, v)}
                      disabled={isPending}
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    {isDirty(c) && (
                      <Button size="sm" loading={busy} disabled={isPending} onClick={() => save(c)}>
                        Save
                      </Button>
                    )}
                    <button type="button" className={iconButton} disabled={isPending || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${c.name} up`}>
                      <ArrowUp className="size-4" />
                    </button>
                    <button type="button" className={iconButton} disabled={isPending || index === active.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${c.name} down`}>
                      <ArrowDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      className={iconButton}
                      disabled={isPending}
                      onClick={() => run(c.id, () => archiveCategory(c.id), `${c.name} archived.`, 'Could not archive the category.')}
                      aria-label={`Archive ${c.name}`}
                      title="Archive"
                    >
                      <Archive className="size-4" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-subtle p-2">
            <input
              aria-label="New category emoji"
              placeholder="🙂"
              value={newDraft.emoji}
              maxLength={CATEGORY_EMOJI_MAX}
              onChange={e => setNewDraft(d => ({ ...d, emoji: e.target.value }))}
              disabled={isPending}
              className="w-12 h-9 rounded-md border border-[var(--color-border-default)] bg-bg-surface-1 text-center text-base focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-50"
            />
            <div className="min-w-0 flex-1">
              <Input
                aria-label="New category name"
                placeholder="New category"
                value={newDraft.name}
                maxLength={CATEGORY_NAME_MAX}
                onChange={e => setNewDraft(d => ({ ...d, name: e.target.value }))}
                disabled={isPending}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              icon={<Plus className="size-3.5" />}
              loading={busyId === 'new'}
              disabled={isPending}
              onClick={add}
            >
              Add category
            </Button>
          </div>

          {archived.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowArchived(s => !s)}
                aria-expanded={showArchived}
                className="flex items-center gap-1 text-xs text-secondary hover:text-primary active:opacity-70 rounded transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ChevronRight className={cn('size-3.5 transition-transform duration-150', showArchived && 'rotate-90')} />
                Archived ({archived.length})
              </button>
              {showArchived && (
                <ul className="mt-2 space-y-2">
                  {archived.map(c => (
                    <li key={c.id} className="flex items-center gap-2 rounded-md border border-subtle px-3 py-2">
                      <span aria-hidden>{c.emoji}</span>
                      <span className="flex-1 truncate text-sm text-secondary">{c.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<RotateCcw className="size-3.5" />}
                        loading={busyId === c.id}
                        disabled={isPending}
                        onClick={() => run(c.id, () => restoreCategory(c.id), `${c.name} restored.`, 'Could not restore the category.')}
                      >
                        Restore
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
