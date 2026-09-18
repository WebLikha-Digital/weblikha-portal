'use client'
/**
 * RICH TEXT EDITOR — shared TipTap form field
 * ─────────────────────────────────────────────────────────────────────────────
 * Used by task comments (via CommentEditor) and message board posts. A form
 * field, not a form: it reports { html, mentions, isEmpty, uploading } through
 * onChange and has no submit button of its own. Callers put buttons in `footer`.
 *
 *   • Bold / italic / strikethrough / lists / links toolbar
 *   • @mentions from `mentionables` — read through a ref, so the list can change
 *     (e.g. a message switching between internal and shared) without a remount
 *   • Images: paste, drag-drop or attach — uploaded to the `comment-attachments`
 *     bucket under `${uploadPrefix}/`. Failures toast; never a native alert().
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
  Bold, Italic, Strikethrough, List, ListOrdered, Link2, ImagePlus, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

export interface MentionCandidate {
  id:   string
  name: string
}

export interface RichTextValue {
  html:      string
  mentions:  string[]
  isEmpty:   boolean
  uploading: boolean
}

export interface RichTextEditorHandle {
  clear: () => void
}

interface RichTextEditorProps {
  mentionables:      MentionCandidate[]
  uploadPrefix:      string
  onChange:          (value: RichTextValue) => void
  initialContent?:   string | undefined
  placeholder?:      string | undefined
  disabled?:         boolean | undefined
  autoFocus?:        boolean | undefined
  onSubmitShortcut?: (() => void) | undefined
  onEscape?:         (() => void) | undefined
  contentClassName?: string | undefined
  footer?:           React.ReactNode
}

// ── Image upload ───────────────────────────────────────────────────────────────

const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

async function uploadImage(file: File, uploadPrefix: string): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null
  if (file.size > MAX_IMAGE_BYTES) {
    toast.error('Image is too large — max 5 MB.')
    return null
  }
  const supabase = createClient()
  const ext  = file.name.split('.').pop()?.toLowerCase() || 'png'
  const path = `${uploadPrefix}/${crypto.randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from('comment-attachments')
    .upload(path, file, { contentType: file.type })
  if (error) {
    toast.error(`Image upload failed: ${error.message}`)
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
        if (props.items.length === 0) return false
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
        <div className="px-3 py-2 text-xs text-tertiary">No matching people</div>
      )
    }

    return (
      <div className="py-1">
        {props.items.map((item, index) => (
          <button
            key={item.id}
            type="button"
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
  },
)

function buildMentionSuggestion(getCandidates: () => MentionCandidate[]) {
  return {
    items: ({ query }: { query: string }) =>
      getCandidates()
        .filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6)
        .map(c => ({ id: c.id, label: c.name })),

    render: () => {
      let component: ReactRenderer<MentionListHandle, SuggestionProps<MentionItem>> | null = null
      let popup: HTMLDivElement | null = null
      // Escape closes the popup but TipTap's suggestion plugin stays active
      // (the user hasn't left the @query). Without this flag, a later
      // Enter/Arrow key would still route to the destroyed-looking-but-alive
      // MentionList and silently insert a mention.
      let dismissed = false

      function position(clientRect: (() => DOMRect | null) | null | undefined) {
        if (!popup || !clientRect) return
        const rect = clientRect()
        if (!rect) return
        popup.style.left = `${rect.left}px`
        popup.style.top  = `${rect.bottom + 4}px`
      }

      return {
        onStart: (props: SuggestionProps<MentionItem>) => {
          dismissed = false
          component = new ReactRenderer(MentionList, { props, editor: props.editor })
          popup = document.createElement('div')
          popup.className =
            'fixed z-[60] min-w-[180px] max-h-[200px] overflow-y-auto bg-bg-surface-2 border border-subtle rounded-lg shadow-lg'
          popup.appendChild(component.element)
          document.body.appendChild(popup)
          position(props.clientRect)
        },
        onUpdate: (props: SuggestionProps<MentionItem>) => {
          if (dismissed) return
          component?.updateProps(props)
          position(props.clientRect)
        },
        onKeyDown: (props: SuggestionKeyDownProps) => {
          if (dismissed) return false
          if (props.event.key === 'Escape') {
            // Keep Escape from bubbling to a surrounding modal's document
            // listener — it should close the mention list, not the modal.
            props.event.stopPropagation()
            popup?.remove()
            dismissed = true
            return true
          }
          return component?.ref?.onKeyDown(props) ?? false
        },
        onExit: () => {
          popup?.remove()
          component?.destroy()
          popup = null
          component = null
          dismissed = false
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
  disabled:  boolean
}

function Toolbar({ editor, onAttach, uploading, disabled }: ToolbarProps) {
  const btn = (active: boolean) => cn(
    'p-1.5 rounded transition-colors duration-150 active:opacity-70',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
    'disabled:opacity-40 disabled:cursor-not-allowed',
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
      <button type="button" title="Bold" disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))}>
        <Bold className="size-3.5" />
      </button>
      <button type="button" title="Italic" disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))}>
        <Italic className="size-3.5" />
      </button>
      <button type="button" title="Strikethrough" disabled={disabled} onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive('strike'))}>
        <Strikethrough className="size-3.5" />
      </button>
      <div className="w-px h-4 bg-[var(--color-border-subtle)] mx-1" />
      <button type="button" title="Bullet list" disabled={disabled} onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))}>
        <List className="size-3.5" />
      </button>
      <button type="button" title="Numbered list" disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))}>
        <ListOrdered className="size-3.5" />
      </button>
      <div className="w-px h-4 bg-[var(--color-border-subtle)] mx-1" />
      <button type="button" title="Link" disabled={disabled} onClick={toggleLink} className={btn(editor.isActive('link'))}>
        <Link2 className="size-3.5" />
      </button>
      <button type="button" title="Attach image" onClick={onAttach} disabled={disabled || uploading} className={btn(false)}>
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

// ── Editor ─────────────────────────────────────────────────────────────────────

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({
    mentionables,
    uploadPrefix,
    onChange,
    initialContent,
    placeholder = 'Write something…',
    disabled = false,
    autoFocus = false,
    onSubmitShortcut,
    onEscape,
    contentClassName,
    footer,
  }, ref) {
    const fileInputRef    = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const uploadingRef    = useRef(false)
    const mentionablesRef = useRef(mentionables)
    const onChangeRef     = useRef(onChange)
    mentionablesRef.current = mentionables
    onChangeRef.current     = onChange

    function emit(ed: Editor) {
      onChangeRef.current({
        html:      ed.getHTML(),
        mentions:  extractMentions(ed.getJSON()),
        isEmpty:   ed.isEmpty,
        uploading: uploadingRef.current,
      })
    }

    const editor = useEditor({
      immediatelyRender: false,
      autofocus: autoFocus ? 'end' : false,
      editable: !disabled,
      extensions: [
        StarterKit.configure({ heading: false, horizontalRule: false }),
        Placeholder.configure({ placeholder }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        }),
        Image,
        Mention.configure({
          HTMLAttributes: { class: 'mention' },
          suggestion: buildMentionSuggestion(() => mentionablesRef.current),
        }),
      ],
      content: initialContent ?? '',
      onCreate: ({ editor: ed }) => emit(ed),
      onUpdate: ({ editor: ed }) => emit(ed),
      editorProps: {
        attributes: { class: 'rich-text' },
        handlePaste: (_view, event) => {
          const images = Array.from(event.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'))
          if (images.length === 0) return false
          event.preventDefault()
          void insertImages(images)
          return true
        },
        handleDrop: (_view, event) => {
          const images = Array.from(event.dataTransfer?.files ?? []).filter(f => f.type.startsWith('image/'))
          if (images.length === 0) return false
          event.preventDefault()
          void insertImages(images)
          return true
        },
      },
    })

    const editorRef = useRef(editor)
    editorRef.current = editor

    useEffect(() => {
      editor?.setEditable(!disabled)
    }, [editor, disabled])

    useImperativeHandle(ref, () => ({
      clear: () => { editorRef.current?.commands.clearContent(true) },
    }), [])

    function setUploadingState(value: boolean) {
      uploadingRef.current = value
      setUploading(value)
      if (editorRef.current) emit(editorRef.current)
    }

    async function insertImages(files: File[]) {
      setUploadingState(true)
      try {
        for (const file of files) {
          const url = await uploadImage(file, uploadPrefix)
          if (url) editorRef.current?.chain().focus().setImage({ src: url }).run()
        }
      } finally {
        setUploadingState(false)
      }
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
      const files = Array.from(e.target.files ?? [])
      e.target.value = ''
      if (files.length > 0) void insertImages(files)
    }

    if (!editor) return null

    return (
      <div className="comment-editor bg-bg-surface-3 border border-subtle rounded-md focus-within:border-brand transition-colors">
        <Toolbar
          editor={editor}
          onAttach={() => fileInputRef.current?.click()}
          uploading={uploading}
          disabled={disabled}
        />

        <EditorContent
          editor={editor}
          className={contentClassName}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && onSubmitShortcut) {
              e.preventDefault()
              onSubmitShortcut()
            }
            if (e.key === 'Escape' && onEscape) {
              // Keep Escape from bubbling to a surrounding modal's document
              // listener — it should cancel the edit, not close the modal.
              e.stopPropagation()
              onEscape()
            }
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

        {footer}
      </div>
    )
  },
)
