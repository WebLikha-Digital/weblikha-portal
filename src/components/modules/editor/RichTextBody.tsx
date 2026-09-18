'use client'
/**
 * RICH TEXT BODY — sanitised renderer shared by comments and messages
 * ─────────────────────────────────────────────────────────────────────────────
 * Editor output always starts with an HTML tag. Anything that doesn't is a
 * legacy plain-text body (comments before rich text, messages before 021) and
 * renders as text with line breaks preserved — never as HTML.
 *
 * SSR renders text only, never sanitized HTML. DOMPurify 3.4.11 has no DOM on
 * the server (`DOMPurify.isSupported` is false there) and `sanitize()` returns
 * its input UNCHANGED in that case (purify.cjs.js:1986) — a deep link such as
 * `?tab=messages&message=<id>` would otherwise server-render raw stored HTML
 * straight into the page before React ever hydrates (stored XSS). So this
 * component renders the plain-text form of the body until it has mounted in
 * the browser, and only then swaps in sanitized HTML.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from 'react'
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'
import { htmlToText } from '@/lib/messages'

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'b', 'em', 'i', 's', 'u', 'a', 'ul', 'ol', 'li',
    'img', 'span', 'code', 'pre', 'blockquote',
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'data-type', 'data-id', 'data-label'],
  // Reject protocol-relative `//host` along with anything but http(s)/mailto
  // and same-origin absolute paths.
  ALLOWED_URI_REGEXP: /^(?:https?|mailto):|^\/(?!\/)/i,
}

// Force every link DOMPurify keeps to open safely, regardless of what the
// editor produced. Registered once, in the browser only — `addHook` mutates
// shared module state on the DOMPurify singleton, and this module can be
// imported by both comments and messages.
let linkSafetyHookRegistered = false
if (typeof window !== 'undefined' && !linkSafetyHookRegistered) {
  linkSafetyHookRegistered = true
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer nofollow')
    }
  })
}

interface RichTextBodyProps {
  body:  string
  size?: 'xs' | 'sm' | undefined
}

export function RichTextBody({ body, size = 'xs' }: RichTextBodyProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const textClass = size === 'sm' ? 'text-sm text-primary' : 'text-xs text-secondary'
  const isHtml     = body.trimStart().startsWith('<')

  if (!isHtml) {
    return (
      <p className={cn(textClass, 'leading-relaxed whitespace-pre-wrap break-words')}>
        {body}
      </p>
    )
  }

  if (!mounted || !DOMPurify.isSupported) {
    return (
      <p className={cn(textClass, 'leading-relaxed whitespace-pre-wrap break-words')}>
        {htmlToText(body)}
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
