/**
 * Moved verbatim from src/app/(portal)/dashboard/page.tsx in this change — same
 * queries, same JSX, same helper values. Nothing else changed.
 */
import { createClient } from '@/lib/supabase/server'
import { StatCard } from '@/components/ui'
import { formatPeso, percent } from '@/lib/utils'
import Link from 'next/link'
import { Badge } from '@/components/ui'
import type { ProjectStatus } from '@/types'
import { dateLabel } from './dashboard-shared'

export async function AdminDashboard({ supabase }: { supabase: Awaited<ReturnType<typeof createClient>> }) {
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
