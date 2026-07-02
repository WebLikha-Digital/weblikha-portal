import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TeamTabs } from '@/components/modules/team/TeamTabs'
import type { User, PerformancePeriod } from '@/types'

export const metadata: Metadata = { title: 'Team Performance' }

interface Props {
  searchParams: Promise<{ month?: string; year?: string }>
}

export default async function TeamPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', authUser!.id).single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const params = await searchParams
  const now    = new Date()
  const month  = Number(params.month ?? now.getMonth() + 1)
  const year   = Number(params.year  ?? now.getFullYear())

  // All approved providers
  const { data: providers } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'provider')
    .eq('approved', true)
    .order('name', { ascending: true })

  const providerList = (providers ?? []) as User[]
  const providerIds  = providerList.map(u => u.id)

  // Performance rows for this period
  const { data: periods } = await supabase
    .from('performance_periods')
    .select('*')
    .eq('period_month', month)
    .eq('period_year', year)

  // Project membership stats — count active / completed per provider
  type MembershipRow = { user_id: string; project: { status: string } | null }
  let memberships: MembershipRow[] = []

  if (providerIds.length > 0) {
    const { data } = await supabase
      .from('project_members')
      .select('user_id, project:projects(status)')
      .in('user_id', providerIds)
    // Supabase's generated join type is loosely inferred (array vs to-one);
    // at runtime `project` is a single object or null.
    memberships = (data ?? []) as unknown as MembershipRow[]
  }

  // Aggregate stats per provider
  const ACTIVE_STATUSES = new Set(['discovery', 'in_progress', 'review'])
  const projectStats = providerList.map(u => {
    const rows      = memberships.filter(m => m.user_id === u.id)
    const active    = rows.filter(m => m.project && ACTIVE_STATUSES.has(m.project.status)).length
    const completed = rows.filter(m => m.project?.status === 'completed').length
    return { userId: u.id, active, completed, total: rows.length }
  })

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold text-primary">Team</h1>
        <p className="text-sm text-secondary mt-1">
          Leaderboard and member directory. Click a type badge to toggle in-house / outsource.
        </p>
      </div>

      <TeamTabs
        providers={providerList}
        pe