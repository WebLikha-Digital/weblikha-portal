/**
 * MESSAGE BOARD — SHARED RULES
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure helpers used by both the Server Actions and the compose modal, so the
 * client validates with exactly the rules the server enforces. In production
 * Next.js redacts the text of errors thrown by Server Actions, so anything a
 * person can fix has to be caught client-side with these first.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const MESSAGE_TITLE_MAX = 200
export const MESSAGE_BODY_MAX  = 10_000

export interface MessageDraft {
  title: string
  body:  string
}

/** Returns a human-readable problem, or null when the draft is valid. */
export function messageDraftError({ title, body }: MessageDraft): string | null {
  const t = title.trim()
  const b = body.trim()
  if (!t) return 'Give the message a title.'
  if (t.length > MESSAGE_TITLE_MAX) return `Titles can be at most ${MESSAGE_TITLE_MAX} characters.`
  if (!b) return 'Write something in the message.'
  if (b.length > MESSAGE_BODY_MAX) return `Messages can be at most ${MESSAGE_BODY_MAX.toLocaleString()} characters.`
  return null
}

/** updated_at equals created_at on insert; migration 002's trigger bumps it on every update. */
export function isEdited(message: { created_at: string; updated_at: string }): boolean {
  return new Date(message.updated_at).getTime() > new Date(message.created_at).getTime()
}
