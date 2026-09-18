// sw.js — MINIMALNY service worker: jest tylko po to, żeby gra była INSTALOWALNA
// (Chrome/Android wymaga manifestu + zarejestrowanego SW z obsługą `fetch`).
//
// ⚠️ CELOWO ZERO CACHE'OWANIA. Gra wersjonuje pliki przez `?v=N` w index.html,
// a sam `index.html` musi zawsze przyjść świeży — gdyby SW trzymał go w cache,
// podbicie `?v=` przestałoby cokolwiek znaczyć i gracze siedzieliby na starej
// wersji do czasu wyczyszczenia danych strony. Offline działa więc tyle, ile
// zwykły cache przeglądarki — i to jest tu świadomy wybór, nie brak.

self.addEventListener('install', () => {
  self.skipWaiting();                    // nowy SW nie czeka na zamknięcie kart
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());     // przejmij otwarte karty od razu
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                              // POST itd. — nie ruszamy
  // MUZYKA I GŁOSY IDĄ OBOK. `<audio>` pobiera pliki zapytaniami zakresowymi
  // (Range); przepuszczenie ich przez `respondWith` potrafi zepsuć przewijanie
  // i strumieniowanie (szczególnie w Safari). Brak `respondWith` = przeglądarka
  // robi to sama, dokładnie tak jak bez SW.
  if (req.headers.has('range')) return;
  const cel = req.destination;
  if (cel === 'audio' || cel === 'video') return;
  e.respondWith(fetch(req));             // network-first bez zapasu = zawsze świeże
});
