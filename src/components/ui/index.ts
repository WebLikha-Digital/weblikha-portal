/**
 * UI PRIMITIVES — BARREL EXPORT
 * ─────────────────────────────────────────────────────────────────────────────
 * Import all UI components from this single entry point:
 *   import { Button, Badge, StatCard } from '@/components/ui'
 *
 * When you add a new primitive, export it here.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export { Button }                  from './button'
export type { ButtonProps }        from './button'

export { Badge, statusLabel }      from './badge'
export type { BadgeProps }         from './badge'

export { StatCard }                from './stat-card'
export type { StatCardProps }      from './stat-card'

export { Avatar }                  from './avatar'
export type { AvatarProps }        from './avatar'

export { Input, Textarea }         from './input'
export type { InputProps, TextareaProps } from './input'
