import Link from 'next/link'
import { StatCard } from '@/components/ui'
import { formatDateShort, formatRelative } from '@/lib/utils'
import type { createClient } from '@/lib/supabase/server'
import { dateLabel } from './dashboard-shared'
import { loadClientDashboard } from './client-data'
import { ClientProjectCard } from './ClientProjectCard'

/**
 * CLIENT DASHBOARD
 * ─────────────────────────────────────────────────────────────────────────────
 * What a client sees on sign-in. Before this existed they fell through to the
 * provider dashboard, whose every query filters on the signed-in user as an
 * assignee — so it rendered blank rather than erroring.
 *
 * Read-only: everything links to where the action already lives.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function ClientDashboard({
  supabase,
  userId,
  userName,
  viewerTimezone,
}: {
  supabase:       Awaited<ReturnType<typeof createClient>>
  userId:         string
  userName:       string
  viewerTimezone: string | null
}) {
  const { projects, requests, overdue, upcoming, messages } =
    await loadClientDashboard(supabase, userId, viewerTimezone)

  const activeProjects = projects.filter(p =>
    ['in_progress', 'discovery', 'review'].includes(p.status),
  )

  const panelTitle = 'text-sm font-medium text-primary'

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold">
          Welcome, {userName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-xs text-secondary">{dateLabel}</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Active Projects" value={activeProjects.length} />
        <StatCard label="Your Open Requests" value={requests.length} />
        <StatCard
          label="Overdue"
          value={overdue.length}
          valueColor={overdue.length > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* Projects */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className={panelTitle}>Your projects</h2>
          <Link href="/projects" className="text-xs text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">
            View all
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-secondary">
              Your projects will appear here once the team adds you to one.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map(project => (
              <ClientProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </section>

      {/* Requests + messages */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="border-b border-subtle px-4 py-3">
            <h2 className={panelTitle}>Your requests</h2>
          </div>
          {requests.length === 0 ? (
            <p className="p-6 text-center text-sm text-secondary">
              Nothing open. You can add a request from a project&apos;s to-do list.
            </p>
          ) : (
            <ul>
              {requests.map(request => (
                <li key={request.id} className="border-b border-subtle last:border-b-0">
                  <Link
                    href={`/projects/${request.project_id}?tab=todos`}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-bg-surface-2 active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-primary">{request.title}</span>
                      <span className="block truncate text-2xs text-secondary">{request.project_name}</span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-2xs text-tertiary">
                      {request.due_date ? formatDateShort(request.due_date) : 'No date'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-subtle px-4 py-3">
            <h2 className={panelTitle}>Recent messages</h2>
          </div>
          {messages.length === 0 ? (
            <p className="p-6 text-center text-sm text-secondary">
              No messages yet. The team posts updates here.
            </p>
          ) : (
            <ul>
              {messages.map(message => (
                <li key={message.id} className="border-b border-subtle last:border-b-0">
                  <Link
                    href={`/projects/${message.project_id}?tab=messages&message=${message.id}`}
                    className="block px-4 py-2.5 transition-colors duration-150 hover:bg-bg-surface-2 active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                  >
                    <span className="block truncate text-sm text-primary">{message.title}</span>
                    <span className="block truncate text-2xs text-secondary">
                      {message.author_name} · {formatRelative(message.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Deadlines — omitted entirely when there are none */}
      {(overdue.length > 0 || upcoming.length > 0) && (
        <section className="card overflow-hidden">
          <div className="border-b border-subtle px-4 py-3">
            <h2 className={panelTitle}>What&apos;s due</h2>
          </div>
          <ul>
            {[...overdue, ...upcoming].map(item => (
              <li key={item.id} className="border-b border-subtle last:border-b-0">
                <Link
                  href={`/projects/${item.project_id}?tab=todos`}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-bg-surface-2 active:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-primary">{item.title}</span>
                    <span className="block truncate text-2xs text-secondary">{item.project_name}</span>
                  </span>
                  <span className={`shrink-0 whitespace-nowrap text-2xs ${item.overdue ? 'text-danger' : 'text-tertiary'}`}>
                    {item.overdue ? 'Overdue · ' : ''}{formatDateShort(item.due_date)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
