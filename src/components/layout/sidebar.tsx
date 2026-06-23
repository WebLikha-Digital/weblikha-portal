/**
 * SIDEBAR COMPONENT
 * ─────────────────────────────────────────────────────────────────────────────
 * The main navigation for the portal. Fixed on the left, 200px wide.
 * Uses Next.js usePathname() to highlight the active route.
 *
 * TO ADD A NAV ITEM:
 *   1. Add an entry to the NAV_ITEMS array below.
 *   2. Create the corresponding page at src/app/(portal)/<href>/page.tsx.
 *   That's it — the sidebar renders from the array automatically.
 * ─────────────────────────────────────────────────────────────────────────────
 */
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Folder,
  Users,
  BarChart3,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui'
import type { User } from '@/types'

// ── Navigation config ──────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { label: 'Dashboard',  href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects',   href: '/projects',  icon: Folder },
  { label: 'Team',       href: '/team',      icon: Users },
  { label: 'Revenue',    href: '/revenue',   icon: BarChart3 },
] as const

const BOTTOM_ITEMS = [
  { label: 'Settings',   href: '/settings',  icon: Settings },
] as const

// ── Component ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  user: User
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className="fixed inset-y-0 left-0 z-[var(--z-sidebar)] flex w-[200px] flex-col border-r border-subtle bg-bg-surface-1"
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-subtle px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://cdn.prod.website-files.com/6829ba317137e68337ab4113/6829e463f9165ea007955225_Weblikha-Logo.svg"
          alt="Weblikha"
          className="h-5 w-auto"
        />
        <span className="rounded-sm bg-bg-surface-3 px-1.5 py-0.5 text-2xs text-secondary">
          portal
        </span>
      </div>

      {/* Primary nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Primary">
        <ul className="space-y-0.5" role="list">
          {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-fast',
                    isActive
                      ? 'bg-warning-bg text-brand font-medium'
                      : 'text-secondary hover:bg-bg-overlay hover:text-primary',
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-subtle px-2 py-3">
        <ul className="space-y-0.5 mb-2" role="list">
          {BOTTOM_ITEMS.map(({ label, href, icon: Icon }) => {
            const isActive = pathname === href
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-fast',
                    isActive
                      ? 'bg-warning-bg text-brand font-medium'
                      : 'text-secondary hover:bg-bg-overlay hover:text-primary',
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>

        {/* User row */}
        <div className="flex items-center gap-2.5 rounded-md px-3 py-2">
          <Avatar name={user.name} src={user.avatar_url} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-primary">{user.name}</p>
            <p className="text-2xs text-secondary capitalize">{user.role}</p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-tertiary hover:text-danger transition-colors duration-fast"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="size-3.5" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </aside>
  )
}
