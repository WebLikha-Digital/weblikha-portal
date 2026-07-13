/**
 * WEB PUSH CLIENT HELPERS — browser only.
 * Used by client components (NotificationsBell). Registration is idempotent
 * and permission-free; the permission prompt fires only inside
 * subscribeToPush(), which must be called from a user gesture.
 *
 * iOS note: Safari exposes PushManager only when the portal is installed to
 * the home screen, so pushSupported() is naturally false in the plain
 * browser tab — no platform special-casing needed.
 */

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch (err) {
    console.error('[push] Service worker registration failed:', err)
    return null
  }
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  const registration = await registerServiceWorker()
  if (!registration) return null
  return registration.pushManager.getSubscription()
}

export async function subscribeToPush(): Promise<{ endpoint: string; p256dh: string; auth: string } | null> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    console.warn('[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set — cannot subscribe')
    return null
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
  })

  const json = subscription.toJSON()
  if (!json.keys?.p256dh || !json.keys?.auth) return null
  return { endpoint: subscription.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }
}

/** Web Push spec wants the VAPID key as a Uint8Array, not base64url. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = window.atob(base64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i)
  }
  return bytes
}
