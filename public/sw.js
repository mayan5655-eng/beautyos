// Kalmea service worker — installability only, NO caching.
//
// This is a live app with real bookings, so the worker must never serve stale
// data. It deliberately implements a pure network pass-through: its only job is
// to exist so browsers offer "Add to Home Screen" / install to the phone.

self.addEventListener("install", () => {
  // Activate immediately instead of waiting for existing tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Take control of already-open pages right away.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Intentionally empty. By NOT calling event.respondWith(), every request
  // falls through to the network exactly as if no worker were installed —
  // nothing is cached, so data is always fresh.
});

// ── Push: new-booking and cancellation alerts, in-app's own "push" ──────────
// lib/ownerNotify.js sends { title, body, notificationId } as the payload.
// This is the one and only automated message this product sends to its own
// owner now — it was WhatsApp-to-herself before, which is exactly the kind
// of automated send the open-launch WhatsApp decision retired.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* non-JSON payload, ignore */ }
  const title = data.title || "קלמיה";
  const body = data.body || "";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      dir: "rtl",
      tag: data.notificationId ? String(data.notificationId) : undefined,
    })
  );
});

// Clicking the notification focuses an already-open tab rather than opening
// a new one, same instinct as every other "don't duplicate the app" rule in
// this codebase.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
