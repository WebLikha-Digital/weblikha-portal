'use client'
/**
 * COMMENT EDITOR — Tiptap WYSIWYG for task comments
 * ─────────────────────────────────────────────────────────────────────────────
 * Features:
 *   • Bold / italic / strikethrough / lists / links toolbar
 *   • @mentions — only members of the current project (clients later)
 *   • Images: paste a screenshot, drag-drop, or attach — uploaded to the
 *     Supabase `comment-attachments` bucket, rendered inline while composing
 *
 * Used for both new comments and editing existing ones (pass initialContent).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import {
  forwardRef, useEffect, useImperativeHandle, useRef, useState,
} from 'react'
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react'
import type { Editor, JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Mention from '@tiptap/extension-mention'
import Placeholder from '@tiptap/extension-placeholder'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import {
  Bold, Italic, Strikethrough, List, ListOrdered, Link2, ImagePlus, Send, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { ProjectMember, User } from '@/types'

// ── Image upload ───────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

async function uploadCommentImage(file: File, taskId: string): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null
  if (file.size > MAX_IMAGE_BYTES) {
    alert('Image is too large — max 5 MB.')
    return null
  }
  const supabase = createClient()
  const ext  = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${taskId}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from('comment-attachments')
    .upload(path, file, { contentType: file.type })
  if (error) {
    alert(`Image upload failed: ${error.message}`)
    return null
  }
  return supabase.storage.from('comment-attachments').getPublicUrl(path).data.publicUrl
}

// ── Mention dropdown ───────────────────────────────────────────────────────────

interface MentionItem {
  id:    string
  label: string
}

interface MentionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean
}

const MentionList = forwardRef<MentionListHandle, SuggestionProps<MentionItem>>(
  function MentionList(props, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0)

    useEffect(() => setSelectedIndex(0), [props.items])

    function selectItem(index: number) {
      const item = props.items[index]
      if (item) props.command(item)
    }

    useImperativeHandle(ref, () => ({
      onKeyDown({ event }) {
        if (event.key === 'ArrowUp') {
          setSelectedIndex(i => (i + props.items.length - 1) % props.items.length)
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex(i => (i + 1) % props.items.length)
          return true
        }
        if (event.key === 'Enter') {
          selectItem(selectedIndex)
          return true
        }
        return false
      },
    }))

    if (props.items.length === 0) {
      return (
        <div className="px-3 py-2 text-xs text-tertiary">No matching members</div>
      )
    }

    return (
      <div className="py-1">
        {props.items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => selectItem(index)}
            className={cn(
              'w-full text-left px-3 py-1.5 text-sm transition-colors',
              index === selectedIndex
                ? 'bg-bg-surface-3 text-primary'
                : 'text-secondary hover:bg-bg-surface-3 hover:text-primary',
            )}
          >
            @{item.label}
          </button>
        ))}
      </div>
    )
  }
)

/** Builds the Tiptap suggestion config for @mentions (project members only). */
function buildMentionSuggestion(members: (ProjectMember & { user: User })[]) {
  const items = members.map(m => ({ id: m.user_id, label: m.user.name }))

  return {
    items: ({ query }: { query: string }) =>
      items
        .filter(i => i.label.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6),

    render: () => {
      let component: ReactRenderer<MentionListHandle, SuggestionProps<MentionItem>> | null = null
      let popup: HTMLDivElement | null = null

      function position(clientRect: (() => DOMRect | null) | null | undefined) {
        if (!popup || !clientRect) return
        const rect = clientRect()
        if (!rect) return
        popup.style.left = `${rect.left}px`
        popup.style.top  = `${rect.bottom + 4}px`
      }

      return {
        onStart: (props: SuggestionProps<MentionItem>) => {
          component = new ReactRenderer(MentionList, { props, editor: props.editor })
          popup = document.createElement('div')
          popup.className =
            'fixed z-50 min-w-[180px] max-h-[200px] overflow-y-auto bg-bg-surface-2 border border-subtle rounded-lg shadow-lg'
          popup.appendChild(component.element)
          document.body.appendChild(popup)
          position(props.clientRect)
        },
        onUpdate: (props: SuggestionProps<MentionItem>) => {
          component?.updateProps(props)
          position(props.clientRect)
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (props.event.key === 'Escape') {
            popup?.remove()
            return true
          }
          return component?.ref?.onKeyDown(props) ?? false
        },
        onExit: () => {
          popup?.remove()
          component?.destroy()
          popup = null
          component = null
        },
      }
    },
  }
}

/** Walks the editor document and collects mentioned user IDs. */
function extractMentions(doc: JSONContent): string[] {
  const ids = new Set<string>()
  function walk(node: JSONContent) {
    if (node.type === 'mention' && typeof node.attrs?.id === 'string') {
      ids.add(node.attrs.id)
    }
    node.content?.forEach(walk)
  }
  walk(doc)
  return Array.from(ids)
}

