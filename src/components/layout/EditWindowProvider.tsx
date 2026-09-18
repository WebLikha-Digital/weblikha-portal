'use client'
/**
 * EDIT WINDOW CONTEXT
 * ─────────────────────────────────────────────────────────────────────────────
 * How many minutes after posting an author may still edit (migration 023).
 * Read once in the portal layout and shared from here, rather than threaded as
 * a prop through project page → tabs layout → tab → card → modal, and again
 * through the todo tree.
 *
 * This only decides what the UI OFFERS. What is allowed is decided by
 * within_edit_window() in the database.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createContext, useContext } from 'react'
import { EDIT_WINDOW_DEFAULT_MINUTES } from '@/lib/messages'

const EditWindowContext = createContext<number>(EDIT_WINDOW_DEFAULT_MINUTES)

interface EditWindowProviderProps {
  minutes:  number
  children: React.ReactNode
}

export function EditWindowProvider({ minutes, children }: EditWindowProviderProps) {
  return (
    <EditWindowContext.Provider value={minutes}>
      {children}
    </EditWindowContext.Provider>
  )
}

/** Minutes an author may still edit. Falls back to the default outside a provider. */
export function useEditWindow(): number {
  return useContext(EditWindowContext)
}
