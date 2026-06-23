/**
 * DASHBOARD PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Eagle's-eye view of the agency — KPIs, project list, quick stats.
 * This is a Server Component: data is fetched on the server, no loading states.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { StatCard } from '@/components/ui'
import { formatPeso, percent } from '@/lib/utils'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()

  // Fetch projects
  const { data: projects } = await supabase
    .from('projects')
    .select('*, revenue_entries(*), project_members(*, user:users(*))')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })

  const activeProjects = projects ?? []
  const onTrackCount   = activeProjects.filter(p => p.status === 'in_progress').length
  const atRiskCount    = 0 // TODO: derive from deadline logic

  // Revenue this month
  const now     = new Date()
  const entries = activeProjects.flatMap(p => p.revenue_entries ?? [])
  const revenueThisMonth = entries
    .filter(e => {
      const d = new Date(e.date)
      return e.type === 'income' &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
    })
    .reduce((sum, e) => sum + e.amount, 0)

  // Team count
  const { count: teamCount } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl">Dashboard</h1>
        <p className="mt-1 text-xs text-secondary">
          {new Date().toLocaleDateString('en-PH', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Active Projects"
          value={activeProjects.length}
          trend="this month"
        />
        <StatCard
          label="Revenue (this month)"
          value={formatPeso(revenueThisMonth)}
          valueColor="brand"
          trendUp
        />
        <StatCard
          label="Team Members"
          value={teamCount ?? 0}
        />
        <StatCard
          label="On Track"
          value={`${percent(onTrackCount, activeProjects.length)}%`}
          valueColor="brand"
          trend={atRiskCount > 0 ? `${atRiskCount} at risk` : undefined}
          trendUp={atRiskCount === 0}
        />
      </div>

      {/* Projects table — placeholder for the ProjectsTable component */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <h2 className="text-md font-medium">All Projects</h2>
        </div>
        <p className="p-4 text-sm text-secondary">
          {/* ProjectsTable component will go here */}
          {activeProjects.length === 0
            ? 'No active projects. Create your first one!'
            : `${activeProjects.length} projects loaded. Add ProjectsTable component.`}
        </p>
      </div>
    </div>
  )
}
