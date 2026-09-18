import 'server-only'
import { Resend } from 'resend'
import { getSiteUrl } from '@/lib/site-url'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * MESSAGE BOARD NOTIFICATION DELIVERY
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared by post and reply Server Actions. Notification ROWS are written by
 * database triggers — the triggers are the single source of truth for who gets
 * notified. These helpers only read those rows back and deliver them.
 *
 * Rows are matched by the timestamp returned from the insert: now() is fixed for
 * a transaction, so the trigger's created_at equals the row's own. Never use the
 * app server's clock.
 *
 * server-only: notification rows are readable solely by their owner, so reading
 * them needs the service-role client, which must never reach the browser.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AdminClient = ReturnType<typeof createAdminClient>

export interface NotificationRow {
  user_id: string
  type:    string
  actor:   { name: string } | null
}

export async function readNotificationRows(
  admin: AdminClient,
  column: 'message_id' | 'reply_id',
  id: string,
  writtenAt: string,
): Promise<NotificationRow[]> {
  const { data, error } = await admin
    .from('notifications')
    .select('user_id, type, actor:users!notifications_actor_id_fkey(name)')
    .eq(column, id)
    .eq('created_at', writtenAt)
  if (error) throw error
  return (data ?? []) as unknown as NotificationRow[]
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Emails the people a trigger decided to notify about a mention.
 *
 * `subject` and `heading` are plain text — this function escapes `heading`
 * before it reaches the HTML. `line` is the opposite: it is inserted as HTML so
 * a caller can bold part of it, which means **the caller must run escapeHtml()
 * over every user-supplied fragment inside it.** Escaping it twice renders
 * `&amp;` to the reader, so do not pre-escape `heading` as well.
 */
export async function emailMentions(
  admin: AdminClient,
  userIds: string[],
  content: {
    subject: string
    heading: string
    line:    string
    path:    string
  },
): Promise<void> {
  if (userIds.length === 0) return
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[messages] RESEND_API_KEY not set — skipping mention emails')
    return
  }

  const { data, error } = await admin.from('users').select('email').in('id', userIds)
  if (error) throw error
  const recipients = (data ?? []) as unknown as { email: string }[]

  const link   = `${getSiteUrl()}${content.path}`
  const resend = new Resend(apiKey)

  const results = await Promise.all(recipients.map(r =>
    resend.emails.send({
      from:    process.env.RESEND_FROM ?? 'Weblikha Portal <onboarding@resend.dev>',
      to:      r.email,
      subject: content.subject,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#101010;color:#ffffff;border-radius:12px;">
          <h1 style="font-size:18px;margin:0 0 16px;">${escapeHtml(content.heading)}</h1>
          <p style="color:#b3b3b3;line-height:1.6;margin:0 0 24px;">${content.line}</p>
          <a href="${link}"
             style="display:inline-block;background:#FDD33C;color:#101010;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">
            Open the message
          </a>
        </div>`,
    }),
  ))
  for (const r of results) {
    if (r.error) console.error('[messages] Resend error:', r.error.message)
  }
}
