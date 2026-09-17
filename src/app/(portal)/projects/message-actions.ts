'use server'
/**
 * MESSAGE BOARD SERVER ACTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Authorisation lives in migration 020's RLS and triggers — these actions do not
 * duplicate it. Two things they must still do:
 *
 *   1. Row-count checks on update/delete. An RLS USING mismatch returns zero
 *      rows WITHOUT an error (only WITH CHECK violations raise), so an
 *      unauthorised edit would otherwise "succeed" and silently revert.
 *   2. Push for client posts. In-app notifications are created by the
 *      notify_client_message trigger; this reads the rows it created and pushes
 *      to exactly those users, so in-app and push recipients cannot drift.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sendPushToUsers } from '@/lib/push'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { messageDraftError, type MessageDraft } from '@/lib/messages'

export async function createMessage(
  projectId: string,
  draft: MessageDraft & { isClientVisible: boolean },
): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const problem = messageDraftError(draft)
  if (problem) throw new Error(problem)

  const { data: profile } = await supabase
    .from('users').select('role, name').eq('id', user.id).single()
  const isClient = profile?.role === 'client'

  const { data: inserted, error } = await supabase
    .from('messages')
    .insert({
      project_id:        projectId,
      author_id:         user.id,
      title:             draft.title.trim(),
      body:              draft.body.trim(),
      // Clients may only post shared. RLS enforces this too; forcing it here
      // turns a would-be policy violation into the intended outcome.
      is_client_visible: isClient ? true : draft.isClientVisible,
    })
    .select('id, title')
    .single()

  if (error || !inserted) throw new Error(error?.message ?? 'Could not post the message.')

  if (isClient) {
    await pushClientMessage(inserted.id, inserted.title, projectId, profile?.name ?? 'A client')
  }

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

  const problem = messageDraftError(draft)
  if (problem) throw new Error(problem)

  // Visibility is deliberately not a parameter — it is locked after posting.
  const { data, error } = await supabase
    .from('messages')
    .update({ title: draft.title.trim(), body: draft.body.trim() })
    .eq('id', messageId)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new Error('You can only edit your own messages.')

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

/**
 * Best-effort: a push failure never fails the post. Uses the service-role client
 * because notification rows are readable only by their owner.
 */
async function pushClientMessage(
  messageId: string,
  title: string,
  projectId: string,
  clientName: string,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: rows, error } = await admin
      .from('notifications')
      .select('user_id')
      .eq('message_id', messageId)
    if (error) throw error

    const userIds = (rows ?? []).map((r: { user_id: string }) => r.user_id)
    await sendPushToUsers(userIds, {
      title: `New message from ${clientName}`,
      body:  title,
      url:   `/projects/${projectId}?tab=messages&message=${messageId}`,
    })
  } catch (err) {
    console.error('[push] Failed to notify team of client message:', err)
  }
}
