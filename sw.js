const CACHE_NAME = 'task-pwa-v1'
const ASSETS = [
  '/task-pwa/',
  '/task-pwa/index.html',
  '/task-pwa/app.js',
  '/task-pwa/utils.js',
  '/task-pwa/supabase.js',
  '/task-pwa/style.css',
  '/task-pwa/manifest.json',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  // Supabaseへのリクエストはキャッシュしない
  if (e.request.url.includes('supabase.co')) return

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  )
})
