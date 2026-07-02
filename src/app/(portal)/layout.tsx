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

  return <PortalShell user={user}>{children}</PortalShell>
}
