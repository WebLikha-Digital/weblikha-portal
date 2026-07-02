'use client'
/**
 * COMMENT BODY
 * Renders a comment's rich-text HTML safely (DOMPurify-sanitized).
 * Legacy comments from before rich text are plain strings — rendered as-is.
 */
import DOMPurify from 'dompurify'

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 's', 'u', 'a', 'ul', 'ol', 'li',
    'img', 'span', 'code', 'pre', 'blockquote',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'data-type', 'data-id', 'data-label'],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):|^\//i,
}

interface CommentBodyProps {
  body: string
}

export function CommentBody({ body }: CommentBodyProps) {
  const isHtml = body.trimStart().startsWith('<')

  if (!isHtml) {
    return (
      <p className="text-xs text-secondary leading-relaxed whitespace-pre-wrap break-words">
        {body}
      </p>
    )
  }

  const clean = DOMPurify.sanitize(body, SANITIZE_CONFIG)

  return (
    <div
      className="rich-text text-xs text-secondary leading-relaxed break-words"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
