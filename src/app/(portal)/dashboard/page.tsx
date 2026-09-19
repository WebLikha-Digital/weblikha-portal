/**
 * DASHBOARD PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * A role router, nothing more. Each role's dashboard is a separate component
 * under components/modules/dashboard/ — three unrelated screens in one file was
 * the thing that made this page hard to work in.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminDashboard } from '@/components/modules/dashboard/AdminDashboard'
import { ProviderDashboard } from '@/components/modules/dashboard/ProviderDashboard'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('id, name, role')
    .eq('id', authUser.id)
    .single()

  if (!profile) redirect('/login?error=profile_missing')

  if (profile.role === 'admin') {
    return <AdminDashboard supabase={supabase} />
  }

  return (
    <ProviderDashboard
      supabase={supabase}
      userId={profile.id}
      userName={profile.name ?? ''}
    />
  )
}
