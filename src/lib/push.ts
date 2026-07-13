/**
 * WEB PUSH SENDER — SERVER ONLY
 * ─────────────────────────────────────────────────────────────────────────────
 * Fire-and-forget push delivery. Best-effort like mention emails: failures are
 * logged, never thrown — a push problem must never fail the user's action.
 *
 * Reads recipients' subscriptions with the service-role admin client because
 * push_subscriptions RLS is owner-only (the acting user can't read the
 * recipient's rows, by design). 404/410 from the push service means the
 * browser unsubscribed → the row is deleted, so the table self-cleans.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import 'server-only'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

export interface PushPayload {
  title: string
  body:  string
  url:   string
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  const targets = Array.from(new Set(userIds))
  if (targets.length === 0) return

  const publicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject    = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) {
    console.warn('[push] VAPID env vars not set — skipping push notifications')
    return
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)

    const admin = createAdminClient()
    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', targets)
    if (error) {
      console.error('[push] Failed to load subscriptions:', error.message)
      return
    }
    if (!subs || subs.length === 0) return

    await Promise.all(subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        )
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // Browser unsubscribed — prune the dead subscription
          await admin.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          console.error('[push] Send failed:', err)
        }
      }
    }))
  } catch (err) {
    console.error('[push] Unexpected push failure:', err)
  }
}
