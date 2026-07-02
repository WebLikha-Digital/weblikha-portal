'use client'
/**
 * CONFIRM DIALOG — styled replacement for native confirm()
 * ─────────────────────────────────────────────────────────────────────────────
 * Native confirm() shows the browser's system dialog (with URL chrome) which
 * looks jarring on mobile / in the installed PWA. This renders an in-app,
 * token-styled dialog instead.
 *
 * Usage (from any client component):
 *
 *   import { confirmDialog } from '@/components/ui/confirm-dialog'
 *   if (!await confirmDialog({ title: 'Delete this task?' })) return
 *
 * RULE: every destructive action (anything that deletes data) must go through
 * this dialog — never delete on a single click.
 *
 * <ConfirmHost /> is mounted once in PortalShell.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmOptions {
  title:         string
  message?:      string
  confirmLabel?: string  // defaults to "Delete"
}

let deliver:  ((opts: ConfirmOptions) => void) | null = null
let resolver: ((ok: boolean) => void) | null = null

/** Resolves true if the user confirms, false if they cancel/dismiss. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    resolver?.(false) // dismiss any dialog already open
    resolver = resolve
    deliver?.(opts)
  })
}

export function ConfirmHost() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    deliver = o => setOpts(o)
    return () => { deliver = null }
  }, [])

  function close(ok: boolean) {
    setOpts(null)
    resolver?.(ok)
    resolver = null
  }

  // Focus Cancel (the safe action) on open; Escape dismisses
  useEffect(() => {
    if (!opts) return
    cancelRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts])

  if (!opts) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => close(false)}
        aria-hidden
      />

      {/* Dialog — bottom sheet feel on mobile, centered card on desktop */}
      <div className="relative w-full sm:max-w-sm rounded-lg border border-subtle bg-bg-surface-2 p-5 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="shrink-0 flex size-9 items-center justify-center rounded-full bg-danger/10">
            <AlertTriangle className="size-4 text-danger" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="confirm-title" className="text-sm font-display font-semibold text-primary">
              {opts.title}
            </h2>
            {opts.message && (
              <p className="mt-1 text-sm text-secondary leading-relaxed">
                {opts.message}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={() => close(false)}
            className="h-9 px-4 rounded-md border border-subtle text-sm text-secondary hover:text-primary hover:border-[var(--color-border-default)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => close(true)}
            className="h-9 px-4 rounded-md bg-danger text-sm font-medium text-white hover:bg-danger/90 transition-colors"
          >
            {opts.confirmLabel ?? 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
