// Service worker mínimo para que WEPOOL se pueda instalar como app (PWA).
// A propósito NO cachea nada dinámico (sesión, viajes, resultados de
// /consultar) — la app depende de datos en tiempo real de Supabase, así que
// cachear esas respuestas mostraría información desactualizada o rota (p.ej.
// un viaje que ya se confirmó pero seguiría viéndose disponible). Lo único
// que se cachea es el "app shell" estático (iconos, logo, manifest) para que
// abrir la app se sienta instantáneo, más una página mínima de aviso cuando
// no hay red y tampoco hay nada en caché que mostrar.

const CACHE_NAME = "wepool-shell-v1";
const APP_SHELL = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/logo-mascot.png",
  "/logo-lockup.png",
  "/offline.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo interceptar GET — nunca Server Actions (POST) ni nada que mute datos.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegación entre pantallas: red primero. Si no hay red, mostrar la
  // página de aviso en vez de dejar que el navegador muestre su propio
  // error genérico — nunca serví una pantalla de la app con datos viejos.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  // App shell estático: caché primero (instantáneo), red de respaldo si
  // algo no estuviera cacheado todavía.
  if (APP_SHELL.some((path) => url.pathname === path)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Todo lo demás (llamadas a Supabase, Server Actions, JS/CSS con hash de
  // build de Next.js) se deja pasar directo a la red, sin interceptar.
});
