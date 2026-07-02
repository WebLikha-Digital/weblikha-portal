/**
 * DASHBOARD PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Role-aware: admins see agency-wide KPIs; providers see their own work summary.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { StatCard } from '@/components/ui'
import { formatPeso, percent } from '@/lib/utils'
import Link from 'next/link'
import { Badge } from '@/components/ui'
import type { ProjectStatus } from '@/types'

export const metadata: Metadata = { title: 'Dashboard' }

const dateLabel = new Date().toLocaleDateString('en-PH', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
})

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user: authUser } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser!.id)
    .single()

  if (profile?.role === 'admin') {
    return <AdminDashboard supabase={supabase} />
  }

  return <ProviderDashboard supabase={supabase} userId={authUser!.id} userName={profile?.name ?? ''} />
}

// ── Admin Dashboard ────────────────────────────────────────────────────────────

async function AdminDashboard({ supabase }: { supabase: Awaited<ReturnType<typeof createClient>> }) {
  const { data: projects } = await supabase
    .from('projects')
    .select('*, revenue_entries(*), project_members(user_id)')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })

  const list = projects ?? []
  const now  = new Date()

  const revenueThisMonth = list
    .flatMap(p => p.revenue_entries ?? [])
    .filter((e: { type: string; date: string }) => {
      const d = new Date(e.date)
      return e.type === 'income' && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    })
    .reduce((sum: number, e: { amount: number }) => sum + e.amount, 0)

  const { count: teamCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('approved', true)
    .neq('role', 'admin')

  const onTrack = list.filter(p => p.status === 'in_progress').length

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold">Dashboard</h1>
        <p className="mt-1 text-xs text-secondary">{dateLabel}</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active Projects"     value={list.length}                          trend="this month" />
        <StatCard label="Revenue (this month)" value={formatPeso(revenueThisMonth)}         valueColor="brand" trendUp />
        <StatCard label="Team Members"         value={teamCount ?? 0} />
        <StatCard label="On Track"             value={`${percent(onTrack, list.length)}%`} valueColor="brand" trendUp={onTrack === list.length} />
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <h2 className="text-sm font-medium text-primary">All Projects</h2>
          <Link href="/projects" className="text-xs text-brand hover:underline">View all</Link>
        </div>
        {list.length === 0 ? (
          <p className="p-6 text-sm text-secondary text-center">No active projects.</p>
        ) : (
          <ul>
            {list.slice(0, 6).map((p: { id: string; name: string; client_name: string; status: string; end_date: string }) => (
              <li key={p.id} className="border-b border-subtle last:border-b-0">
                <Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg-surface-2 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{p.name}</p>
                    <p className="text-2xs text-secondary truncate">{p.client_name}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-2xs text-tertiary">Due {new Date(p.end_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <Badge status={p.status as ProjectStatus} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Provider Dashboard ─────────────────────────────────────────────────────────

async function ProviderDashboard({
  supabase,
  userId,
  userName,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  userId:   string
  userName: string
}) {
  const now = new Date()

  // Projects assigned to this provider — two-step to avoid RLS join issues
  const { data: memberRows } = await supabase
    .from('project_members')
    .select('project_id')
    .eq('user_id', userId)

  const projectIds = (memberRows ?? []).map((r: { project_id: string }) => r.project_id)

  type ProjectRow = { id: string; name: string; client_name: string; status: string; end_date: string }
  let allProjects: ProjectRow[] = []

  if (projectIds.length > 0) {
    const { data } = await supabase
      .from('projects')
      .select('id, name, client_name, status, end_date')
      .in('id', projectIds)
      .order('created_at', { ascending: false })
    allProjects = (data ?? []) as ProjectRow[]
  }

  const activeProjs    = allProjects.filter(p => ['in_progress', 'discovery', 'review'].includes(p.status))
  const completedProjs = allProjects.filter(p => p.status === 'completed')

  // Tasks assigned to this provider
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, project:projects(name)')
    .eq('assignee_id', userId)
    .neq('status', 'done')
    .order('due_date', { ascending: true })
    .limit(5)

  // Points this month
  const { data: perf } = await supabase
    .from('performance_periods')
    .select('total_points')
    .eq('user_id', userId)
    .eq('period_month', now.getMonth() + 1)
    .eq('period_year', now.getFullYear())
    .single()

  const points = perf?.total_points ?? 0

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold">Welcome, {userName.split(' ')[0]}</h1>
        <p className="mt-1 text-xs text-secondary">{dateLabel}</p>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Assigned Projects"   value={activeProjs.length} />
        <StatCard label="Completed Projects"  value={completedProjs.length} valueColor="success" />
        <StatCard label="Open Tasks"          value={(tasks ?? []).length} />
        <StatCard label="Points This Month"   value={points} valueColor={points >= 1000 ? 'success' : 'brand'} trend="/ 1,000 goal" />
      </div>

      {/* Assigned projects */}
      <div className="card overflow-hidden mb-4">
        <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <h2 className="text-sm font-medium text-primary">My Projects</h2>
          <Link href="/projects" className="text-xs text-brand hover:underline">View all</Link>
        </div>
        {activeProjs.length === 0 ? (
          <p className="p-6 text-sm text-secondary text-center">No active projects assigned yet.</p>
        ) : (
          <ul>
            {activeProjs.map((p: { id: string; name: string; client_name: string; status: string; end_date: string }) => (
              <li key={p.id} className="border-b border-subtle last:border-b-0">
                <Link href={`/projects/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-bg-surface-2 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{p.name}</p>
                    <p className="text-2xs text-secondary truncate">{p.client_name}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-2xs text-tertiary">Due {new Date(p.end_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    <Badge status={p.status as ProjectStatus} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tasks due soon */}
      <div className="card overflow-hidden">
        <div className="border-b border-subtle px-4 py-3">
          <h2 className="text-sm font-medium text-primary">Tasks due soon</h2>
        </div>
        {(tasks ?? []).length === 0 ? (
          <p className="p-6 text-sm text-secondary text-center">No open tasks — you&apos;re all caught up!</p>
        ) : (
          <ul>
            {(tasks ?? []).map((t: { id: string; title: string; due_date: string; project: { name: string } | null }) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-subtle last:border-b-0">
                <div className="min-w-0">
                  <p className="text-sm text-primary truncate">{t.title}</p>
                  <p className="text-2xs text-secondary truncate">{t.project?.name}</p>
                </div>
                <span className="text-2xs text-tertiary shrink-0 whitespace-nowrap">
                  {new Date(t.due_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
