/**
 * SUPABASE SERVER CLIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Use this in Server Components, Route Handlers, and Server Actions.
 * Reads the session cookie from Next.js headers — never exposes it to
 * the browser, which prevents session token leakage.
 *
 * USAGE (Server Component):
 *   import { createClient } from '@/lib/supabase/server'
 *   const supabase = await createClient()
 *   const { data: { user } } = await supabase.auth.getUser()
 *
 * IMPORTANT: Call createClient() once per request — do not share
 *            a single instance across requests.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll()           { return cookieStore.getAll() },
        setAll(toSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // setAll is called from Server Components where cookies are read-only.
            // If a middleware is refreshing the session, this error is safe to ignore.
          }
        },
      },
    },
  )
}
