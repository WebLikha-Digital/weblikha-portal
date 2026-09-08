/**
 * SAFE REDIRECT TARGET
 * ─────────────────────────────────────────────────────────────────────────────
 * The auth routes take a `?next=` param and append it to our own origin. Two
 * things go wrong if it is used raw:
 *
 *   1. `?next=//evil.com` — a protocol-relative URL. Here it is *not*
 *      exploitable: this value is always appended to a fixed origin we
 *      control, so the parser reads it as host `ourhost`, path `//evil.com`
 *      — the host never changes. (Tested against `//`, `///`, `/\`, and
 *      tab/newline variants.) The guard stays anyway as defence in depth: if
 *      this helper is ever reused to build a relative `Location` header
 *      directly — without a fixed origin prefixed first — that same input
 *      would become a real open redirect, and this check is what keeps it
 *      inert if that ever happens.
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
