'use client'
/**
 * TOAST — minimal, dependency-free notifications
 * ─────────────────────────────────────────────────────────────────────────────
 * Module-level event bus so any client code can fire a toast without context:
 *
 *   import { toast } from '@/components/ui/toast'
 *   toast.error('Could not save the task.')
 *
 * <Toaster /> is mounted once in PortalShell.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastKind = 'error' | 'success'

interface ToastItem {
  id:      number
  kind:    ToastKind
  message: string
}

type Listener = (item: ToastItem) => void

let nextId = 1
const listeners = new Set<Listener>()

function emit(kind: ToastKind, message: string) {
  const item = { id: nextId++, kind, message }
  listeners.forEach(l => l(item))
}

export const toast = {
  error:   (message: string) => emit('error', message),
  success: (message: string) => emit('success', message),
}

/** Runs an async server action; on failure, reverts are handled by
 *  useOptimistic and the error surfaces as a toast instead of crashing. */
export async function withToast(action: () => Promise<void>, fallbackMessage: string) {
  try {
    await action()
  } catch (err) {
    toast.error(err instanceof Error ? err.message : fallbackMessage)
  }
}

const DISMISS_MS = 4000

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const listener: Listener = item => {
      setItems(prev => [...prev, item])
      setTimeout(() => {
        setItems(prev => prev.filter(i => i.id !== item.id))
      }, DISMISS_MS)
    }
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  if (items.length === 0) return null

  return (
    <div
      className="fixed bottom-20 md:bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 z-[100] flex flex-col gap-2 sm:w-[340px]"
      role="status"
      aria-live="polite"
    >
      {items.map(item => (
        <div
          key={item.id}
          className={cn(
            'flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm shadow-lg bg-bg-surface-2',
            item.kind === 'error' ? 'border-danger/40' : 'border-success/40',
          )}
        >
          {item.kind === 'error'
            ? <AlertCircle  className="size-4 shrink-0 text-danger mt-px" aria-hidden />
            : <CheckCircle2 className="size-4 shrink-0 text-success mt-px" aria-hidden />}
          <p className="flex-1 min-w-0 text-primary leading-snug">{item.message}</p>
          <button
            onClick={() => setItems(prev => prev.filter(i => i.id !== item.id))}
            className="shrink-0 text-tertiary hover:text-primary transition-colors"
            aria-label="Dismiss"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  )
}
