// Hearth PWA Service Worker with Universal Web Share Target (Text & Images)
const CACHE_NAME = 'hearth-v2';
const SHARE_CACHE = 'receipt-shares-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept Web Share Target POST
  if (event.request.method === 'POST' && url.pathname.startsWith('/transactions')) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const title = formData.get('share_title') || '';
          const text = formData.get('share_text') || '';
          const urlParam = formData.get('share_url') || '';
          const file = formData.get('receipt_file');

          let redirectUrl = '/transactions';
          const combinedText = [text, title, urlParam].filter(Boolean).join(' ');

          if (file && file.size > 0) {
            const cache = await caches.open(SHARE_CACHE);
            await cache.put('latest-shared-receipt', new Response(file, {
              headers: { 'Content-Type': file.type || 'image/png' }
            }));
            redirectUrl = '/transactions?shared_receipt=image' + (combinedText ? '&share_text=' + encodeURIComponent(combinedText) : '');
          } else if (combinedText) {
            redirectUrl = '/transactions?share_text=' + encodeURIComponent(combinedText);
          }

          return Response.redirect(redirectUrl, 303);
        } catch (err) {
          return Response.redirect('/transactions', 303);
        }
      })()
    );
    return;
  }

  // Handle standard GET fetches
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
