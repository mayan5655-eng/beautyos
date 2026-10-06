"use client";

// app/AttributionCapture.jsx
//
// Renders nothing. On a landing that carries a campaign (utm_*, a click id) or an outside referrer, keeps
// it in a first-party cookie for 30 days - first touch only - so that when she signs up the onboarding
// page can tell us which ad brought her (lib/attribution.js has the whole story). No third party, no
// fingerprinting, and it never overwrites an earlier touch.

import { useEffect } from "react";
import { ATTR_COOKIE, ATTR_MAX_AGE_S, readAttribution, serializeAttribution } from "@/lib/attribution";

export default function AttributionCapture() {
  useEffect(() => {
    try {
      if (document.cookie.split("; ").some((c) => c.startsWith(`${ATTR_COOKIE}=`))) return; // first touch wins
      const attr = readAttribution({ search: window.location.search, referrer: document.referrer, ownHost: window.location.hostname });
      if (!attr) return;
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${ATTR_COOKIE}=${serializeAttribution(attr)}; Max-Age=${ATTR_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`;
    } catch { /* attribution is a nicety: never let it touch the page */ }
  }, []);
  return null;
}
