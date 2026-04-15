/* Minimal service worker for Web Push */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'PokeGrails', body: 'Price update' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'PokeGrails', {
      body: data.body || '',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow('/'))
})
