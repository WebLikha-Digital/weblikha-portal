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
import { sendPushToUsers } from '@/lib/push'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { emailMentions, escapeHtml, readNotificationRows } from '@/lib/message-delivery'
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
  if (!row) {
    // Zero rows means the RLS USING clause did not match — either it is not
    // yours, or the editing window has closed. Read it back to say which.
    const { data: existing } = await supabase
      .from('messages')
      .select('author_id')
      .eq('id', messageId)
      .maybeSingle()
    throw new Error(
      existing && existing.author_id === user.id
        ? 'The editing window has closed.'
        : 'You can only edit your own messages.',
    )
  }

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
    const rows  = await readNotificationRows(admin, 'message_id', messageId, writtenAt)

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
    await emailMentions(admin, mentionRecipients, {
      subject: `${actorName} mentioned you in "${title}"`,
      heading: `${actorName} mentioned you`,
      line:    `You were mentioned in the message <strong style="color:#ffffff;">${escapeHtml(title)}</strong>.`,
      path:    url,
    })
  } catch (err) {
    console.error('[messages] Failed to deliver notifications:', err)
  }
}
