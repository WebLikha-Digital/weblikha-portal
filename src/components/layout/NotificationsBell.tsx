'use client'
/**
 * NOTIFICATIONS BELL
 * ─────────────────────────────────────────────────────────────────────────────
 * Unread badge + dropdown of recent notifications. Polls Supabase every 30s
 * (pauses while the tab is hidden, refreshes on return). Marking read happens
 * client-side via RLS-scoped updates — recipients can only touch their own
 * rows, so no server action is needed.
 *
 * Variants:
 *   sidebar — nav-item look, panel opens up-and-right (desktop sidebar)
 *   header  — icon button, panel drops down right-aligned (mobile header)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, BellRing, CheckCheck, AtSign, ClipboardList } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui'
import { cn, formatRelative } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { savePushSubscription } from '@/app/(portal)/actions'
import { getExistingSubscription, pushSupported, subscribeToPush } from '@/lib/push-client'
import type { NotificationWithMeta } from '@/types'

const POLL_MS = 30_000
const PUSH_DISMISSED_KEY = 'weblikha-push-dismissed'

interface NotificationsBellProps {
  variant:    'sidebar' | 'header'
  collapsed?: boolean
}

export function NotificationsBell({ variant, collapsed = false }: NotificationsBellProps) {
  const router      = useRouter()
  const supabaseRef = useRef(createClient())

  const [open,    setOpen]    = useState(false)
  const [items,   setItems]   = useState<NotificationWithMeta[]>([])
  const [unread,  setUnread]  = useState(0)
  const [marking, setMarking] = useState(false)
  const [pushRow, setPushRow] = useState<'hidden' | 'available' | 'pending'>('hidden')

  const load = useCallback(async () => {
    const supabase = supabaseRef.current
    const [listRes, countRes] = await Promise.all([
      supabase
        .from('notifications')
        .select('*, actor:users!notifications_actor_id_fkey(id, name, avatar_url), task:tasks(id, title)')
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .is('read_at', null),
    ])
    if (listRes.data) setItems(listRes.data as unknown as NotificationWithMeta[])
    if (typeof countRes.count === 'number') setUnread(countRes.count)
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => { if (!document.hidden) void load() }, POLL_MS)
    const onVisibility = () => { if (!document.hidden) void load() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  // Offer push opt-in when supported, not yet subscribed, and not dismissed.
  useEffect(() => {
    void (async () => {
      if (!pushSupported()) return
      if (Notification.permission === 'denied') return
      if (localStorage.getItem(PUSH_DISMISSED_KEY)) return
      const existing = await getExistingSubscription()
      if (existing) return
      setPushRow('available')
    })()
  }, [])

  async function openItem(n: NotificationWithMeta) {
    setOpen(false)
    if (!n.read_at) {
      const now = new Date().toISOString()
      setItems(prev => prev.map(i => (i.id === n.id ? { ...i, read_at: now } : i)))
      setUnread(c => Math.max(0, c - 1))
      await supabaseRef.current
        .from('notifications')
        .update({ read_at: now })
        .eq('id', n.id)
    }
    router.push(`/projects/${n.project_id}?tab=todos`)
  }

  async function markAllRead() {
    if (marking || unread === 0) return
    setMarking(true)
    const now = new Date().toISOString()
    setItems(prev => prev.map(i => (i.read_at ? i : { ...i, read_at: now })))
    setUnread(0)
    await supabaseRef.current
      .from('notifications')
      .update({ read_at: now })
      .is('read_at', null)
    setMarking(false)
  }

  async function enablePush() {
    if (pushRow === 'pending') return
    setPushRow('pending')
    try {
      const sub = await subscribeToPush()
      if (!sub) {
        // Permission dismissed or denied — hide permanently only when denied
        setPushRow(Notification.permission === 'denied' ? 'hidden' : 'available')
        return
      }
      await savePushSubscription({ ...sub, userAgent: navigator.userAgent })
      setPushRow('hidden')
      toast.success('Push notifications enabled on this device')
    } catch (err) {
      console.error('[push] Enable failed:', err)
      setPushRow('available')
      toast.error('Could not enable push notifications')
    }
  }

  function dismissPush() {
    localStorage.setItem(PUSH_DISMISSED_KEY, '1')
    setPushRow('hidden')
  }

  const badge = unread > 0 && (
    <span
      className="absolute -top-1 -right-1.5 min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-brand text-bg-base text-[10px] font-semibold leading-none"
      aria-hidden
    >
      {unread > 9 ? '9+' : unread}
    </span>
  )

  return (
    <div className="relative">
      {variant === 'sidebar' ? (
        <button
          onClick={() => setOpen(v => { if (!v) void load(); return !v })}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md py-2 text-sm transition-colors duration-fast',
            collapsed ? 'justify-center px-2' : 'px-3',
            open ? 'bg-bg-overlay text-primary' : 'text-secondary hover:bg-bg-overlay hover:text-primary',
          )}
          title={collapsed ? 'Notifications' : undefined}
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        >
          <span className="relative shrink-0">
            <Bell className="size-4" aria-hidden />
            {badge}
          </span>
          {!collapsed && 'Notifications'}
        </button>
      ) : (
        <button
          onClick={() => setOpen(v => { if (!v) void load(); return !v })}
          className={cn(
            'relative p-1.5 rounded-md transition-colors',
            open ? 'text-primary bg-bg-overlay' : 'text-secondary hover:text-primary hover:bg-bg-overlay',
          )}
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        >
          <span className="relative">
            <Bell className="size-5" aria-hidden />
            {badge}
          </span>
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'z-[80] card shadow-xl overflow-hidden',
              variant === 'sidebar'
                ? 'absolute bottom-0 left-full ml-3 w-80'
                : 'absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1.5rem)]',
            )}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-subtle">
              <span className="text-sm font-medium text-primary">Notifications</span>
              <button
                onClick={markAllRead}
                disabled={marking || unread === 0}
                className="flex items-center gap-1 text-2xs text-secondary hover:text-brand disabled:opacity-40 disabled:hover:text-secondary transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="size-3.5" aria-hidden />
                Mark all read
              </button>
            </div>

            {pushRow !== 'hidden' && (
              <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-subtle bg-brand/5">
                <BellRing className="size-4 shrink-0 text-brand" aria-hidden />
                <span className="min-w-0 flex-1 text-xs text-secondary">
                  Get notified on this device
                </span>
                <button
                  onClick={enablePush}
                  disabled={pushRow === 'pending'}
                  className="rounded text-2xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand disabled:opacity-40 transition-colors"
                >
                  {pushRow === 'pending' ? 'Enabling…' : 'Enable'}
                </button>
                <button
                  onClick={dismissPush}
                  className="rounded text-2xs text-tertiary hover:text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand transition-colors"
                >
                  Not now
                </button>
              </div>
            )}

            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-tertiary">
                  You&apos;re all caught up.
                </p>
              )}

              {items.map(n => (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={cn(
                    'flex w-full items-start gap-2.5 px-4 py-3 text-left border-b border-subtle last:border-b-0 transition-colors hover:bg-bg-surface-2',
                    !n.read_at && 'bg-brand/5',
                  )}
                >
                  {n.actor ? (
                    <Avatar name={n.actor.name} src={n.actor.avatar_url} size="xs" />
                  ) : (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bg-surface-3 text-tertiary">
                      {n.type === 'mention'
                        ? <AtSign className="size-3" aria-hidden />
                        : <ClipboardList className="size-3" aria-hidden />}
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-secondary leading-snug">
                      <span className="font-medium text-primary">{n.actor?.name ?? 'Someone'}</span>
                      {n.type === 'mention' ? ' mentioned you in ' : ' assigned you '}
                      <span className="font-medium text-primary">
                        &ldquo;{n.task?.title ?? 'a task'}&rdquo;
                      </span>
                    </span>
                    <span className="mt-0.5 block text-2xs text-tertiary">
                      {formatRelative(n.created_at)}
                    </span>
                  </span>

                  {!n.read_at && (
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-label="Unread" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
