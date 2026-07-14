// Cache-first app shell. Bump CACHE_NAME on every deploy — this is the update strategy.
// Real asset list (icons etc.) finalized in step 7; placeholder for now.
const CACHE_NAME = "catdoku-v1";
const ASSETS = [".", "index.html", "css/styles.css", "manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
