/**
 * SUPABASE BROWSER CLIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Use this in Client Components ('use client') and hooks.
 * It reads/writes the session cookie automatically via @supabase/ssr.
 *
 * USAGE:
 *   import { createClient } from '@/lib/supabase/client'
 *   const supabase = createClient()
 *   const { data } = await supabase.from('projects').select('*')
 *
 * NOTE: Never import the server client here — it uses Node.js APIs
 *       that aren't available in the browser bundle.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
