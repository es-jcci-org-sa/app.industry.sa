const CACHE_NAME = 'industrial-viewer-router-v1';
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.mode !== 'navigate') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === '/' || url.pathname === '') {
    event.respondWith(fetch('/404.html', {cache:'no-store'}).catch(() => new Response('Error 404', {status:404, headers:{'Content-Type':'text/plain; charset=utf-8'}})));
    return;
  }

  const m = url.pathname.match(/^\/license\/view\/([^/]+)\/?$/i);
  if (!m) return;

  event.respondWith((async () => {
    const id = decodeURIComponent(m[1]);
    try {
      const dataResp = await fetch('/data/' + encodeURIComponent(id) + '.json', {cache:'no-store'});
      if (!dataResp.ok) {
        const e = await fetch('/404.html', {cache:'no-store'});
        return new Response(await e.text(), {status:404, headers:{'Content-Type':'text/html; charset=utf-8'}});
      }
      return fetch('/index.html', {cache:'no-store'});
    } catch (err) {
      const e = await fetch('/404.html', {cache:'no-store'});
      return new Response(await e.text(), {status:404, headers:{'Content-Type':'text/html; charset=utf-8'}});
    }
  })());
});
