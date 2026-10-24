"use client";

import { useEffect, useState } from "react";
import InstallBannerCard from "./InstallBannerCard";
import { usePathname } from "next/navigation";
import { inAppBrowser } from "@/lib/design/sharePost";
import { isOwnerSurface, hasBottomNav } from "@/lib/ownerSurface";

const DISMISS_KEY = "bloomos-ios-install-dismissed";

/**
 * A small dismissible hint shown to iPhone/iPad users on Safari, telling them
 * how to install Kalmea to the home screen (iOS has no automatic install
 * prompt). It only appears when:
 *   - the device is iOS,
 *   - the browser is Safari (Add to Home Screen lives in its share sheet),
 *   - the app is NOT already running installed (standalone), and
 *   - the user hasn't dismissed it before (remembered in localStorage).
 * Server-renders nothing, so there is no hydration mismatch.
 *
 * The Chromium half of this lives in install-prompt-banner.tsx. The two can
 * never appear together: iOS Safari is the one engine that does not fire
 * `beforeinstallprompt`, which is the only thing that shows the other banner.
 */
export default function IOSInstallBanner() {
  const [render, setRender] = useState(false);
  const [enter, setEnter] = useState(false);

  // Only on her own screens: a client on the booking page has no use for "install Kalmea" (lib/ownerSurface.js).
  const pathname = usePathname() || "";
  useEffect(() => {
    if (!isOwnerSurface(pathname, document.cookie)) { setEnter(false); setRender(false); return; }
    const ua = window.navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    // Chrome/Firefox/Edge on iOS carry their own tokens; their share sheets
    // don't expose "Add to Home Screen", so only prompt real Safari.
    // Instagram / Facebook / WhatsApp in-app browsers report as Safari but have no "Add to Home Screen"; the
    // in-app-browser banner (in-app-browser-banner.tsx) tells her to open Safari instead.
    const isSafari = !/crios|fxios|edgios|opios/i.test(ua) && !inAppBrowser(ua);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari exposes standalone here rather than via display-mode.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    // Safari with storage blocked throws on any localStorage access. Mounted in the root layout, an uncaught throw here took
    // down every page, the public booking page included (2026-10-20 audit). A failed read counts as "not dismissed".
    let dismissed = false;
    try { dismissed = window.localStorage.getItem(DISMISS_KEY) === "1"; } catch { /* storage blocked */ }

    if (isIOS && isSafari && !isStandalone && !dismissed) {
      setRender(true);
      // Next frame → trigger the slide/fade-in transition.
      requestAnimationFrame(() => setEnter(true));
    }
  }, [pathname]);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode / storage disabled — just hide for this session */
    }
    setEnter(false);
    window.setTimeout(() => setRender(false), 220);
  }

  if (!render) return null;

  return (
    <InstallBannerCard
      ariaLabel="התקנת האפליקציה למסך הבית"
      enter={enter}
      onDismiss={dismiss}
      aboveNav={hasBottomNav(pathname)}
      title="התקיני את קלמיה למסך הבית"
      icon={
        /* iOS share glyph */
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8.5 7.5 12 4l3.5 3.5" />
          <path d="M12 4v11" />
          <path d="M7 10.5H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
        </svg>
      }
    >
      הקישי על כפתור השיתוף ובחרי «הוספה למסך הבית».
      {/* iOS gives a home-screen app its OWN cookie jar, separate from
          Safari's. So being signed in here does NOT carry across the
          install, and the first launch opens on the login screen. That is
          iOS behaviour, not something the app can carry over - and left
          unexplained it reads as "the app forgot me" at the exact moment
          she is forming her first impression of it. One sentence up front
          costs nothing and turns a bug-looking moment into an expected
          one. */}
      <span style={{ display: "block", marginTop: "3px", opacity: 0.85 }}>
        בפתיחה הראשונה תתבקשי להתחבר עוד פעם אחת — זו התנהגות רגילה של אייפון.
      </span>
    </InstallBannerCard>
  );
}
