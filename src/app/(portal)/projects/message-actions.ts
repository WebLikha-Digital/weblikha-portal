'use server'
/**
 * MESSAGE BOARD SERVER ACTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Authorisation lives in migrations 020/021 (RLS + triggers). These actions:
 *
 *   1. Check row counts on update/delete — an RLS USING mismatch returns zero
 *      rows WITHOUT an error.
 *   2. Deliver push and email for exactly the notification rows the triggers
 *      created. now() is fixed for a transaction, so those rows' created_at
 *      equals the message's created_at (insert) or updated_at (update). The
 *      timestamp is read back from the database, never the app server clock.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Resend } from 'resend'
import { sendPushToUsers } from '@/lib/push'
import { getSiteUrl } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  messageDraftError, normalizeMentions, type MessageDraft,
} from '@/lib/messages'

export async function createMessage(
  projectId: string,
  draft: MessageDraft & { isClientVisible: boolean },
): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const mentions = normalizeMentions(draft.mentions)
  const problem  = messageDraftError({ ...draft, mentions })
  if (problem) throw new Error(problem)

  const { data: profile, error: profileError } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (profileError) console.error('[messages] Failed to read author profile:', profileError)
  const isClient = profile?.role === 'client'

  const { data: inserted, error } = await supabase
    .from('messages')
    .insert({
      project_id:        projectId,
      author_id:         user.id,
      title:             draft.title.trim(),
      body:              draft.bodyHtml,
      mentions,
      category_id:       draft.categoryId,
      // Clients may only post shared. RLS enforces this too.
      is_client_visible: isClient ? true : draft.isClientVisible,
    })
    .select('id, title, created_at')
    .single()

  if (error || !inserted) throw new Error(error?.message ?? 'Could not post the message.')

  await deliverNotifications(inserted.id, inserted.title, projectId, inserted.created_at)

  revalidatePath(`/projects/${projectId}`)
  return inserted.id
}

export async function updateMessage(
  messageId: string,
  projectId: string,
  draft: MessageDraft,
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const mentions = normalizeMentions(draft.mentions)
  const problem  = messageDraftError({ ...draft, mentions })
  if (problem) throw new Error(problem)

  // Visibility is deliberately not a parameter — it is locked after posting.
  const { data, error } = await supabase
    .from('messages')
    .update({
      title:       draft.title.trim(),
      body:        draft.bodyHtml,
      mentions,
      category_id: draft.categoryId,
    })
    .eq('id', messageId)
    .select('id, title, updated_at')

  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row) throw new Error('You can only edit your own messages.')

  await deliverNotifications(row.id, row.title, projectId, row.updated_at)

  revalidatePath(`/projects/${projectId}`)
}

export async function deleteMessage(messageId: string, projectId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('You can only delete your own messages.')

  revalidatePath(`/projects/${projectId}`)
}

// ── Delivery ───────────────────────────────────────────────────────────────────

interface NotificationRow {
  user_id: string
  type:    string
  actor:   { name: string } | null
}

/**
 * Best-effort: never fails the post. Service-role client because notification
 * rows are readable only by their owner.
 */
async function deliverNotifications(
  messageId: string,
  title: string,
  projectId: string,
  writtenAt: string,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('notifications')
      .select('user_id, type, actor:users!notifications_actor_id_fkey(name)')
      .eq('message_id', messageId)
      .eq('created_at', writtenAt)
    if (error) throw error

    const rows      = (data ?? []) as unknown as NotificationRow[]
    const actorName = rows[0]?.actor?.name ?? 'Someone'
    const url       = `/projects/${projectId}?tab=messages&message=${messageId}`

    const clientPostRecipients = rows.filter(r => r.type === 'client_message').map(r => r.user_id)
    const mentionRecipients    = rows.filter(r => r.type === 'message_mention').map(r => r.user_id)

    await sendPushToUsers(clientPostRecipients, {
      title: `New message from ${actorName}`,
      body:  title,
      url,
    })
    await sendPushToUsers(mentionRecipients, {
      title: `${actorName} mentioned you in "${title}"`,
      body:  'Tap to open the message.',
      url,
    })
    await emailMentions(admin, mentionRecipients, actorName, title, url)
  } catch (err) {
    console.error('[messages] Failed to deliver notifications:', err)
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function emailMentions(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
  actorName: string,
  title: string,
  path: string,
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

  const link      = `${getSiteUrl()}${path}`
  const safeActor = escapeHtml(actorName)
  const safeTitle = escapeHtml(title)
  const resend    = new Resend(apiKey)

  const results = await Promise.all(recipients.map(r =>
    resend.emails.send({
      from:    process.env.RESEND_FROM ?? 'Weblikha Portal <onboarding@resend.dev>',
      to:      r.email,
      subject: `${actorName} mentioned you in "${title}"`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#101010;color:#ffffff;border-radius:12px;">
          <h1 style="font-size:18px;margin:0 0 16px;">${safeActor} mentioned you</h1>
          <p style="color:#b3b3b3;line-height:1.6;margin:0 0 24px;">
            You were mentioned in the message
            <strong style="color:#ffffff;">${safeTitle}</strong>.
          </p>
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
