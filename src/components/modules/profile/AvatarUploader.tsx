'use client'
/**
 * AVATAR UPLOADER
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared by the onboarding screen and the profile form. Uploads straight to the
 * `avatars` bucket from the browser, then hands the public URL back through
 * onChange — the caller decides when to persist it.
 *
 * Migration 024 scopes writes to `avatars/{user_id}/…`, so the path below is
 * not a convention: a path with anyone else's id is rejected by RLS.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useRef, useState } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { Avatar } from '@/components/ui'
import { confirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/client'

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED   = ['image/jpeg', 'image/png', 'image/webp']

interface AvatarUploaderProps {
  name:      string
  userId:    string
  value:     string | null
  onChange:  (url: string | null) => void
  disabled?: boolean | undefined
}

export function AvatarUploader({
  name, userId, value, onChange, disabled = false,
}: AvatarUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!ALLOWED.includes(file.type)) {
      toast.error('Photos have to be a JPEG, PNG or WebP.')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('That photo is over 2 MB. Try a smaller one.')
      return
    }

    setBusy(true)
    try {
      const supabase = createClient()
      const ext  = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${userId}/${crypto.randomUUID()}.${ext}`

      const { error } = await supabase.storage
        .from('avatars')
        .upload(path, file, { contentType: file.type })
      if (error) {
        toast.error(`Could not upload that photo: ${error.message}`)
        return
      }

      const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
      onChange(url)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    const ok = await confirmDialog({
      title:        'Remove your photo?',
      message:      'Your initials will be shown instead.',
      confirmLabel: 'Remove',
    })
    if (ok) onChange(null)
  }

  const button =
    'inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-subtle text-xs ' +
    'text-secondary hover:text-primary hover:border-[var(--color-border-default)] ' +
    'active:opacity-80 transition-colors duration-150 focus-visible:outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} src={value} size="xl" />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={button}
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy
            ? <><Loader2 className="size-3.5 animate-spin" /> Uploading…</>
            : <><Upload className="size-3.5" /> {value ? 'Change photo' : 'Add a photo'}</>}
        </button>

        {value && (
          <button
            type="button"
            className={button}
            disabled={disabled || busy}
            onClick={() => { void remove() }}
          >
            <X className="size-3.5" /> Remove
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={e => { void handleFile(e) }}
        className="hidden"
      />
    </div>
  )
}
