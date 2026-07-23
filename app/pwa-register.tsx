"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that makes BloomOS installable to the home
 * screen. The worker itself does no caching (see public/sw.js) — this is purely
 * for installability, so a live app never serves stale bookings.
 *
 * `updateViaCache: "none"` makes the browser bypass the HTTP cache when
 * checking sw.js for updates, so a new worker always propagates immediately.
 */
export default function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          /* best-effort: the app works fine if registration fails */
        });
    };

    // Register after load so it never competes with first paint.
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
