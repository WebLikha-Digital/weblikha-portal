'use client'
/**
 * COMMENT BODY — renders a task comment through the shared RichTextBody.
 */
import { RichTextBody } from '@/components/modules/editor/RichTextBody'

interface CommentBodyProps {
  body: string
}

export function CommentBody({ body }: CommentBodyProps) {
  return <RichTextBody body={body} size="xs" />
}
