/* Bump this whenever an offline asset changes. Only this app's caches are managed. */
const CACHE = 'bonjour-angers-offline-v2';
const CORE = ['/', '/index.html', '/style.css', '/app.js', '/pwa.js',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/maskable-512.png', '/icons/apple-touch-icon.png'];

async function download(url) {
  const response = await fetch(new Request(url, {cache: 'reload', credentials: 'same-origin'}));
  // Never mistake a sign-in redirect or error document for an offline lesson.
  if (!response.ok || response.redirected || new URL(response.url).origin !== self.location.origin) {
    throw new Error('Unable to cache lesson resource: ' + url);
  }
  const type = response.headers.get('content-type') || '';
  if (((url === '/' || url.endsWith('.html')) && !type.includes('text/html')) ||
      (url.endsWith('.js') && !/javascript/.test(type)) ||
      (url.endsWith('.css') && !type.includes('text/css')) ||
      (url.endsWith('.png') && !type.startsWith('image/'))) {
    throw new Error('Unexpected lesson resource: ' + url);
  }
  return response;
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // A failed download keeps the existing version active and never reports ready.
    try {
      await Promise.all(CORE.map(async url => cache.put(url, await download(url))));
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('bonjour-angers-offline-') && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith((async () => (await (await caches.open(CACHE)).match('/index.html')) || fetch(event.request))());
  } else if (CORE.includes(url.pathname)) {
    event.respondWith((async () => (await (await caches.open(CACHE)).match(url.pathname)) || fetch(event.request))());
  }
});
async function offlineReady() {
  const cache = await caches.open(CACHE);
  return (await Promise.all(CORE.map(url => cache.match(url)))).every(Boolean);
}
let repairing;
function repairOffline() {
  if (!repairing) repairing = (async () => {
    const cache = await caches.open(CACHE);
    const missing = [];
    for (const url of CORE) if (!(await cache.match(url))) missing.push(url);
    // Fetch all missing assets successfully before modifying the saved copy.
    const responses = await Promise.all(missing.map(download));
    await Promise.all(missing.map((url, i) => cache.put(url, responses[i])));
  })().finally(() => {repairing = null;});
  return repairing;
}
self.addEventListener('message', event => {
  if (!event.ports[0] || !['CHECK_OFFLINE', 'REPAIR_OFFLINE'].includes(event.data?.type)) return;
  event.waitUntil((async () => {
    try {
      if (event.data.type === 'REPAIR_OFFLINE') await repairOffline();
      event.ports[0].postMessage({ready: await offlineReady(), version: CACHE});
    } catch {event.ports[0].postMessage({ready: false, version: CACHE});}
  })());
});
