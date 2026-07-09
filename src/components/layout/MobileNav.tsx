'use client'
/**
 * MOBILE NAV
 * Renders a sticky mobile header (hamburger + logo) and a slide-in sidebar
 * drawer. Auto-closes when the user navigates to a new page.
 * Hidden entirely on md+ screens where the fixed Sidebar takes over.
 */
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sidebar } from './sidebar'
import { NotificationsBell } from '@/components/layout/NotificationsBell'
import type { User } from '@/types'

interface Props {
  user: User
}

const LOGO = 'https://cdn.prod.website-files.com/6829ba317137e68337ab4113/6829e463f9165ea007955225_Weblikha-Logo.svg'

export function MobileNav({ user }: Props) {
  const [open, setOpen] = useState(false)
  const pathname        = usePathname()

  // Close drawer whenever the route changes
  useEffect(() => { setOpen(false) }, [pathname])

  // Prevent body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* ── Mobile sticky header ───────────────────────────────────────────── */}
      {/* Fixed (not sticky): PortalShell is a flex row, so a sticky header would
          become a flex column beside <main> instead of a bar above it. */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between h-14 px-4 bg-bg-surface-1 border-b border-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO} alt="Weblikha" className="h-9 w-auto" />
        <div className="flex items-center gap-1">
          <NotificationsBell variant="header" />
          <button
            onClick={() => setOpen(v => !v)}
            className="p-1.5 rounded-md text-secondary hover:text-primary hover:bg-bg-overlay transition-colors"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </header>

      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'md:hidden fixed inset-0 z-50 bg-black/60 transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* ── Sidebar drawer ────────────────────────────────────────────────── */}
      {/*
        On mobile: hidden (−translate-x-full) by default, slides in when open.
        On desktop (md+): the regular fixed Sidebar takes over — this wrapper
        becomes invisible via md:hidden so there's no duplicate sidebar.
      */}
      {/*
        w-[200px] is required: the Sidebar inside is position:fixed (out of flow),
        so without an explicit width this wrapper is 0px wide and
        -translate-x-full (-100% of own width) moves it by nothing — leaving the
        drawer permanently visible. The transform also makes this wrapper the
        containing block for the fixed Sidebar, which is what we want.
      */}
      <div
        className={cn(
          'md:hidden fixed inset-y-0 left-0 z-[60] w-[200px] transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Sidebar user={user} />
      </div>
    </>
  )
}
