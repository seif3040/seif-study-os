importScripts("/study-offline-core.js");

const CACHE = "seif-offline-__STUDY_BUILD_VERSION__";
const PAGE = "/study-offline.html";
const assets = [PAGE, "/study-offline.css", "/study-offline.js", "/study-offline-core.js", "/study-logo.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(assets.map(path => new Request(path, { cache: "reload" })))));
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("seif-offline-") && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "APPLY_UPDATE") self.skipWaiting();
});

self.addEventListener("sync", event => {
  if (event.tag === StudyOffline.SYNC_TAG) event.waitUntil(StudyOffline.sync());
});

self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (assets.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) ?? fetch(request)));
  } else if (request.mode === "navigate" && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/manus-storage/")) {
    event.respondWith(fetch(request).catch(async () => (await caches.match(PAGE)) ?? Response.error()));
  }
});
