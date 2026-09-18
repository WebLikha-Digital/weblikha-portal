'use client'
/**
 * ONBOARDING FORM
 * ─────────────────────────────────────────────────────────────────────────────
 * One screen, four fields, most of them pre-filled or optional. The timezone is
 * pre-selected from the browser, so the common case is confirming rather than
 * choosing from 400 zones.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Input } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import {
  COMPANY_MAX, PHONE_MAX, detectTimezone, onboardingDraftError, timezoneOptions,
} from '@/lib/profile'
import { AvatarUploader } from './AvatarUploader'
import { completeOnboarding } from '@/app/(auth)/onboarding/actions'

interface OnboardingFormProps {
  userId:    string
  name:      string
  isClient:  boolean
  avatarUrl: string | null
}

export function OnboardingForm({ userId, name, isClient, avatarUrl }: OnboardingFormProps) {
  const router = useRouter()
  const zones  = useMemo(() => timezoneOptions(), [])

  const [avatar,   setAvatar]   = useState<string | null>(avatarUrl)
  const [phone,    setPhone]    = useState('')
  const [timezone, setTimezone] = useState(() => detectTimezone())
  const [company,  setCompany]  = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const problem = onboardingDraftError({ phone, timezone, company }, isClient)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        await completeOnboarding({ phone, timezone, company, avatarUrl: avatar })
        toast.success('Welcome aboard.')
        router.replace('/dashboard')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
      }
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5 text-left">
      {error && (
        <div role="alert" className="rounded-md bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <AvatarUploader
        name={name}
        userId={userId}
        value={avatar}
        onChange={setAvatar}
        disabled={isPending}
      />

      <Input
        label="Phone number"
        id="onboarding-phone"
        value={phone}
        onChange={e => setPhone(e.target.value)}
        maxLength={PHONE_MAX}
        placeholder="+63 912 345 6789"
        disabled={isPending}
        autoComplete="tel"
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="onboarding-timezone" className="text-xs font-medium text-secondary">
          Timezone
        </label>
        <select
          id="onboarding-timezone"
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
          disabled={isPending}
          className="h-10 rounded-md border border-[var(--color-border-default)] bg-bg-surface-1 px-3 text-sm text-primary transition-colors duration-base hover:border-[var(--color-border-strong)] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
        </select>
        <p className="text-2xs text-tertiary">
          So the team can see when you&apos;re around. We&apos;ve guessed from your browser.
        </p>
      </div>

      {isClient && (
        <Input
          label="Company"
          id="onboarding-company"
          value={company}
          onChange={e => setCompany(e.target.value)}
          maxLength={COMPANY_MAX}
          placeholder="Acme Inc."
          disabled={isPending}
          autoComplete="organization"
        />
      )}

      <Button type="submit" size="md" loading={isPending} className="w-full">
        Finish
      </Button>
    </form>
  )
}
