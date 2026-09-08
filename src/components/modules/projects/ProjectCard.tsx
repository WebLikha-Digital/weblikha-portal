import Link from 'next/link'
import { Avatar, Badge } from '@/components/ui'
import { formatDate, formatPeso } from '@/lib/utils'
import type { ProjectCardData } from '@/types'

interface ProjectCardProps {
  project: ProjectCardData
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="block card p-5 hover:border-[var(--color-border-default)] transition-colors duration-fast group"
    >
      {/* Client name */}
      <p className="label-caps mb-1">Client</p>

      {/* Project name */}
      <h2 className="text-base font-medium text-primary mb-3 group-hover:text-brand transition-colors duration-fast">
        {project.name}
      </h2>

      <div className="flex items-center gap-2 mb-4">
        <Badge status={project.status} />
        <span className="text-2xs text-tertiary">{project.client_name}</span>
      </div>

      {/* Dates */}
      <div className="flex items-center gap-3 text-2xs text-secondary mb-4">
        <span>{formatDate(project.start_date)}</span>
        <span className="text-tertiary">→</span>
        <span>{formatDate(project.end_date)}</span>
      </div>

      <div className="divider mb-3" />

      {/* Footer */}
      <div className="flex items-center justify-between">
        {/* Team avatars */}
        <div className="flex items-center">
          {project.members.slice(0, 4).map((m, i) => (
            <div key={m.user_id} style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 10 - i }}>
              <Avatar
                name={m.user.name}
                src={m.user.avatar_url}
                size="xs"
              />
            </div>
          ))}
          {project.members.length > 4 && (
            <span className="text-2xs text-tertiary ml-2">
              +{project.members.length - 4}
            </span>
          )}
        </div>

        {/* Budget — omitted entirely for client-role fetches (project.budget
            is never selected for a client, not just hidden here) */}
        {project.budget !== undefined && (
          <div className="text-right">
            <p className="text-2xs text-tertiary">Budget</p>
            <p className="text-xs font-medium text-primary">{formatPeso(project.budget)}</p>
          </div>
        )}
      </div>
    </Link>
  )
}
