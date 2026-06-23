/**
 * STAT CARD COMPONENT
 * ─────────────────────────────────────────────────────────────────────────────
 * The KPI card used on the Dashboard and Revenue screens.
 *
 * USAGE:
 *   <StatCard label="Revenue (June)" value="₱485K" trend="+12% vs May" trendUp />
 *   <StatCard label="Active Projects" value={8} />
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StatCardProps {
  /** Short uppercase label above the value */
  label:      string
  /** The primary value — string (pre-formatted) or number */
  value:      string | number
  /** Optional trend line below the value */
  trend?:     string
  /** Whether the trend is positive (green) or negative (red) */
  trendUp?:   boolean
  /** Override value color — useful for brand/warning highlights */
  valueColor?: 'default' | 'brand' | 'success' | 'danger'
  className?: string
}

export function StatCard({
  label,
  value,
  trend,
  trendUp,
  valueColor = 'default',
  className,
}: StatCardProps) {
  const valueColorClass = {
    default: 'text-primary',
    brand:   'text-brand',
    success: 'text-success',
    danger:  'text-danger',
  }[valueColor]

  return (
    <div className={cn('stat-card', className)}>
      <p className="label-caps mb-2">{label}</p>

      <p className={cn('font-display text-4xl font-semibold tabular-nums', valueColorClass)}>
        {value}
      </p>

      {trend && (
        <p
          className={cn(
            'mt-1.5 flex items-center gap-1 text-xs',
            trendUp === true  && 'text-success',
            trendUp === false && 'text-danger',
            trendUp === undefined && 'text-secondary',
          )}
        >
          {trendUp === true  && <TrendingUp  className="size-3" aria-hidden />}
          {trendUp === false && <TrendingDown className="size-3" aria-hidden />}
          {trend}
        </p>
      )}
    </div>
  )
}
