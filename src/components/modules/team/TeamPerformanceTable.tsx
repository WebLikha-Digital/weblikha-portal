'use client'
/**
 * TEAM PERFORMANCE TABLE
 * Leaderboard for a given month/year. Admin can click any bonus cell to
 * inline-edit the admin_points value. Updates are optimistic.
 */
import { useOptimistic, useTransition, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Pencil, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui'
import { updateAdminPoints } from '@/app/(portal)/team/actions'
import type { User, PerformancePeriod } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const SKILL_LABEL: Record<string, string> = {
  developer:    'Developer',
  designer:     'Designer',
  seo:          'SEO',
  pm:           'Project Manager',
  copywriter:   'Copywriter',
  video:        'Video Editor',
  social_media: 'Social Media',
  other:        'Other',
}

const INCENTIVE_THRESHOLD = 1_000

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  providers: User[]
  periods:   PerformancePeriod[]
  month:     number
  year:      number
}

type Row = {
  user:           User
  taskPoints:     number
  deadlinePoints: number
  adminPoints:    number
  adminNote:      string | null
  totalPoints:    number
}

type OptAction = { userId: string; adminPoints: number }

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRows(providers: User[], periods: PerformancePeriod[]): Row[] {
  const byUser = new Map(periods.map(p => [p.user_id, p]))
  return providers
    .map(u => {
      const p    = byUser.get(u.id)
      const task = p?.task_points     ?? 0
      const dl   = p?.deadline_points ?? 0
      const adm  = p?.admin_points    ?? 0
      return {
        user:           u,
        taskPoints:     task,
        deadlinePoints: dl,
        adminPoints:    adm,
        adminNote:      p?.admin_note ?? null,
        totalPoints:    task + dl + adm,
      }
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)
}

function prevMonth(month: number, year: number) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year }
}
function nextMonth(month: number, year: number) {
  return month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year }
}
function monthHref({ month, year }: { month: number; year: number }) {
  return `/team?month=${month}&year=${year}`
}

// ── Inline edit sub-component ─────────────────────────────────────────────────

interface InlinePtsProps {
  value:   number
  onSave: (next: number) => void
}

