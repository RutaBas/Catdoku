// Cache-first app shell. Bump CACHE_NAME on every deploy — this is the update strategy.
const CACHE_NAME = "catdoku-v9";
const ASSETS = [
  ".",
  "index.html",
  "css/styles.css",
  "manifest.json",
  "js/rng.js",
  "js/board.js",
  "js/solver.js",
  "js/generator.js",
  "js/puzzle-pool.js",
  "js/pool.js",
  "js/game.js",
  "js/storage.js",
  "js/ui.js",
  "js/main.js",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/cat-mark.png",
  // Precached so the result card appears instantly on the first win/loss
  // rather than popping in late — they're ~170KB/117KB after quantizing.
  "icons/you_win.png",
  "icons/you_lose.png",
];

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
