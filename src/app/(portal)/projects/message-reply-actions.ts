'use server'
/**
 * MESSAGE REPLY SERVER ACTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Authorisation lives in migration 022: every reply policy is written in terms
 * of can_read_message(), so reading a post and replying to it are the same test.
 *
 * As with posts, update and delete check the returned row count — an RLS USING
 * mismatch returns zero rows WITHOUT an error.
 *
 * Only an insert notifies. Editing a reply notifies nobody, including for a
 * newly added mention: the triggers fire on insert only.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sendPushToUsers } from '@/lib/push'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { emailMentions, escapeHtml, readNotificationRows } from '@/lib/message-delivery'
import { normalizeMentions, replyDraftError, type ReplyDraft } from '@/lib/messages'

export async function createReply(
  messageId: string,
  projectId: string,
  draft: ReplyDraft,
): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const mentions = normalizeMentions(draft.mentions)
  const problem  = replyDraftError({ ...draft, mentions })
  if (problem) throw new Error(problem)

  const { data: inserted, error } = await supabase
    .from('message_replies')
    .insert({
      message_id: messageId,
      author_id:  user.id,
      body:       draft.bodyHtml,
      mentions,
    })
    .select('id, created_at')
    .single()

  if (error || !inserted) throw new Error(error?.message ?? 'Could not post the reply.')

  await deliverReplyNotifications(inserted.id, messageId, projectId, inserted.created_at)

  revalidatePath(`/projects/${projectId}`)
  return inserted.id
}

export async function updateReply(
  replyId: string,
  projectId: string,
  draft: ReplyDraft,
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const mentions = normalizeMentions(draft.mentions)
  const problem  = replyDraftError({ ...draft, mentions })
  if (problem) throw new Error(problem)

  const { data, error } = await supabase
    .from('message_replies')
    .update({ body: draft.bodyHtml, mentions })
    .eq('id', replyId)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('You can only edit your own replies.')

  revalidatePath(`/projects/${projectId}`)
}

export async function deleteReply(replyId: string, projectId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('message_replies')
    .delete()
    .eq('id', replyId)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('You can only delete your own replies.')

  revalidatePath(`/projects/${projectId}`)
}

/** Best-effort: never fails the reply. */
async function deliverReplyNotifications(
  replyId: string,
  messageId: string,
  projectId: string,
  writtenAt: string,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const rows  = await readNotificationRows(admin, 'reply_id', replyId, writtenAt)
    if (rows.length === 0) return

    const { data: post } = await admin
      .from('messages').select('title').eq('id', messageId).single()
    const title     = post?.title ?? 'a message'
    const actorName = rows[0]?.actor?.name ?? 'Someone'
    const url       = `/projects/${projectId}?tab=messages&message=${messageId}`

    const threadRecipients  = rows.filter(r => r.type === 'message_reply').map(r => r.user_id)
    const mentionRecipients = rows.filter(r => r.type === 'message_mention').map(r => r.user_id)

    await sendPushToUsers(threadRecipients, {
      title: `${actorName} replied to "${title}"`,
      body:  'Tap to open the thread.',
      url,
    })
    await sendPushToUsers(mentionRecipients, {
      title: `${actorName} mentioned you in "${title}"`,
      body:  'Tap to open the message.',
      url,
    })
    await emailMentions(admin, mentionRecipients, {
      actorName,
      subject: `${actorName} mentioned you in "${title}"`,
      heading: `${actorName} mentioned you`,
      line:    `You were mentioned in a reply on <strong style="color:#ffffff;">${escapeHtml(title)}</strong>.`,
      path:    url,
    })
  } catch (err) {
    console.error('[messages] Failed to deliver reply notifications:', err)
  }
}