function InlinePts({ value, onSave }: InlinePtsProps) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])
  useEffect(() => { if (!editing) setDraft(String(value)) }, [value, editing])

  function commit() {
    const n = parseInt(draft, 10)
    if (!isNaN(n) && n !== value) onSave(n)
    setEditing(false)
  }
  function cancel() {
    setDraft(String(value))
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={cn(
          'group flex items-center gap-1.5 rounded px-2 py-1 text-sm transition-colors hover:bg-bg-surface-3 text-left w-full',
          value > 0 && 'text-success',
          value < 0 && 'text-danger',
          value === 0 && 'text-secondary',
        )}
        title="Click to edit bonus / deduction"
      >
        <span>{value > 0 ? `+${value}` : value}</span>
        <Pencil className="size-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="number"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
        onBlur={commit}
        className="w-20 rounded border border-brand bg-bg-surface-2 px-2 py-1 text-sm text-primary outline-none"
      />
      <button onClick={commit}  className="text-success hover:opacity-80"><Check className="size-3.5" /></button>
      <button onClick={cancel}  className="text-secondary hover:opacity-80"><X className="size-3.5" /></button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function TeamPerformanceTable({ providers, periods, month, year }: Props) {
  const [, startTransition] = useTransition()

  const initialRows = buildRows(providers, periods)

  const [optimisticRows, applyOptimistic] = useOptimistic(
    initialRows,
    (state: Row[], action: OptAction) =>
      state
        .map(r => {
          if (r.user.id !== action.userId) return r
          const admin = action.adminPoints
          return { ...r, adminPoints: admin, totalPoints: r.taskPoints + r.deadlinePoints + admin }
        })
        .sort((a, b) => b.totalPoints - a.totalPoints),
  )

  function handleAdminPts(userId: string, next: number) {
    startTransition(async () => {
      applyOptimistic({ userId, adminPoints: next })
      await updateAdminPoints(userId, month, year, next, null)
    })
  }

  const prev = prevMonth(month, year)
  const next = nextMonth(month, year)
  const isCurrentMonth =
    month === new Date().getMonth() + 1 && year === new Date().getFullYear()

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4">
        <Link
          href={monthHref(prev)}
          className="flex items-center gap-1 text-sm text-secondary hover:text-primary transition-colors"
        >
          <ChevronLeft className="size-4" />
          {MONTHS[prev.month - 1]} {prev.year}
        </Link>

        <span className="text-sm font-medium text-primary">
          {MONTHS[month - 1]} {year}
          {isCurrentMonth && (
            <span className="ml-2 text-2xs font-normal text-brand uppercase tracking-wide">Current</span>
          )}
        </span>

        <Link
          href={monthHref(next)}
          className="flex items-center gap-1 text-sm text-secondary hover:text-primary transition-colors"
        >
          {MONTHS[next.month - 1]} {next.year}
          <ChevronRight className="size-4" />
        </Link>
      </div>

      {/* Leaderboard */}
      <div className="overflow-x-auto rounded-xl">
      <div className="card overflow-hidden min-w-[42rem]">
        <div className="grid grid-cols-[2rem_1fr_6rem_6rem_7rem_5.5rem] gap-2 items-center px-4 py-2.5 border-b border-subtle">
          <span className="label-caps text-center">#</span>
          <span className="label-caps">Member</span>
          <span className="label-caps text-right">Task pts</span>
          <span className="label-caps text-right">Deadline</span>
          <span className="label-caps">Bonus / Deduct</span>
          <span className="label-caps text-right">Total</span>
        </div>

        {optimisticRows.length === 0 ? (
          <p className="px-4 py-10 text-sm text-secondary text-center">
            No team members yet. Approve providers in Settings to see them here.
          </p>
        ) : (
          <ul>
            {optimisticRows.map((row, i) => {
              const rank    = i + 1
              const hitGoal = row.totalPoints >= INCENTIVE_THRESHOLD
              const primarySkill = row.user.skills[0] ?? row.user.specialty
              return (
                <li
                  key={row.user.id}
                  className="grid grid-cols-[2rem_1fr_6rem_6rem_7rem_5.5rem] gap-2 items-center px-4 py-3 border-b border-subtle last:border-0 hover:bg-bg-surface-2 transition-colors"
                >
                  <span className={cn(
                    'text-sm font-medium text-center tabular-nums',
                    rank === 1 && 'text-brand',
                    rank > 1   && rank <= 3 && 'text-secondary',
                    rank > 3   && 'text-tertiary',
                  )}>
                    {rank}
                  </span>

                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar name={row.user.name} src={row.user.avatar_url} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-primary truncate">{row.user.name}</p>
                      <p className="text-2xs text-secondary">
                        {SKILL_LABEL[primarySkill] ?? primarySkill}
                      </p>
                    </div>
                  </div>

                  <span className="text-sm text-secondary text-right tabular-nums">{row.taskPoints}</span>
                  <span className="text-sm text-secondary text-right tabular-nums">{row.deadlinePoints}</span>

                  <InlinePts value={row.adminPoints} onSave={next => handleAdminPts(row.user.id, next)} />

                  <span
                    className={cn(
                      'text-sm font-semibold text-right tabular-nums',
                      hitGoal ? 'text-success' : 'text-primary',
                    )}
                    title={hitGoal ? 'Incentive threshold reached!' : `${INCENTIVE_THRESHOLD - row.totalPoints} pts to go`}
                  >
                    {row.totalPoints}
                    {hitGoal && <span className="ml-1 text-2xs text-success">✓</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-subtle bg-bg-surface-2">
          <span className="text-2xs text-tertiary">
            Incentive threshold: <span className="text-secondary">{INCENTIVE_THRESHOLD.toLocaleString()} pts / month</span>
          </span>
          <span className="text-2xs text-tertiary">
            <span className="text-success">✓</span> = threshold reached
          </span>
        </div>
      </div>
      </div>
    </div>
  )
}
