/**
 * WEBLIKHA PORTAL SERVICE WORKER — push-only.
 * No fetch handler on purpose: the portal is a live-data tool and offline
 * caching would risk serving a stale app shell from Vercel deploys.
 */

self.addEventListener('push', event => {
  let payload = { title: 'Weblikha Portal', body: '', url: '/dashboard' }
  try {
    payload = { ...payload, ...event.data.json() }
  } catch {
    /* malformed payload — show the fallback */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body:  payload.body,
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data:  { url: payload.url },
    }),
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/dashboard'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      for (const client of windows) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return clients.openWindow(url)
    }),
  )
})
