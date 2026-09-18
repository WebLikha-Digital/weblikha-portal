'use client'
/**
 * EDITING WINDOW CARD (admins, Settings)
 * ─────────────────────────────────────────────────────────────────────────────
 * One number: how long after posting an author may still edit. The database
 * enforces it (migration 023); this only changes the number.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useTransition } from 'react'
import { Button, Input } from '@/components/ui'
import { toast, withToast } from '@/components/ui/toast'
import {
  EDIT_WINDOW_MAX_MINUTES, EDIT_WINDOW_MIN_MINUTES, editWindowError,
} from '@/lib/messages'
import { updateEditWindow } from '@/app/(portal)/settings/actions'

interface EditWindowCardProps {
  minutes: number
}

export function EditWindowCard({ minutes }: EditWindowCardProps) {
  const [value, setValue] = useState(String(minutes))
  const [isPending, startTransition] = useTransition()

  const parsed  = Number(value)
  const problem = value.trim() === '' ? 'Enter a number of minutes.' : editWindowError(parsed)
  const dirty   = value.trim() !== String(minutes)

  function save() {
    if (problem) {
      toast.error(problem)
      return
    }
    startTransition(async () => {
      await withToast(async () => {
        await updateEditWindow(parsed)
        toast.success('Editing window updated.')
      }, 'Could not update the editing window.')
    })
  }

  return (
    <div className="card p-4 sm:p-5">
      <h3 className="text-sm font-medium text-primary">Editing window</h3>
      <p className="mt-1 text-xs text-secondary">
        How long after posting someone can still edit their own message, reply or comment.
        Deleting is not affected.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="w-32">
          <Input
            label="Minutes"
            id="edit-window-minutes"
            type="number"
            inputMode="numeric"
            min={EDIT_WINDOW_MIN_MINUTES}
            max={EDIT_WINDOW_MAX_MINUTES}
            value={value}
            onChange={e => setValue(e.target.value)}
            disabled={isPending}
          />
        </div>
        <Button size="md" onClick={save} loading={isPending} disabled={!dirty || problem !== null}>
          Save
        </Button>
      </div>

      {dirty && problem && (
        <p role="alert" className="mt-2 text-2xs text-danger">{problem}</p>
      )}
    </div>
  )
}
