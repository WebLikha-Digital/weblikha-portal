'use client'
/**
 * MOBILE TAB BAR
 * ─────────────────────────────────────────────────────────────────────────────
 * App-style bottom navigation for phones (hidden on md+ where the Sidebar
 * takes over). Role-aware, mirrors the sidebar's primary nav. Secondary items
 * (user profile, sign out) stay in the hamburger drawer.
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

export function MobileTabBar({ user }: { user: User }) {
  const pathname = usePathname()
  const tabs = user.role === 'admin' ? ADMIN_TABS : PROVIDER_TABS

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-bg-surface-1 border-t border-subtle pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <ul className="flex" role="list">
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
