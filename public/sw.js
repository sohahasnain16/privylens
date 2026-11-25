/* PrivyLens service worker — makes the app shell (and the Firebase SDK modules) work offline,
   so Gemini Nano can keep answering with the network switched off. */
const CACHE = "privylens-v1";
const SHELL = [
  "./", "index.html", "config.js", "icon.svg", "manifest.webmanifest", "css/app.css",
  "js/app.js", "js/ai.js", "js/analysis.js", "js/auth.js", "js/firebase.js", "js/image.js",
  "js/pii.js", "js/policy.js", "js/router.js", "js/samples.js", "js/store.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const ownShell = url.origin === location.origin;
  const firebaseSdk = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  if (!ownShell && !firebaseSdk) return; // never touch API traffic (AI Logic, Firestore, Auth…)

  // stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
