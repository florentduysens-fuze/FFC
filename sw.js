const CACHE_NAME = "mgrs-cache-v1";

const FILES_TO_CACHE = [
  "index.html",
  "style.css",
  "app.js",
  "manifest.json"
  // Les tuiles hors-ligne seront chargées directement depuis /tiles/
];

// INSTALLATION DU SERVICE WORKER
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

// ACTIVATION (nettoyage des anciens caches)
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
});

// MODE HORS-LIGNE
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
