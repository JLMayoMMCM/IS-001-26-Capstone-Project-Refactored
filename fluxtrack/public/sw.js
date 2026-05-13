// FluxTrack Service Worker — minimal stub.
//
// Some browsers (or older app code) request /sw.js by convention even when
// no PWA features are wired up yet. This stub silences the 404 in dev logs
// and gives us a place to add push-notification handling later.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Web Push handler — renders notifications fanned out by the push-send Edge Function.
self.addEventListener("push", (event) => {
  let payload = { title: "FluxTrack", body: "You have a new notification." };
  try {
    payload = event.data?.json() ?? payload;
  } catch {
    if (event.data) {
      payload.body = event.data.text();
    }
  }
  const options = {
    body: payload.body,
    tag: payload.tag,
    data: { url: payload.url ?? "/" },
  };
  event.waitUntil(self.registration.showNotification(payload.title ?? "FluxTrack", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.registration.scope) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
