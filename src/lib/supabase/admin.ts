/**
 * SUPABASE ADMIN CLIENT (SERVICE ROLE) — SERVER ONLY
 * ─────────────────────────────────────────────────────────────────────────────
 * Bypasses Row Level Security. Use ONLY in Server Actions, Route Handlers, and
 * admin-guarded Server Components, and only for operations that genuinely
 * cannot be done as the signed-in user.
 *
 * Every caller must check authorisation itself first — this client will happily
 * do anything it is asked.
 *
 * Current consumers:
 *   - src/lib/push.ts — reading push subscriptions for OTHER users (owner-only
 *     RLS correctly blocks the acting user's session client from seeing
 *     recipients' subscription keys).
 *   - (portal)/clients/actions.ts — inviting an auth user and promoting them to
 *     the `client` role, which must happen before they ever log in.
 *   - (portal)/clients/setup-state.ts — reading auth.users.last_sign_in_at to
 *     tell an unclicked invite apart from a live account.
 *
 * TWO GUARDS, deliberately belt-and-braces:
 *   1. `import 'server-only'` turns any client-bundle import into a BUILD error.
 *   2. The runtime `typeof window` check below is a backstop for anything that
 *      slips past the bundler.
 * Neither substitutes for keeping the import graph clean.
 *
 * USAGE (Server Action):
 *   import { createAdminClient } from '@/lib/supabase/admin'
 *   const admin = createAdminClient()
 *   await admin.auth.admin.inviteUserByEmail(email)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import 'server-only'
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
      'SUPABASE_SERVICE_ROLE_KEY is not set — client invites and push delivery cannot work without it. Add it to .env.local (and to Vercel for production).',
    )
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession:   false,
    },
  })
}
