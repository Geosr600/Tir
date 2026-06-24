/* service-worker.js — cache complet pour usage 100% hors-ligne sur le terrain.
   Aucun réseau n'est disponible sur le terrain : stratégie Cache First pure pour tous
   les assets précachés, sans jamais tenter le réseau (pas de timeout à attendre).
   Pas de notion de mise à jour de données distantes — la seule "donnée réseau" est
   l'import manuel du fichier JSON, géré côté app (pas par ce Service Worker).

   Stratégie pour les templates PDF :
   - À l'install : tentative de mise en cache (allSettled = non bloquant, l'install
     ne rate jamais à cause des PDFs si le réseau est indisponible à cet instant).
   - Runtime caching : premier fetch d'un PDF en ligne → mis automatiquement en cache
     pour les usages hors-ligne suivants.
   - La PWA doit être utilisée au moins une fois en ligne (écran Export → "Générer")
     pour que les PDFs soient dans le cache avant de partir sur le terrain. */

const CACHE_NAME = 'terrain-v14';

// Assets JS/CSS/HTML : obligatoires. L'install échoue si l'un est manquant.
const PRECACHE_REQUIRED = [
  './index.html',
  './manifest.webmanifest',
  './css/terrain-style.css',
  './vendor/pdf-lib.min.js',
  './vendor/jszip.min.js',
  './js/regles.js',
  './js/db.js',
  './js/signature.js',
  './js/pdf-engine/coords.js',
  './js/pdf-engine/pdf-utils.js',
  './js/pdf-engine/fill-istc.js',
  './js/pdf-engine/fill-test-tir.js',
  './js/import.js',
  './js/saisie.js',
  './js/export.js',
  './js/mail.js',
  './js/cloture.js',
  './js/swipe.js',
  './js/config-sig.js',
  './js/app.js',
];

// Assets optionnels à l'install (icônes + modèles PDF).
// Un échec ne bloque pas l'installation ; les PDFs sont récupérés à la
// première utilisation en ligne via le runtime caching du fetch handler.
const PRECACHE_OPTIONAL = [
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/pdf-templates/istc-fa.pdf',
  './assets/pdf-templates/istc-pa.pdf',
  './assets/pdf-templates/test-tir-fa.pdf',
  './assets/pdf-templates/test-tir-pa.pdf',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(PRECACHE_REQUIRED)
        .then(() => Promise.allSettled(PRECACHE_OPTIONAL.map(url => cache.add(url).catch(() => {}))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('terrain-') && k !== CACHE_NAME)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Cache First pour tout ce qui est précaché.
// Runtime caching pour les templates PDF : si un PDF n'est pas encore en cache
// (première utilisation en ligne), le fetch réseau réussit et on le met en cache
// pour les futures sessions hors-ligne.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const isPdfTemplate = event.request.url.includes('/assets/pdf-templates/');

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && isPdfTemplate) {
          // Met le PDF en cache pour usage hors-ligne ultérieur
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        }
        return response;
      });
    })
  );
});
