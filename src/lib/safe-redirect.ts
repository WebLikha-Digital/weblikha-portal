/**
 * SAFE REDIRECT TARGET
 * ─────────────────────────────────────────────────────────────────────────────
 * The auth routes take a `?next=` param and append it to our own origin. Two
 * things go wrong if it is used raw:
 *
 *   1. `?next=//evil.com` — a protocol-relative URL. Browsers read
 *      `https://ourhost//evil.com` after normalisation as a host change, so
 *      this is a genuine open redirect.
 *   2. `?next=https://evil.com` — not exploitable (the origin is fixed and
 *      would produce `https://ourhost/https://evil.com`), but it builds a
 *      malformed URL and throws a 500 instead of failing gracefully.
 *
 * So: accept only a path that starts with exactly one `/`. Backslash is
 * rejected too — `/\evil.com` is normalised to `//evil.com` by some browsers.
 * Anything else falls back to the caller's default.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export function safeNextPath(next: string | null, fallback = '/dashboard'): string {
  if (!next) return fallback
  if (!next.startsWith('/')) return fallback
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}
