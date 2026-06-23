/**
 * BADGE COMPONENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Used for project status, task status, roles, and labels.
 *
 * USAGE:
 *   <Badge status="on_track">On Track</Badge>
 *   <Badge variant="info">Developer</Badge>
 *   <Badge variant="warning">In Review</Badge>
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import type { ProjectStatus } from '@/types'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full font-medium leading-none select-none',
  {
    variants: {
      variant: {
        success: 'bg-success-bg text-success-fg',
        danger:  'bg-danger-bg  text-danger-fg',
        warning: 'bg-warning-bg text-warning-fg',
        info:    'bg-info-bg    text-info-fg',
        neutral: 'bg-bg-surface-3 text-secondary',
      },
      size: {
        sm: 'text-2xs px-2   py-0.5',
        md: 'text-xs  px-2.5 py-1',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size:    'sm',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<'span'>,
    VariantProps<typeof badgeVariants> {
  /** Convenience prop — maps a ProjectStatus to the right variant automatically */
  status?: ProjectStatus
}

/** Map project status → badge variant */
const statusVariantMap: Record<ProjectStatus, VariantProps<typeof badgeVariants>['variant']> = {
  discovery:   'info',
  in_progress: 'warning',
  review:      'info',
  completed:   'success',
  archived:    'neutral',
}

/** Human-readable labels for project statuses */
export const statusLabel: Record<ProjectStatus, string> = {
  discovery:   'Discovery',
  in_progress: 'In Progress',
  review:      'In Review',
  completed:   'Completed',
  archived:    'Archived',
}

function Badge({ className, variant, size, status, children, ...props }: BadgeProps) {
  const resolvedVariant = status ? statusVariantMap[status] : variant

  return (
    <span
      className={cn(badgeVariants({ variant: resolvedVariant, size }), className)}
      {...props}
    >
      {children ?? (status ? statusLabel[status] : null)}
    </span>
  )
}

export { Badge, badgeVariants }
