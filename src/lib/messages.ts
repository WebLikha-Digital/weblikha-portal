/**
 * MESSAGE BOARD — SHARED RULES
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure helpers used by the Server Actions and the compose modal, so the client
 * validates with exactly the rules the server enforces. Production Next.js
 * redacts thrown Server Action messages, so anything a person can fix must be
 * caught client-side with these first. The numeric limits mirror database
 * checks in migrations 020 and 021 — change them together.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const MESSAGE_TITLE_MAX    = 200
export const MESSAGE_BODY_MAX     = 20_000
export const MESSAGE_MENTIONS_MAX = 50
export const CATEGORY_NAME_MAX    = 40
export const CATEGORY_EMOJI_MAX   = 16

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface MessageDraft {
  title:      string
  bodyHtml:   string
  mentions:   string[]
  categoryId: string | null
}

/** Editor output always starts with a tag; anything else is legacy plain text. */
function isHtml(body: string): boolean {
  return body.trimStart().startsWith('<')
}

/** Visible text of a body — tags stripped, common entities decoded, whitespace collapsed. */
export function htmlToText(body: string): string {
  if (!isHtml(body)) return body.replace(/\s+/g, ' ').trim()
  return body
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|li|blockquote|pre)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function isBodyEmpty(body: string): boolean {
  return htmlToText(body).length === 0 && !/<img\b/i.test(body)
}

export function normalizeMentions(ids: string[]): string[] {
  return Array.from(new Set(ids))
}

/** Returns a human-readable problem, or null when the draft is valid. */
export function messageDraftError(draft: MessageDraft): string | null {
  const title = draft.title.trim()
  if (!title) return 'Give the message a title.'
  if (title.length > MESSAGE_TITLE_MAX) return `Titles can be at most ${MESSAGE_TITLE_MAX} characters.`
  if (isBodyEmpty(draft.bodyHtml)) return 'Write something in the message.'
  if (draft.bodyHtml.length > MESSAGE_BODY_MAX) {
    return 'This message is too long. Shorten it or remove some formatting.'
  }
  if (draft.mentions.length > MESSAGE_MENTIONS_MAX) {
    return `You can mention at most ${MESSAGE_MENTIONS_MAX} people.`
  }
  if (!draft.mentions.every(id => UUID_RE.test(id))) return 'A mention in this message is invalid.'
  if (draft.categoryId !== null && !UUID_RE.test(draft.categoryId)) return 'That category is invalid.'
  return null
}

export function categoryDraftError({ name, emoji }: { name: string; emoji: string }): string | null {
  const n = name.trim()
  const e = emoji.trim()
  if (!n) return 'Give the category a name.'
  if (n.length > CATEGORY_NAME_MAX) return `Category names can be at most ${CATEGORY_NAME_MAX} characters.`
  if (!e) return 'Pick an emoji for the category.'
  if (e.length > CATEGORY_EMOJI_MAX) return 'Use a single emoji.'
  return null
}

/** Plain-text preview for message cards. */
export function messageExcerpt(body: string, max = 240): string {
  const text = htmlToText(body)
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

/** Converts a legacy plain-text body into editor HTML so it can be edited. */
export function plainTextToHtml(text: string): string {
  if (isHtml(text)) return text
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return text
    .split(/\r?\n/)
    .map(line => `<p>${escape(line)}</p>`)
    .join('')
}

/** updated_at equals created_at on insert; migration 002's trigger bumps it on every update. */
export function isEdited(message: { created_at: string; updated_at: string }): boolean {
  return new Date(message.updated_at).getTime() > new Date(message.created_at).getTime()
}
