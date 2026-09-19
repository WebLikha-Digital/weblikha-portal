/**
 * Computed once per server start, not per request — matching the behaviour this
 * had as a module-level constant in dashboard/page.tsx. On a long-lived server
 * the date can go stale until the next deploy; that was true before this move
 * and is deliberately not changed here.
 */
export const dateLabel = new Date().toLocaleDateString('en-PH', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
})
