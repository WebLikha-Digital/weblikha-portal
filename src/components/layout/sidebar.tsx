/**
 * SIDEBAR COMPONENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Role-aware navigation. Admins see everything; providers see their internal
 * pages (Dashboard, Projects, Rewards); clients see only Dashboard and
 * Projects — client accounts must never see team-internal nav (Rewards,
 * Team, Revenue, Clients, Settings).
 *
 * Collapsible: the toggle on the right edge shrinks it to an icon rail.
 * Collapse state lives in PortalShell (so the content margin can respond).
 *
 * TO ADD A NAV ITEM:
 *   1. Add an entry to ADMIN_NAV, PROVIDER_NAV, or CLIENT_NAV below.
 *   2. Create the corresponding page at src/app/(portal)/<href>/page.tsx.
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
  Trophy,
  PanelLeftClose,
  PanelLeftOpen,
  UserPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui'
import { NotificationsBell } from '@/components/layout/NotificationsBell'
import type { User } from '@/types'

// ── Navigation config ──────────────────────────────────────────────────────────

const ADMIN_NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects',  href: '/projects',  icon: Folder },
  { label: 'Team',      href: '/team',      icon: Users },
  { label: 'Clients',   href: '/clients',   icon: UserPlus },
  { label: 'Revenue',   href: '/revenue',   icon: BarChart3 },
] as const

const PROVIDER_NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects',  href: '/projects',  icon: Folder },
  { label: 'Rewards',   href: '/rewards',   icon: Trophy },
] as const

// Clients only ever get Dashboard + Projects — no team-internal pages.
const CLIENT_NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects',  href: '/projects',  icon: Folder },
] as const

const ADMIN_BOTTOM = [
  { label: 'Settings', href: '/settings', icon: Settings },
] as const

// The three nav arrays above are differently-shaped readonly tuples (`as const`),
// so picking between them needs a common element type rather than relying on
// inference to unify the tuples themselves.
type NavItem = { label: string; href: string; icon: typeof LayoutDashboard }

// ── Component ──────────────────────────────────────────────────────────────────

interface SidebarProps {
  user:       User
  /** Icon-rail mode. Omit both props for the non-collapsible mobile drawer. */
  collapsed?: boolean
  onToggle?:  () => void
}

export function Sidebar({ user, collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname()

  // Explicit three-way selection, not a binary. An unrecognized role (should
  // never happen given the `User['role']` union, but the fall-through must
  // still be safe against future roles or bad data) gets CLIENT_NAV — the
  // most restrictive set — rather than defaulting to PROVIDER_NAV, so a new
  // or malformed role can never inherit team-internal nav by accident.
  let navItems: readonly NavItem[]
  switch (user.role) {
    case 'admin':
      navItems = ADMIN_NAV
      break
    case 'provider':
      navItems = PROVIDER_NAV
      break
    case 'client':
      navItems = CLIENT_NAV
      break
    default:
      navItems = CLIENT_NAV
  }
  const bottomItems = user.role === 'admin' ? ADMIN_BOTTOM : []

  const linkClass = (isActive: boolean) => cn(
    'flex items-center gap-2.5 rounded-md py-2 text-sm transition-colors duration-fast',
    collapsed ? 'justify-center px-2' : 'px-3',
    isActive
      ? 'bg-warning-bg text-brand font-medium'
      : 'text-secondary hover:bg-bg-overlay hover:text-primary',
  )

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-[var(--z-sidebar)] flex flex-col border-r border-subtle bg-bg-surface-1 transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-[200px]',
      )}
      aria-label="Main navigation"
    >
      {/* Logo — full wordmark expanded, icon mark collapsed */}
      <div
        className={cn(
          'flex h-20 shrink-0 items-end border-b border-subtle pb-4',
          collapsed ? 'justify-center px-2' : 'px-5',
        )}
      >
        {collapsed ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src="/icons/weblikha-icon.svg"
            alt="Weblikha"
            className="size-9"
          />
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src="https://cdn.prod.website-files.com/6829ba317137e68337ab4113/6829e463f9165ea007955225_Weblikha-Logo.svg"
            alt="Weblikha"
            className="h-12 w-auto"
          />
        )}
      </div>

      {/* Primary nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Primary">
        <ul className="space-y-0.5" role="list">
          {navItems.map(({ label, href, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`)
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={linkClass(isActive)}
                  aria-current={isActive ? 'page' : undefined}
                  title={collapsed ? label : undefined}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {!collapsed && label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="border-t border-subtle px-2 py-3">
        {/* Notifications — desktop sidebar only; mobile gets the header bell.
            (onToggle is only passed to the desktop sidebar.) */}
        {onToggle && (
          <div className="mb-2">
            <NotificationsBell variant="sidebar" collapsed={collapsed} />
          </div>
        )}

        {/* Collapse toggle — desktop only, styled like a nav item */}
        {onToggle && (
          <button
            onClick={onToggle}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'mb-2 flex w-full items-center gap-2.5 rounded-md py-2 text-sm transition-colors duration-fast',
              collapsed ? 'justify-center px-2' : 'px-3',
              'text-secondary hover:bg-bg-overlay hover:text-primary',
            )}
          >
            {collapsed
              ? <PanelLeftOpen  className="size-4 shrink-0" aria-hidden />
              : <PanelLeftClose className="size-4 shrink-0" aria-hidden />}
            {!collapsed && 'Collapse'}
          </button>
        )}

        {bottomItems.length > 0 && (
          <ul className="space-y-0.5 mb-2" role="list">
            {bottomItems.map(({ label, href, icon: Icon }) => {
              const isActive = pathname === href
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={linkClass(isActive)}
                    title={collapsed ? label : undefined}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {!collapsed && label}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        {/* User row — stacks vertically when collapsed */}
        <div
          className={cn(
            'flex items-center rounded-md',
            collapsed ? 'flex-col gap-2 px-0 py-2' : 'gap-2.5 px-3 py-2',
          )}
        >
          <Avatar name={user.name} src={user.avatar_url} size="sm" />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-primary">{user.name}</p>
              <p className="text-2xs text-secondary capitalize">{user.role}</p>
            </div>
          )}
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
