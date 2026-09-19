'use client'
/**
 * PROFILE FORM
 * ─────────────────────────────────────────────────────────────────────────────
 * One form, one Save, disabled until something changes. Email is read-only:
 * public.users.email mirrors auth.users.email and the invite lookups key off
 * it, so migration 016 blocks changing it here.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useState, useTransition } from 'react'
import { Button, Input, Textarea } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import {
  BIO_MAX, COMPANY_MAX, JOB_TITLE_MAX, LOCATION_MAX, PHONE_MAX, WEBSITE_MAX,
  profileDraftError, timezoneOptions, type ProfileDraft,
} from '@/lib/profile'
import { updateProfile } from '@/app/(portal)/profile/actions'
import { AvatarUploader } from './AvatarUploader'
import type { User } from '@/types'

interface ProfileFormProps {
  user: User
  /** From user_private (migration 024) — see profile/page.tsx. Not on User:
   *  013's directory policy makes every users column readable by any
   *  approved member, so these two live in their own owner/admin-only table. */
  phone:     string | null
  birthdate: string | null
}

export function ProfileForm({ user, phone, birthdate }: ProfileFormProps) {
  const zones = useMemo(() => timezoneOptions(), [])
  const isClient = user.role === 'client'

  const initial: ProfileDraft = useMemo(() => ({
    name:           user.name,
    phone:          phone     ?? '',
    timezone:       user.timezone        ?? '',
    jobTitle:       user.job_title       ?? '',
    location:       user.location        ?? '',
    bio:            user.bio             ?? '',
    birthdate:      birthdate ?? '',
    company:        user.company         ?? '',
    companyWebsite: user.company_website ?? '',
  }), [user, phone, birthdate])

  const [draft, setDraft]   = useState<ProfileDraft>(initial)
  const [avatar, setAvatar] = useState<string | null>(user.avatar_url)
  const [error, setError]   = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const dirty =
    avatar !== user.avatar_url ||
    (Object.keys(initial) as (keyof ProfileDraft)[]).some(key => draft[key] !== initial[key])

  function set<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const problem = profileDraftError(draft, isClient)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)

    // Mirrors what updateProfile actually persists (name.trim(), blank(phone), …).
    // Sending this same trimmed payload and resyncing draft to it on success
    // keeps `initial` (built from the refreshed, trimmed row) and `draft` in
    // agreement — otherwise stray whitespace leaves `dirty` permanently true.
    const blank = (value: string) => (value.trim() === '' ? '' : value.trim())
    const payload: ProfileDraft = {
      name:           draft.name.trim(),
      phone:          blank(draft.phone),
      timezone:       draft.timezone,
      jobTitle:       blank(draft.jobTitle),
      location:       blank(draft.location),
      bio:            blank(draft.bio),
      birthdate:      draft.birthdate,
      company:        isClient ? blank(draft.company) : '',
      companyWebsite: isClient ? blank(draft.companyWebsite) : '',
    }

    startTransition(async () => {
      try {
        await updateProfile({ ...payload, avatarUrl: avatar })
        setDraft(payload)
        toast.success('Profile saved.')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save your profile.')
      }
    })
  }

  const sectionTitle = 'text-sm font-medium text-primary'

  return (
    <form onSubmit={submit} className="space-y-8 max-w-2xl">
      {error && (
        <div role="alert" className="rounded-md bg-danger/10 border border-danger/30 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <section className="space-y-3">
        <h2 className={sectionTitle}>Photo</h2>
        <AvatarUploader
          name={draft.name || user.name}
          userId={user.id}
          value={avatar}
          onChange={setAvatar}
          disabled={isPending}
        />
      </section>

      <section className="space-y-4">
        <h2 className={sectionTitle}>About you</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name" id="profile-name" value={draft.name}
            onChange={e => set('name', e.target.value)} maxLength={100} disabled={isPending}
          />
          <Input
            label="Job title" id="profile-job-title" value={draft.jobTitle}
            onChange={e => set('jobTitle', e.target.value)} maxLength={JOB_TITLE_MAX}
            placeholder="Webflow developer" disabled={isPending}
          />
          <Input
            label="Birthday" id="profile-birthdate" type="date" value={draft.birthdate}
            onChange={e => set('birthdate', e.target.value)} disabled={isPending}
          />
          <Input
            label="Location" id="profile-location" value={draft.location}
            onChange={e => set('location', e.target.value)} maxLength={LOCATION_MAX}
            placeholder="Cebu, Philippines" disabled={isPending}
          />
        </div>
        <Textarea
          label="Short bio" id="profile-bio" value={draft.bio} rows={3}
          onChange={e => set('bio', e.target.value)} maxLength={BIO_MAX} disabled={isPending}
        />
      </section>

      <section className="space-y-4">
        <h2 className={sectionTitle}>Contact</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Phone" id="profile-phone" value={draft.phone}
            onChange={e => set('phone', e.target.value)} maxLength={PHONE_MAX}
            disabled={isPending} autoComplete="tel"
          />
          <Input label="Email" id="profile-email" value={user.email} disabled readOnly />
        </div>
        <p className="text-2xs text-tertiary">
          Your email is how you sign in and can&apos;t be changed here — ask an admin.
        </p>
      </section>

      {isClient && (
        <section className="space-y-4">
          <h2 className={sectionTitle}>Company</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Company" id="profile-company" value={draft.company}
              onChange={e => set('company', e.target.value)} maxLength={COMPANY_MAX}
              disabled={isPending} autoComplete="organization"
            />
            <Input
              label="Website" id="profile-company-website" value={draft.companyWebsite}
              onChange={e => set('companyWebsite', e.target.value)} maxLength={WEBSITE_MAX}
              placeholder="https://acme.com" disabled={isPending}
            />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className={sectionTitle}>Preferences</h2>
        <div className="flex flex-col gap-1 max-w-sm">
          <label htmlFor="profile-timezone" className="text-xs font-medium text-secondary">
            Timezone
          </label>
          <select
            id="profile-timezone"
            value={draft.timezone}
            onChange={e => set('timezone', e.target.value)}
            disabled={isPending}
            className="h-10 rounded-md border border-[var(--color-border-default)] bg-bg-surface-1 px-3 text-sm text-primary transition-colors duration-base hover:border-[var(--color-border-strong)] focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {draft.timezone === '' && <option value="">Pick a timezone</option>}
            {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
          </select>
          <p className="text-2xs text-tertiary">
            Shown to the team so they know your local time.
          </p>
        </div>
      </section>

      <div className="flex items-center gap-3 border-t border-subtle pt-5">
        <Button type="submit" size="md" loading={isPending} disabled={!dirty || isPending}>
          Save changes
        </Button>
        {dirty && !isPending && (
          <span className="text-2xs text-tertiary">You have unsaved changes.</span>
        )}
      </div>
    </form>
  )
}
