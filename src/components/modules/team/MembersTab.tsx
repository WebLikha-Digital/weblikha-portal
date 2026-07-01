'use client'
/**
 * MEMBERS TAB
 * Directory of all approved providers with project stats, skills, and
 * employment type. Admin can inline-edit skills and toggle employment type.
 */
import { useOptimistic, useTransition, useState, useRef, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui'
import { updateEmploymentType, updateUserSkills } from '@/app/(portal)/team/actions'
import type { User, PerformancePeriod, EmploymentType } from '@/types'

// ── Skill config ──────────────────────────────────────────────────────────────

export const SKILL_OPTIONS = [
  { value: 'developer',    label: 'Developer',       color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { value: 'designer',     label: 'Designer',        color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  { value: 'seo',          label: 'SEO',             color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  { value: 'pm',           label: 'Project Manager', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  { value: 'copywriter',   label: 'Copywriter',      color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  { value: 'video',        label: 'Video Editor',    color: 'bg-red-500/10 text-red-400 border-red-500/20' },
  { value: 'social_media', label: 'Social Media',    color: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
] as const

type SkillValue = typeof SKILL_OPTIONS[number]['value']

const SKILL_MAP = Object.fromEntries(SKILL_OPTIONS.map(s => [s.value, s])) as Record<string, typeof SKILL_OPTIONS[number]>

function skillColor(value: string) {
  return SKILL_MAP[value]?.color ?? 'bg-bg-surface-3 text-secondary border-subtle'
}
function skillLabel(value: string) {
  return SKILL_MAP[value]?.label ?? value
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProjectStats {
  userId:    string
  active:    number
  completed: number
  total:     number
}

interface Props {
  providers:    User[]
  periods:      PerformancePeriod[]
  projectStats: ProjectStats[]
}

type OptAction =
  | { type: 'toggle-type';  userId: string; employmentType: EmploymentType }
  | { type: 'update-skills'; userId: string; skills: string[] }

// ── Skills inline editor ──────────────────────────────────────────────────────

interface SkillsEditorProps {
  skills:   string[]
  onSave:  (next: string[]) => void
}

function SkillsEditor({ skills, onSave }: SkillsEditorProps) {
  const [open, setOpen]     = useState(false)
  const containerRef        = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function remove(skill: string) {
    onSave(skills.filter(s => s !== skill))
  }

  function add(skill: string) {
    onSave([...skills, skill])
    setOpen(false)
  }

  const available = SKILL_OPTIONS.filter(s => !skills.includes(s.value))

  return (
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-1.5">
      {skills.length === 0 && (
        <span className="text-2xs text-tertiary italic">No skills set</span>
      )}

      {skills.map((skill, i) => (
        <span
          key={skill}
          className={cn(
            'inline-flex items-center gap-1 text-2xs px-1.5 py-0.5 rounded border font-medium',
            skillColor(skill),
          )}
        >
          {i === 0 && (
            <span className="size-1 rounded-full bg-current opacity-70 shrink-0" title="Primary skill" />
          )}
          {skillLabel(skill)}
          <button
            onClick={() => remove(skill)}
            className="opacity-50 hover:opacity-100 transition-opacity ml-0.5"
            title={`Remove ${skillLabel(skill)}`}
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}

      {available.length > 0 && (
        <button
          onClick={() => setOpen(v => !v)}
          className="inline-flex items-center justify-center size-5 rounded border border-dashed border-subtle text-tertiary hover:text-primary hover:border-primary transition-colors"
          title="Add skill"
        >
          <Plus className="size-3" />
        </button>
      )}

      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 flex flex-wrap gap-1 p-2 rounded-lg border border-subtle bg-bg-surface-2 shadow-lg w-56">
          {available.map(s => (
            <button
              key={s.value}
              onClick={() => add(s.value)}
              className={cn(
                'text-2xs px-2 py-1 rounded border font-medium transition-opacity hover:opacity-80',
                s.color,
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function MembersTab({ providers, periods, projectStats }: Props) {
  const [, startTransition] = useTransition()

  const [optimisticProviders, applyOptimistic] = useOptimistic(
    providers,
    (state: User[], action: OptAction) =>
      state.map(u => {
        if (u.id !== action.userId) return u
        if (action.type === 'toggle-type')   return { ...u, employment_type: action.employmentType }
        if (action.type === 'update-skills') return { ...u, skills: action.skills }
        return u
      }),
  )

  function handleToggleType(user: User) {
    const next: EmploymentType = user.employment_type === 'in-house' ? 'outsource' : 'in-house'
    startTransition(async () => {
      applyOptimistic({ type: 'toggle-type', userId: user.id, employmentType: next })
      await updateEmploymentType(user.id, next)
    })
  }

  function handleSkillsChange(userId: string, skills: string[]) {
    startTransition(async () => {
      applyOptimistic({ type: 'update-skills', userId, skills })
      await updateUserSkills(userId, skills)
    })
  }

  const statsMap   = new Map(projectStats.map(s => [s.userId, s]))
  const periodsMap = new Map(periods.map(p => [p.user_id, p]))

  const inHouse   = optimisticProviders.filter(u => u.employment_type === 'in-house')
  const outsource = optimisticProviders.filter(u => u.employment_type === 'outsource')

  if (optimisticProviders.length === 0) {
    return (
      <div className="card p-12 text-center">
        <p className="text-sm text-secondary">No team members yet. Approve providers in Settings.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <MemberSection
        title="In-house"
        members={inHouse}
        statsMap={statsMap}
        periodsMap={periodsMap}
        onToggleType={handleToggleType}
        onSkillsChange={handleSkillsChange}
      />
      <MemberSection
        title="Outsource"
        members={outsource}
        statsMap={statsMap}
        periodsMap={periodsMap}
        onToggleType={handleToggleType}
        onSkillsChange={handleSkillsChange}
      />
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

interface SectionProps {
  title:           string
  members:         User[]
  statsMap:        Map<string, ProjectStats>
  periodsMap:      Map<string, PerformancePeriod>
  onToggleType:    (user: User) => void
  onSkillsChange:  (userId: string, skills: string[]) => void
}

function MemberSection({ title, members, statsMap, periodsMap, onToggleType, onSkillsChange }: SectionProps) {
  if (members.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-secondary">{title}</h2>
        <span className="text-xs text-tertiary">({members.length})</span>
      </div>

      <div className="overflow-x-auto rounded-xl">
      <div className="card overflow-visible min-w-[56rem]">
        {/* Column headers */}
        <div className="grid grid-cols-[14rem_1fr_7rem_5rem_5rem_5rem_5rem] gap-3 items-center px-4 py-2.5 border-b border-subtle">
          <span className="label-caps">Member</span>
          <span className="label-caps">Skills</span>
          <span className="label-caps">Type</span>
          <span className="label-caps text-right">Active</span>
          <span className="label-caps text-right">Done</span>
          <span className="label-caps text-right">Total</span>
          <span className="label-caps text-right">Pts / mo</span>
        </div>

        <ul>
          {members.map(user => {
            const stats  = statsMap.get(user.id)
            const period = periodsMap.get(user.id)
            return (
              <li
                key={user.id}
                className="grid grid-cols-[14rem_1fr_7rem_5rem_5rem_5rem_5rem] gap-3 items-center px-4 py-3 border-b border-subtle last:border-0 hover:bg-bg-surface-2 transition-colors"
              >
                {/* Member */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={user.name} src={user.avatar_url} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{user.name}</p>
                    <p className="text-2xs text-tertiary truncate">{user.email}</p>
                  </div>
                </div>

                {/* Skills — inline editor */}
                <SkillsEditor
                  skills={user.skills}
                  onSave={next => onSkillsChange(user.id, next)}
                />

                {/* Employment type — click to toggle */}
                <button
                  onClick={() => onToggleType(user)}
                  title="Click to toggle in-house / outsource"
                  className={cn(
                    'inline-flex items-center justify-center text-2xs px-2 py-1 rounded-full font-medium transition-colors hover:opacity-80',
                    user.employment_type === 'in-house'
                      ? 'bg-brand/15 text-brand'
                      : 'bg-bg-surface-3 text-secondary border border-subtle',
                  )}
                >
                  {user.employment_type === 'in-house' ? 'In-house' : 'Outsource'}
                </button>

                {/* Stats */}
                <span className="text-sm text-secondary text-right tabular-nums">{stats?.active    ?? 0}</span>
                <span className="text-sm text-success  text-right tabular-nums">{stats?.completed ?? 0}</span>
                <span className="text-sm font-medium text-primary text-right tabular-nums">{stats?.total ?? 0}</span>
                <span className={cn(
                  'text-sm font-medium text-right tabular-nums',
                  (period?.total_points ?? 0) >= 1000 ? 'text-success' : 'text-secondary',
                )}>
                  {period?.total_points ?? 0}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
      </div>
    </div>
  )
}
