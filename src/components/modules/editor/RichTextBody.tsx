'use client'
/**
 * RICH TEXT BODY — sanitised renderer shared by comments and messages
 * ─────────────────────────────────────────────────────────────────────────────
 * Editor output always starts with an HTML tag. Anything that doesn't is a
 * legacy plain-text body (comments before rich text, messages before 021) and
 * renders as text with line breaks preserved — never as HTML.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 's', 'u', 'a', 'ul', 'ol', 'li',
    'img', 'span', 'code', 'pre', 'blockquote',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'data-type', 'data-id', 'data-label'],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):|^\//i,
}

interface RichTextBodyProps {
  body:  string
  size?: 'xs' | 'sm' | undefined
}

export function RichTextBody({ body, size = 'xs' }: RichTextBodyProps) {
  const textClass = size === 'sm' ? 'text-sm text-primary' : 'text-xs text-secondary'

  if (!body.trimStart().startsWith('<')) {
    return (
      <p className={cn(textClass, 'leading-relaxed whitespace-pre-wrap break-words')}>
        {body}
      </p>
    )
  }

  const clean = DOMPurify.sanitize(body, SANITIZE_CONFIG)

  return (
    <div
      className={cn('rich-text', textClass, 'leading-relaxed break-words')}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
