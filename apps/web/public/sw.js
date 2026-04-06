/* Minimal service worker for Web Push */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'PokéEdge', body: 'Price update' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'PokéEdge', {
      body: data.body || '',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow('/'))
})
