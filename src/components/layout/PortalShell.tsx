'use client'
/**
 * PORTAL SHELL
 * ─────────────────────────────────────────────────────────────────────────────
 * Client wrapper that owns the sidebar collapse state so the main content
 * margin can respond. Preference persists in localStorage.
 * Children remain server-rendered — this shell only handles layout chrome.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { MobileTabBar } from '@/components/layout/MobileTabBar'
import { Toaster } from '@/components/ui/toast'
import { ConfirmHost } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import type { User } from '@/types'

const STORAGE_KEY = 'weblikha-sidebar-collapsed'

interface PortalShellProps {
  user:     User
  children: React.ReactNode
}

export function PortalShell({ user, children }: PortalShellProps) {
  const [collapsed, setCollapsed] = useState(false)

  // Restore preference after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === '1') setCollapsed(true)
  }, [])

  function toggle() {
    setCollapsed(prev => {
      localStorage.setItem(STORAGE_KEY, prev ? '0' : '1')
      return !prev
    })
  }

  return (
    <div className="flex min-h-screen bg-bg-base">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar user={user} collapsed={collapsed} onToggle={toggle} />
      </div>

      {/* Mobile header + slide-in drawer */}
      <MobileNav user={user} />

      {/* Main content — offset by sidebar on md+; on mobile, padded below the
          fixed header and above the bottom tab bar */}
      <main
        className={cn(
          'flex-1 min-w-0 pt-14 pb-20 md