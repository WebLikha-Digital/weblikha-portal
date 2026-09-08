'use client'
/**
 * SET PASSWORD PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Where an invited client lands after clicking the invite email. By the time
 * this renders, /auth/confirm has already verified the email's token hash
 * (`verifyOtp`) and written the session cookies on that redirect response —
 * so this page only has to set a password on the existing user.
 *
 * NOT /auth/callback: an admin-generated invite has no PKCE code verifier
 * anywhere, so there is no `?code=` to exchange. See /auth/confirm's header.
 *
 * Also doubles as the reset-password destination, since Supabase's recovery
 * flow ends in the same place: an authenticated session that needs a new
 * password.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button, Input } from '@/components/ui'

const MIN_LENGTH = 8

export default function SetPasswordPage() {
  const router = useRouter()

  const [checking, setChecking] = useState(true)
  const [email,    setEmail]    = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [reveal,   setReveal]   = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // The invite link is single-use. If it was already consumed — a corporate
  // mail scanner pre-fetching URLs is the usual culprit — there is no session
  // here and the only way forward is a fresh link.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login?error=invite_expired')
        return
      }
      setEmail(data.user.email ?? null)
      setChecking(false)
    })
  }, [router])

  const tooShort = password.length > 0 && password.length < MIN_LENGTH
  const mismatch = confirm.length > 0 && password !== confirm
  const canSubmit =
    password.length >= MIN_LENGTH && password === confirm && !saving

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return

    setSaving(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }

    // Full reload so the portal layout re-reads the session server-side
    router.push('/dashboard')
    router.refresh()
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
        <Loader2 className="size-5 animate-spin text-secondary" aria-label="Checking your invite" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-base p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://cdn.prod.website-files.com/6829ba317137e68337ab4113/6829e463f9165ea007955225_Weblikha-Logo.svg"
            alt="Weblikha"
            className="mx-auto h-12 w-auto"
          />
        </div>

        <div className="card p-6">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="size-4 text-brand" aria-hidden />
            <h1 className="text-xl">Choose a password</h1>
          </div>
          <p className="mb-6 text-xs text-secondary">
            {email
              ? <>You&apos;re setting up <span className="text-primary">{email}</span>. Pick a password and you&apos;re in.</>
              : 'Pick a password to finish setting up your account.'}
          </p>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="relative">
              <Input
                label="Password"
                type={reveal ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
                required
                {...(tooShort ? { error: `At least ${MIN_LENGTH} characters.` } : {})}
              />
              <button
                type="button"
                onClick={() => setReveal(r => !r)}
                aria-label={reveal ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-[26px] flex size-7 items-center justify-center rounded text-secondary transition-colors duration-150 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            <Input
              label="Confirm password"
              type={reveal ? 'text' : 'password'}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              {...(mismatch ? { error: 'Passwords do not match.' } : {})}
            />

            <Button type="submit" loading={saving} disabled={!canSubmit} className="w-full">
              {saving ? 'Saving…' : 'Set password and continue'}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-2xs text-tertiary">
          Weblikha Portal · your projects, tasks, and updates in one place.
        </p>
      </div>
    </div>
  )
}
