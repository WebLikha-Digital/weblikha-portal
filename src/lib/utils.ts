/**
 * UTILITY FUNCTIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * Generic helpers used across the entire app.
 * Keep this file small — if a helper is domain-specific (e.g. project utils),
 * put it in src/lib/<domain>/utils.ts instead.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isPast, differenceInDays } from 'date-fns'

// ── Styling ────────────────────────────────────────────────────────────────────

/**
 * Merges Tailwind classes safely, resolving conflicts.
 * This is the one function you'll use in almost every component.
 *
 * @example cn('px-4 py-2', isActive && 'bg-brand', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

// ── Currency ───────────────────────────────────────────────────────────────────

/**
 * Format a number as Philippine Peso (₱).
 * Uses compact notation for large numbers (e.g. ₱485K, ₱2.32M).
 *
 * @example formatPeso(485000)       → "₱485K"
 * @example formatPeso(85000, false) → "₱85,000"
 */
export function formatPeso(amount: number, compact = true): string {
  if (compact && Math.abs(amount) >= 1_000) {
    return new Intl.NumberFormat('en-PH', {
      style:    'currency',
      currency: 'PHP',
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(amount)
  }
  return new Intl.NumberFormat('en-PH', {
    style:    'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount)
}

// ── Dates ──────────────────────────────────────────────────────────────────────

/**
 * Format a date string for display in the UI.
 * @example formatDate('2026-07-15') → "Jul 15, 2026"
 */
export function formatDate(date: string): string {
  return format(new Date(date), 'MMM d, yyyy')
}

/**
 * Format a date as a short label (no year if current year).
 * @example formatDateShort('2026-07-15') → "Jul 15"
 */
export function formatDateShort(date: string): string {
  const d = new Date(date)
  const isCurrentYear = d.getFullYear() === new Date().getFullYear()
  return format(d, isCurrentYear ? 'MMM d' : 'MMM d, yyyy')
}

/**
 * Human-readable relative date.
 * @example formatRelative('2026-06-20') → "3 days ago"
 */
export function formatRelative(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

/**
 * Returns how many days remain until a deadline.
 * Negative means overdue.
 */
export function daysUntil(date: string): number {
  return differenceInDays(new Date(date), new Date())
}

/** Whether a date is in the past. */
export function isOverdue(date: string): boolean {
  return isPast(new Date(date))
}

// ── Numbers ────────────────────────────────────────────────────────────────────

/**
 * Clamp a value between min and max.
 * @example clamp(150, 0, 100) → 100
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Calculate what percentage `part` is of `total`.
 * Returns 0 if total is 0 (avoids divide-by-zero).
 */
export function percent(part: number, total: number): number {
  if (total === 0) return 0
  return Math.round((part / total) * 100)
}

// ── Strings ────────────────────────────────────────────────────────────────────

/**
 * Generate initials from a full name (up to 2 characters).
 * @example getInitials('Juan Miguel Santos') → "JM"
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Truncate a string with an ellipsis.
 * @example truncate('Long project name here', 20) → "Long project name..."
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}
