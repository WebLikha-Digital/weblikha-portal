/**
 * PORTAL LAYOUT (authenticated shell)
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps all authenticated pages with the Sidebar.
 * Redirects to /login if there's no active session.
 *
 * Route group (portal) keeps this layout isolated from /login,
 * so the login page gets no sidebar.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PortalShell } from '@/components/layout/PortalShell'
import { EDIT_WINDOW_DEFAULT_MINUTES } from '@/lib/messages'
import type { User } from '@/types'

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  // Verify auth session — getUser() hits the Supabase server (not just the cookie)
  // which makes it tamper-proof and the recommended auth check pattern.
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

  if (authError || !authUser) {
    redirect('/login')
  }

  // Fetch the user's profile row
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single()

  if (!profile) {
    // Profile row missing — account setup incomplete
    redirect('/login?error=profile_missing')
  }

  // Approval gate — admins always pass, providers/clients must be approved
  if (profile.role !== 'admin' && !profile.approved) {
    redirect('/pending')
  }

  const user = profile as User

  // Agency-wide editing window (023). Non-essential to rendering: if it cannot
  // be read, fall back to the default rather than failing every page. The
  // database enforces the real rule either way.
  const { data: settings, error: settingsError } = await supabase
    .from('app_settings')
    .select('edit_window_minutes')
    .eq('id', 1)
    .maybeSingle()
  if (settingsError) {
    console.error('[portal] app_settings fetch failed — using the default window:', settingsError)
  }
  const editWindowMinutes = settings?.edit_window_minutes ?? EDIT_WINDOW_DEFAULT_MINUTES

  return (
    <PortalShell user={user} editWindowMinutes={editWindowMinutes}>
      {children}
    </PortalShell>
  )
}
