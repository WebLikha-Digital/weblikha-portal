/**
 * SUPABASE ADMIN CLIENT — SERVER ONLY
 * ─────────────────────────────────────────────────────────────────────────────
 * Service-role client that bypasses RLS. Import ONLY from server-side modules
 * (the `server-only` import makes any client-bundle import a build error).
 *
 * Current sole consumer: src/lib/push.ts — reading push subscriptions for
 * OTHER users (owner-only RLS correctly blocks the acting user's session
 * client from seeing recipients' subscription keys).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.')
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
