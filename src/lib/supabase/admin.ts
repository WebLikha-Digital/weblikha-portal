/**
 * SUPABASE ADMIN CLIENT (SERVICE ROLE)
 * ─────────────────────────────────────────────────────────────────────────────
 * Bypasses Row Level Security. Use ONLY in Server Actions and Route Handlers,
 * and only for operations that genuinely cannot be done as the signed-in user:
 * inviting an auth user, and promoting that user to the `client` role.
 *
 * Every caller must check `is_admin` itself first — this client will happily
 * do anything it is asked.
 *
 * NEVER import this from a 'use client' component. The runtime guard below is
 * a backstop, not a substitute for keeping the import graph clean.
 *
 * USAGE (Server Action):
 *   import { createAdminClient } from '@/lib/supabase/admin'
 *   const admin = createAdminClient()
 *   await admin.auth.admin.inviteUserByEmail(email)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error(
      'createAdminClient() was called in the browser. The service role key bypasses RLS and must never reach the client bundle.',
    )
  }

  const url            = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.')
  }
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — client invites cannot be sent without it. Add it to .env.local (and to Vercel for production).',
    )
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  })
}
