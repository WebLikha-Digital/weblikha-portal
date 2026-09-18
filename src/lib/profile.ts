/**
 * PROFILE — SHARED RULES
 * ─────────────────────────────────────────────────────────────────────────────
 * Used by the onboarding screen, the profile form and the Server Actions, so
 * the browser validates exactly what the server enforces. Production Next.js
 * redacts thrown Server Action messages, so anything a person can fix must be
 * caught client-side by these functions first.
 *
 * The numeric limits mirror the CHECK constraints in migration 024 — change
 * them together.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const PHONE_MIN     = 5
export const PHONE_MAX     = 30
export const JOB_TITLE_MAX = 80
export const LOCATION_MAX  = 120
export const BIO_MAX       = 500
export const COMPANY_MAX   = 120
export const WEBSITE_MAX   = 200

export interface OnboardingDraft {
  phone:    string
  timezone: string
  company:  string
}

export interface ProfileDraft {
  name:           string
  phone:          string
  timezone:       string
  jobTitle:       string
  location:       string
  bio:            string
  birthdate:      string   // '' or YYYY-MM-DD
  company:        string
  companyWebsite: string
}

/** Digits, spaces and the usual separators. Deliberately not a strict E.164 check. */
const PHONE_RE = /^[+()\-.\s\d]+$/

function phoneError(phone: string): string | null {
  const value = phone.trim()
  if (value.length < PHONE_MIN || value.length > PHONE_MAX) {
    return `A phone number is between ${PHONE_MIN} and ${PHONE_MAX} characters.`
  }
  if (!PHONE_RE.test(value)) return 'A phone number can only contain digits, spaces, + ( ) - and .'
  return null
}

function timezoneError(timezone: string): string | null {
  if (!timezone.trim()) return 'Pick your timezone.'
  if (timezone.length < 3 || timezone.length > 64) return 'That timezone is not valid.'
  return null
}

export function onboardingDraftError(draft: OnboardingDraft, isClient: boolean): string | null {
  const phone = phoneError(draft.phone)
  if (phone) return phone

  const timezone = timezoneError(draft.timezone)
  if (timezone) return timezone

  if (isClient) {
    const company = draft.company.trim()
    if (!company) return 'Tell us which company you work for.'
    if (company.length > COMPANY_MAX) return `A company name is at most ${COMPANY_MAX} characters.`
  }
  return null
}

export function profileDraftError(draft: ProfileDraft, isClient: boolean): string | null {
  if (!draft.name.trim()) return 'Your name cannot be empty.'
  if (draft.name.trim().length > 100) return 'Your name is at most 100 characters.'

  const phone = phoneError(draft.phone)
  if (phone) return phone

  const timezone = timezoneError(draft.timezone)
  if (timezone) return timezone

  if (draft.jobTitle.trim().length > JOB_TITLE_MAX) {
    return `A job title is at most ${JOB_TITLE_MAX} characters.`
  }
  if (draft.location.trim().length > LOCATION_MAX) {
    return `A location is at most ${LOCATION_MAX} characters.`
  }
  if (draft.bio.trim().length > BIO_MAX) return `A bio is at most ${BIO_MAX} characters.`

  if (draft.birthdate) {
    const date = new Date(`${draft.birthdate}T00:00:00`)
    if (Number.isNaN(date.getTime())) return 'That birthday is not a valid date.'
    // Compare dates, not a date against an instant: migration 024 enforces
    // `birthdate < current_date`, so today must be rejected here too. Comparing
    // against `new Date()` would accept today at any time past local midnight,
    // and the database would then reject it with a message production redacts.
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (date >= today) return 'A birthday has to be in the past.'
  }

  if (isClient) {
    const company = draft.company.trim()
    if (!company) return 'Tell us which company you work for.'
    if (company.length > COMPANY_MAX) return `A company name is at most ${COMPANY_MAX} characters.`

    // Validated trimmed, because the trimmed value is what gets stored. 024's
    // users_company_website_format checks the raw column and does NOT btrim, so
    // a caller that persists the untrimmed string would pass here and be
    // rejected by the database — always write the trimmed value.
    const site = draft.companyWebsite.trim()
    if (site) {
      if (site.length > WEBSITE_MAX) return `A website address is at most ${WEBSITE_MAX} characters.`
      if (!/^https?:\/\//i.test(site)) return 'A website address has to start with http:// or https://'
    }
  }
  return null
}

/** The browser's own zone, used to pre-select the picker. */
export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Every IANA zone the browser knows. `supportedValuesOf` is widely available but
 * not universal, so fall back to a short list covering the agency and the
 * regions its clients are in rather than shipping an empty picker.
 */
export function timezoneOptions(): string[] {
  const fallback = [
    'Asia/Manila', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Dubai', 'Asia/Kolkata',
    'Australia/Sydney', 'Australia/Perth', 'Europe/London', 'Europe/Berlin',
    'Europe/Madrid', 'America/New_York', 'America/Chicago', 'America/Denver',
    'America/Los_Angeles', 'America/Toronto', 'Pacific/Auckland', 'UTC',
  ]
  try {
    const supported = Intl.supportedValuesOf?.('timeZone')
    if (supported && supported.length > 0) return [...supported]
  } catch {
    // fall through
  }

  // The browser's own zone may not be in this short list — without it the
  // picker would quietly fall back to its first entry and save a zone the
  // person never chose.
  const own = detectTimezone()
  return fallback.includes(own) ? fallback : [own, ...fallback]
}

/** "9:04 PM" in that person's zone, or null when we don't know it. */
export function formatLocalTime(timezone: string | null, now: Date = new Date()): string | null {
  if (!timezone) return null
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour:     'numeric',
      minute:   '2-digit',
    }).format(now)
  } catch {
    return null
  }
}

/** "Mar 14" — day and month only. A year of birth does not belong on a shared screen. */
export function formatBirthday(birthdate: string | null): string | null {
  if (!birthdate) return null
  const date = new Date(`${birthdate}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}
