'use server'
/**
 * SHELL-LEVEL SERVER ACTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Actions used by PortalShell chrome (NotificationsBell) rather than a single
 * route. Push subscription rows are owner-scoped by RLS, so these stay thin.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function savePushSubscription(sub: {
  endpoint:   string
  p256dh:     string
  auth:       string
  userAgent?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // endpoint is globally unique. If another account on this same browser
  // profile previously subscribed, the conflict-update targets a row this
  // user's RLS can't touch and the upsert errors — surfaced as the enable
  // toast failing. Intentional: RLS stays the boundary; shared-device
  // endpoint takeover is not supported.
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id:    user.id,
        endpoint:   sub.endpoint,
        p256dh:     sub.p256dh,
        auth:       sub.auth,
        user_agent: sub.userAgent ?? null,
      },
      { onConflict: 'endpoint' },
    )
  if (error) throw new Error(error.message)
}

export async function deletePushSubscription(endpoint: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS delete policy already scopes to own rows
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
  if (error) throw new Error(error.message)
}
