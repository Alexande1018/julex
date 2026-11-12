/* JULEX · service worker
   Navegación: red primero, caché si no hay conexión.
   Estáticos con hash: caché primero (sus nombres cambian en cada despliegue).
   Sube la versión al publicar para tirar la caché vieja. */

const CACHE = 'julex-v29';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    evento.respondWith(
      fetch(request)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copia));
          return respuesta;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }

  if (/\.(?:js|css|woff2?|webp|png|svg|json|webmanifest)$/i.test(url.pathname)) {
    evento.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((respuesta) => {
            if (respuesta.ok) {
              const copia = respuesta.clone();
              caches.open(CACHE).then((c) => c.put(request, copia));
            }
            return respuesta;
          }),
      ),
    );
  }
});
