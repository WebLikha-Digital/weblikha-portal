'use client'
/**
 * COMMENT EDITOR — task comments, built on the shared RichTextEditor
 * ─────────────────────────────────────────────────────────────────────────────
 * Adds Post / Cancel and clears after posting. Mentionable: project members plus
 * admins (admins oversee every project, roster or not — the same boundary
 * notifyMentions enforces server-side). Props are unchanged from the pre-split
 * component, so TodoItem needs no edits.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import {
  RichTextEditor, type RichTextEditorHandle, type RichTextValue,
} from '@/components/modules/editor/RichTextEditor'
import type { ProjectMember, User } from '@/types'

interface CommentEditorProps {
  taskId:          string
  members:         (ProjectMember & { user: User })[]
  admins:          User[]
  onSubmit:        (html: string, mentions: string[]) => void
  onCancel?:       (() => void) | undefined
  initialContent?: string | undefined
  submitLabel?:    string | undefined
  autoFocus?:      boolean | undefined
}

export function CommentEditor({
  taskId,
  members,
  admins,
  onSubmit,
  onCancel,
  initialContent,
  submitLabel = 'Post',
  autoFocus = false,
}: CommentEditorProps) {
  const editorRef = useRef<RichTextEditorHandle>(null)
  const [value, setValue] = useState<RichTextValue>({
    html: '', mentions: [], isEmpty: true, uploading: false,
  })

  const mentionables = useMemo(() => {
    const items = members.map(m => ({ id: m.user_id, name: m.user.name }))
    for (const a of admins) {
      if (!items.some(i => i.id === a.id)) items.push({ id: a.id, name: a.name })
    }
    return items.sort((a, b) => a.name.localeCompare(b.name))
  }, [members, admins])

  function handleSubmit() {
    if (value.isEmpty || value.uploading) return
    const { html, mentions } = value
    editorRef.current?.clear()
    onSubmit(html, mentions)
  }

  return (
    <RichTextEditor
      ref={editorRef}
      mentionables={mentionables}
      uploadPrefix={`tasks/${taskId}`}
      onChange={setValue}
      initialContent={initialContent}
      placeholder="Write a comment..."
      autoFocus={autoFocus}
      onSubmitShortcut={handleSubmit}
      onEscape={onCancel}
      footer={
        <div className="flex items-center justify-end gap-2 px-2 py-1.5 border-t border-subtle">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="h-7 px-2 text-xs text-secondary hover:text-primary active:opacity-70 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={value.isEmpty || value.uploading}
            className="flex items-center gap-1.5 h-7 px-3 text-xs bg-brand text-bg-base font-medium rounded-md hover:bg-brand/90 active:scale-[0.98] disabled:opacity-40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Send className="size-3" /> {submitLabel}
          </button>
        </div>
      }
    />
  )
}
