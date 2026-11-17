// Pota Altı 30-0 servis çalışanı. Kapsamı yalnız /pota-30-0/: aynı sitedeki Pota Altı uygulamasının (kökteki sw.js)
// yerine bu klasörün sayfalarını bu çalışan denetler. Ağ öncelikli: güncel dosya varsa o gelir, bağlantı yoksa son
// görülen dosyalar açılır (tek başına mod ve vs AI internetsiz oynanır; 2 kişilik oda internet ister).
// Yalnız sitenin kendi dosyaları önbelleğe alınır; Firebase, yazı tipleri ve logolar doğrudan ağa gider.
const ONBELLEK = "pota-30-0-v1";
const KABUK = ["./", "index.html", "oyun.js", "baglanti.js", "firebase-ayar.js", "veri/bsl.js", "veri/tbl.js",
  "manifest.webmanifest", "simge-192.png", "simge-512.png", "apple-touch-icon.png", "simge-64.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(ONBELLEK).then((c) => c.addAll(KABUK)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((adlar) => Promise.all(adlar.filter((a) => a.startsWith("pota-30-0-") && a !== ONBELLEK).map((a) => caches.delete(a))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || !url.pathname.startsWith(new URL("./", location).pathname)) return;
  const anahtar = url.origin + url.pathname; // ?v= ve ?oda= önbellek anahtarına girmez
  const istek = e.request.mode === "navigate" ? e.request : new Request(e.request, { cache: "no-cache" });
  e.respondWith(
    fetch(istek)
      .then((yanit) => {
        if (yanit.ok) { const kopya = yanit.clone(); caches.open(ONBELLEK).then((c) => c.put(anahtar, kopya)); }
        return yanit;
      })
      .catch(() => caches.match(anahtar).then((y) => y || caches.match(new URL("./", location).href)))
  );
});
