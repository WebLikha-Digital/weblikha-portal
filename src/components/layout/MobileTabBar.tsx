'use client'
/**
 * MOBILE TAB BAR
 * ─────────────────────────────────────────────────────────────────────────────
 * App-style bottom navigation for phones (hidden on md+ where the Sidebar
 * takes over). Role-aware, mirrors the sidebar's primary nav. Secondary items
 * (user profile, sign out) stay in the hamburger drawer.
 *
 * Clients get Dashboard + Projects only — same restriction as the sidebar's
 * CLIENT_NAV, and for the same reason (no team-internal pages).
 *
 * Respects the home-indicator safe area on installed PWAs / iOS.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Folder, Users, BarChart3, Settings, Trophy,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { User } from '@/types'

// ADMIN_TABS deliberately does NOT include Clients (5 items is already the
// most this bar comfortably fits) — leave that as is.
const ADMIN_TABS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects',  href: '/projects',  icon: Folder },
  { label: 'Team',      href: '/team',      icon: Users },
  { label: 'Revenue',   href: '/revenue',   icon: BarChart3 },
  { label: 'Settings',  href: '/settings',  icon: Settings },
] as const

const PROVIDER_TABS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects',  href: '/projects',  icon: Folder },
  { label: 'Rewards',   href: '/rewards',   icon: Trophy },
] as const

const CLIENT_TABS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects',  href: '/projects',  icon: Folder },
] as const

// The three tab arrays above are differently-shaped readonly tuples
// (`as const`); a common element type lets the three-way selection below
// typecheck without widening to a cast or `any`.
type TabItem = { label: string; href: string; icon: typeof LayoutDashboard }

export function MobileTabBar({ user }: { user: User }) {
  const pathname = usePathname()

  // Explicit three-way selection, mirroring sidebar.tsx. An unrecognized
  // role falls to CLIENT_TABS — the most restrictive set — never PROVIDER_TABS.
  let tabs: readonly TabItem[]
  switch (user.role) {
    case 'admin':
      tabs = ADMIN_TABS
      break
    case 'provider':
      tabs = PROVIDER_TABS
      break
    case 'client':
      tabs = CLIENT_TABS
      break
    default:
      tabs = CLIENT_TABS
  }

  // Two items in a bar built for five would otherwise stretch each tab to
  // half the screen width and look unfinished. Cap the row at a standard
  // Tailwind max-width and center it on client accounts instead of letting
  // flex-1 stretch two tabs edge to edge.
  const isSparse = tabs.length <= 2

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-bg-surface-1 border-t border-subtle pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <ul
        className={cn('flex', isSparse && 'max-w-xs mx-auto')}
        role="list"
      >
        {tabs.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-1 pt-2 pb-1.5 text-2xs transition-colors',
                  isActive ? 'text-brand' : 'text-tertiary hover:text-secondary',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
