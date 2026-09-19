import Link from 'next/link'
import { Avatar, Badge } from '@/components/ui'
import { formatDateShort, percent } from '@/lib/utils'
import type { ClientProjectSummary } from './client-data'

/**
 * One project on the client dashboard: where it stands, how far along it is,
 * what lands next, and who is on it.
 */
export function ClientProjectCard({ project }: { project: ClientProjectSummary }) {
  const done  = project.doneTasks
  const total = project.totalTasks
  const pct   = total === 0 ? 0 : percent(done, total)

  return (
    <Link
      href={`/projects/${project.id}`}
      className="card block p-4 transition-colors duration-150 hover:bg-bg-surface-2 active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate text-sm font-medium text-primary">{project.name}</h3>
        <Badge status={project.status} />
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-2xs text-tertiary">
          <span>{total === 0 ? 'No tasks yet' : `${done} of ${total} tasks done`}</span>
          {total > 0 && <span>{pct}%</span>}
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-surface-3">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-2xs text-secondary">
          {project.nextDue
            ? <>Next: {project.nextDue.title} · {formatDateShort(project.nextDue.due_date)}</>
            : 'Nothing scheduled'}
        </span>

        {project.team.length > 0 && (
          <span className="flex -space-x-1.5" aria-label="Project team">
            {project.team.slice(0, 4).map(member => (
              <Avatar key={member.id} name={member.name} src={member.avatar_url} size="xs" />
            ))}
            {project.team.length > 4 && (
              <span className="flex size-6 items-center justify-center rounded-full bg-bg-surface-3 text-2xs text-tertiary">
                +{project.team.length - 4}
              </span>
            )}
          </span>
        )}
      </div>
    </Link>
  )
}
