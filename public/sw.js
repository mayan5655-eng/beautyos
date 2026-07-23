// BloomOS service worker — installability only, NO caching.
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
