// ============================================================
// 📦 Service Worker（オフラインキャッシュ）
// ============================================================
const CACHE_NAME = "ruletto-v1";
const CORE_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./js/wheel-core.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// 📥 インストール時に中核ファイルをまとめてキャッシュする
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_FILES))
      .then(() => self.skipWaiting())
  );
});

// 🧹 有効化時に旧バージョンのキャッシュを消す
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// 🌐 同一オリジンの GET はキャッシュ優先。なければ取得してキャッシュへ足す
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
