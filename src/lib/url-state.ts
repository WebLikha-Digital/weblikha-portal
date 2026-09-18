/**
 * Update query params in place without a navigation or server round trip.
 * Next.js 14.1+ syncs window.history.replaceState into useSearchParams, so
 * components reading the params re-render with the new values.
 */
export function replaceSearchParams(update: Record<string, string | null>): void {
  const url = new URL(window.location.href)
  for (const [key, value] of Object.entries(update)) {
    if (value === null) url.searchParams.delete(key)
    else url.searchParams.set(key, value)
  }
  window.history.replaceState(null, '', url)
}
