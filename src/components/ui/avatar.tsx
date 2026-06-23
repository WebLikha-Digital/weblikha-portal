/**
 * AVATAR COMPONENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows a user's photo or falls back to colored initials.
 * Colors are deterministically assigned from the user's name so the same
 * person always gets the same color across sessions.
 *
 * USAGE:
 *   <Avatar name="Anna Lim" size="md" />
 *   <Avatar name="Juan Miguel" src={user.avatar_url} size="sm" />
 * ─────────────────────────────────────────────────────────────────────────────
 */
import Image from 'next/image'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn, getInitials } from '@/lib/utils'

/** Palette of avatar background colors (indices map to names deterministically) */
const AVATAR_COLORS = [
  'bg-[#7F6FF8] text-white',  // purple
  'bg-[#F95B3B] text-white',  // coral
  'bg-[#33D656] text-bg-base', // green
  'bg-[#45B1E8] text-white',  // blue
  'bg-[#FDD33C] text-bg-base', // yellow (brand)
  'bg-[#E87E45] text-white',  // orange
] as const

function getAvatarColor(name: string): string {
  const sum = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!
}

const avatarVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden font-semibold select-none',
  {
    variants: {
      size: {
        xs: 'size-6  text-2xs',
        sm: 'size-7  text-xs',
        md: 'size-8  text-sm',
        lg: 'size-10 text-md',
        xl: 'size-12 text-lg',
      },
    },
    defaultVariants: { size: 'md' },
  },
)

export interface AvatarProps extends VariantProps<typeof avatarVariants> {
  name:       string
  src?:       string | null
  className?: string
}

export function Avatar({ name, src, size, className }: AvatarProps) {
  const colorClass = getAvatarColor(name)

  return (
    <span
      className={cn(avatarVariants({ size }), !src && colorClass, className)}
      title={name}
      aria-label={name}
    >
      {src
        ? <Image src={src} alt={name} fill className="object-cover" />
        : <span aria-hidden>{getInitials(name)}</span>}
    </span>
  )
}
