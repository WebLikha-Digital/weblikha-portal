/**
 * SITE URL RESOLVER (server-side)
 * ─────────────────────────────────────────────────────────────────────────────
 * Every link we email — invites, password resets, approval notices — is built
 * from this. Getting it wrong means a client receives a link pointing at
 * localhost, so the fallback chain matters:
 *
 *   1. NEXT_PUBLIC_SITE_URL — set this in Production. It is the only value
 *      that survives a custom domain change.
 *   2. VERCEL_URL — auto-injected per deployment. Covers Preview builds, where
 *      the hostname is generated fresh each time and cannot be hardcoded.
 *   3. localhost — local dev.
 *
 * Server-only: VERCEL_URL is not exposed to the browser bundle.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  const vercel = process.env.VERCEL_URL?.trim()
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`

  return 'http://localhost:3000'
}
