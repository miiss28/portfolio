// —— Version de cache (change à chaque release) ——
const CACHE_VERSION  = "pharma-v23";
const STATIC_CACHE   = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE  = `${CACHE_VERSION}-runtime`;

// —— Fichiers disponibles HORS LIGNE dès l’installation ——
const PRECACHE_URLS = [
  // Si ton site est dans un sous-dossier, garde ces chemins *sans* slash au début
  "index.html",
  "offline.html",
  "competances.html",  // vérifie l'orthographe exacte du fichier
  "parcours.html",
  "qualités.html",     // si le fichier n'a pas d'accent, remplace par "qualites.html"
  "portfolio.css",
  "photo11.png",
  "photo12.png",
  "manifest.json"
];

// —— INSTALL : précache ——
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// —— ACTIVATE : nettoyage des anciens caches ——
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// —— FETCH : stratégies ——
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Ignore les requêtes hors scope (ex. extensions)
  if (req.url.startsWith("chrome-extension://")) return;

  // 1) NAVIGATIONS (pages HTML) : réseau d'abord, fallback precache -> offline.html
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        return await fetch(req); // en ligne : réseau (on NE met PAS les pages HTML au runtime)
      } catch (e) {
        const cache = await caches.open(STATIC_CACHE);
        const precached = await cache.match(req);   // uniquement le precache
        if (precached) return precached;
        return cache.match("offline.html");         // sinon page offline
      }
    })());
    return;
  }

  // 2) ASSETS statiques (css/js/images/fonts/manifest) : cache-first + runtime
  const dest = req.destination;
  if (
    dest === "style" ||
    dest === "script" ||
    dest === "image" ||
    dest === "font"  ||
    req.url.endsWith("manifest.json")
  ) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;                     // servez le cache s'il existe
      try {
        const fresh = await fetch(req);              // sinon réseau
        const runtime = await caches.open(RUNTIME_CACHE);
        runtime.put(req, fresh.clone());             // et stock au runtime
        return fresh;
      } catch (e) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // 3) AUTRES requêtes : network-first + runtime, fallback cache
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      const runtime = await caches.open(RUNTIME_CACHE);
      runtime.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      const cached = await caches.match(req);
      return cached || Response.error();
    }
  })());
});