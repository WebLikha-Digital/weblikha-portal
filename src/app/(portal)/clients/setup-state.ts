/**
 * CLIENT SETUP STATE (SERVICE ROLE READ)
 * ─────────────────────────────────────────────────────────────────────────────
 * Answers "has this client ever signed in?" — the signal that separates an
 * invite nobody clicked from a live account. `last_sign_in_at` becomes non-null
 * the moment the invite link is exchanged at /auth/confirm.
 *
 * WHY THIS IS NOT IN actions.ts: every export in a 'use server' file becomes a
 * callable RPC endpoint. This helper is not something the browser should be
 * able to invoke, so it lives in a plain module imported only by page.tsx.
 *
 * There is no `server-only` package in this repo to enforce that at compile
 * time. Two runtime guards stand in: createAdminClient() throws if called in
 * the browser, and it reads SUPABASE_SERVICE_ROLE_KEY, which has no
 * NEXT_PUBLIC_ prefix and is therefore undefined in a client bundle.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Maps each user id to its `last_sign_in_at`, or null if they have never
 * signed in — or if the lookup failed. Degrading a failed lookup to null is
 * deliberate: it surfaces as "Invite pending", which prompts the admin to
 * resend. The opposite default would quietly claim an account is live.
 */
export async function fetchClientSetupState(
  userIds: string[],
): Promise<Map<string, string | null>> {
  if (userIds.length === 0) return new Map()

  const admin = createAdminClient()

  const entries = await Promise.all(
    userIds.map(async (id): Promise<readonly [string, string | null]> => {
      const { data, error } = await admin.auth.admin.getUserById(id)
      if (error || !data.user) return [id, null] as const
      return [id, data.user.last_sign_in_at ?? null] as const
    }),
  )

  return new Map(entries)
}
