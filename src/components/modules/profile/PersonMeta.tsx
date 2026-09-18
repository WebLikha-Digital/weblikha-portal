'use client'
/**
 * PERSON META
 * ─────────────────────────────────────────────────────────────────────────────
 * The small line under a person's name: what they do, what time it is where
 * they are, and their birthday. Renders nothing when we know none of it, so a
 * half-filled profile leaves no empty scaffolding on screen.
 *
 * Local time is computed in the viewer's browser on render — no ticking clock,
 * no server work. It can be a minute stale, which does not matter for "is it
 * reasonable to message them now".
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBirthday, formatLocalTime } from '@/lib/profile'

interface PersonMetaProps {
  timezone?:  string | null | undefined
  jobTitle?:  string | null | undefined
  birthdate?: string | null | undefined
  className?: string | undefined
}

export function PersonMeta({ timezone, jobTitle, birthdate, className }: PersonMetaProps) {
  const localTime = formatLocalTime(timezone ?? null)
  const birthday  = formatBirthday(birthdate ?? null)
  const title     = jobTitle?.trim() || null

  if (!localTime && !birthday && !title) return null

  // "Asia/Manila" → "Manila"; the city is the part people read.
  const city = timezone ? timezone.split('/').pop()?.replace(/_/g, ' ') : null

  return (
    <span className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-tertiary', className)}>
      {title && <span className="truncate">{title}</span>}

      {localTime && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Clock className="size-3" aria-hidden />
          {city} · {localTime}
        </span>
      )}

      {birthday && <span className="whitespace-nowrap">🎂 {birthday}</span>}
    </span>
  )
}