// ── Toolbar ────────────────────────────────────────────────────────────────────

interface ToolbarProps {
  editor:    Editor
  onAttach:  () => void
  uploading: boolean
}

function Toolbar({ editor, onAttach, uploading }: ToolbarProps) {
  const btn = (active: boolean) => cn(
    'p-1.5 rounded transition-colors',
    active ? 'bg-bg-surface-3 text-primary' : 'text-tertiary hover:text-primary',
  )

  function toggleLink() {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const url = prompt('Link URL:')
    if (url) editor.chain().focus().setLink({ href: url }).run()
  }

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-subtle flex-wrap">
      <button type="button" title="Bold" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))}>
        <Bold className="size-3.5" />
      </button>
      <button type="button" title="Italic" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))}>
        <Italic className="size-3.5" />
      </button>
      <button type="button" title="Strikethrough" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive('strike'))}>
        <Strikethrough className="size-3.5" />
      </button>
      <div className="w-px h-4 bg-[var(--color-border-subtle)] mx-1" />
      <button type="button" title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))}>
        <List className="size-3.5" />
      </button>
      <button type="button" title="Numbered list" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))}>
        <ListOrdered className="size-3.5" />
      </button>
      <div className="w-px h-4 bg-[var(--color-border-subtle)] mx-1" />
      <button type="button" title="Link" onClick={toggleLink} className={btn(editor.isActive('link'))}>
        <Link2 className="size-3.5" />
      </button>
      <button type="button" title="Attach image" onClick={onAttach} disabled={uploading} className={cn(btn(false), 'disabled:opacity-40')}>
        {uploading
          ? <Loader2 className="size-3.5 animate-spin" />
          : <ImagePlus className="size-3.5" />}
      </button>
      <span className="ml-auto text-2xs text-tertiary hidden sm:inline">
        @ to mention · paste or drop images
      </span>
    </div>
  )
}

// ── Main editor ────────────────────────────────────────────────────────────────

interface CommentEditorProps {
  taskId:          string
  members:         (ProjectMember & { user: User })[]
  onSubmit:        (html: string, mentions: string[]) => void
  onCancel?:       () => void
  initialContent?: string
  submitLabel?:    string
  autoFocus?:      boolean
}

export function CommentEditor({
  taskId,
  members,
  onSubmit,
  onCancel,
  initialContent,
  submitLabel = 'Post',
  autoFocus = false,
}: CommentEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? 'end' : false,
    extensions: [
      StarterKit.configure({ heading: false, horizontalRule: false }),
      Placeholder.configure({ placeholder: 'Write a comment...' }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      }),
      Image,
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: buildMentionSuggestion(members),
      }),
    ],
    content: initialContent ?? '',
    editorProps: {
      // Same styles as posted comments — list markers, yellow mention chips, etc.
      attributes: { class: 'rich-text' },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        const images = files.filter(f => f.type.startsWith('image/'))
        if (images.length === 0) return false
        event.preventDefault()
        void insertImages(images)
        return true
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? [])
        const images = files.filter(f => f.type.startsWith('image/'))
        if (images.length === 0) return false
        event.preventDefault()
        void insertImages(images)
        return true
      },
    },
  })

  // Editor instance is created once; keep a ref so insertImages sees the latest
  const editorRef = useRef(editor)
  editorRef.current = editor

  async function insertImages(files: File[]) {
    setUploading(true)
    try {
      for (const file of files) {
        const url = await uploadCommentImage(file, taskId)
        if (url) editorRef.current?.chain().focus().setImage({ src: url }).run()
      }
    } finally {
      setUploading(false)
    }
  }

  function handleAttach() {
    fileInputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length > 0) void insertImages(files)
  }

  function handleSubmit() {
    if (!editor || editor.isEmpty || uploading) return
    const html     = editor.getHTML()
    const mentions = extractMentions(editor.getJSON())
    editor.commands.clearContent()
    onSubmit(html, mentions)
  }

  if (!editor) return null

  return (
    <div className="comment-editor bg-bg-surface-3 border border-subtle rounded-md focus-within:border-brand transition-colors">
      <Toolbar editor={editor} onAttach={handleAttach} uploading={uploading} />

      <EditorContent
        editor={editor}
        onKeyDown={e => {
          // Ctrl/Cmd+Enter submits; Escape cancels (when editing)
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            handleSubmit()
          }
          if (e.key === 'Escape' && onCancel) onCancel()
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex items-center justify-end gap-2 px-2 py-1.5 border-t border-subtle">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-7 px-2 text-xs text-secondary hover:text-primary transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={editor.isEmpty || uploading}
          className="flex items-center gap-1.5 h-7 px-3 text-xs bg-brand text-bg-base font-medium rounded-md hover:bg-brand/90 disabled:opacity-40 tr