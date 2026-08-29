"use client";

import { useEffect, useState } from "react";
import InstallBannerCard from "./InstallBannerCard";

const DISMISS_KEY = "bloomos-install-prompt-dismissed";

/** The Chromium-only event. Not in lib.dom, so it is spelled out here. */
type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<void>;
};

declare global {
  interface Window {
    /** Stashed by the capture script in app/layout.tsx — see below. */
    __bloomosInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

/* Asked-and-answered, remembered across visits. localStorage throws outright in
   private mode rather than returning null, hence the guards. */
function remembered() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function remember() {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* private mode / storage disabled — just hide for this session */
  }
}

/**
 * The Android half of "install this to your phone".
 *
 * Chromium fires `beforeinstallprompt` when the app is installable, and the
 * ONLY way to install from inside the page is to preventDefault it, hold the
 * event, and call .prompt() from a user gesture later. Without that handler the
 * event is simply discarded and the browser's own mini-infobar is all that is
 * left — which on modern Chrome for Android is nothing but a line buried in the
 * ⋮ menu. iPhone users were getting a guided banner (ios-install-banner.tsx)
 * and Android users were getting that. This closes the gap.
 *
 * Not gated to Android on purpose: the event fires on desktop Chrome and Edge
 * too, where installing BloomOS is just as welcome, and letting the browser
 * decide installability is also what makes this testable in DevTools without a
 * phone. iOS Safari never fires it, so the two banners can't collide.
 *
 * Server-renders nothing, so there is no hydration mismatch.
 */
export default function InstallPromptBanner() {
  const [render, setRender] = useState(false);
  const [enter, setEnter] = useState(false);
  const [busy, setBusy] = useState(false);

  function hide() {
    setEnter(false);
    window.setTimeout(() => setRender(false), 220);
  }

  useEffect(() => {
    if (remembered()) return;
    // Belt and braces: Chromium suppresses the event once installed, but a
    // standalone launch should never show an install banner regardless.
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const show = () => {
      if (!window.__bloomosInstallPrompt) return;
      // Re-checked here, not just at mount. This component lives in the root
      // layout, so it mounts once and outlives every client-side navigation -
      // and Chromium re-fires beforeinstallprompt on later navigations. Without
      // this, a banner she dismissed comes back the moment she moves between
      // screens, which reads as the app ignoring her.
      if (remembered()) return;
      setRender(true);
      // Next frame → trigger the slide/fade-in transition.
      requestAnimationFrame(() => setEnter(true));
    };

    const onInstalled = () => {
      window.__bloomosInstallPrompt = null;
      remember();
      hide();
    };

    // Two arrival paths, because the event usually fires before React has
    // hydrated: the layout's capture script stashes it (covers "already
    // fired") and re-announces it on this custom event (covers "fires in a
    // moment"). The stash is read a frame late so this isn't a setState
    // straight out of the effect body.
    const first = requestAnimationFrame(show);
    window.addEventListener("bloomos:installprompt", show);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      cancelAnimationFrame(first);
      window.removeEventListener("bloomos:installprompt", show);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    remember();
    hide();
  }

  async function install() {
    const deferred = window.__bloomosInstallPrompt;
    if (!deferred || busy) return;
    setBusy(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* the event went stale — nothing to recover, just take the banner away */
    }
    // A captured prompt is single-use either way, so drop it and stop asking:
    // she has now seen the real dialog, and accepted or declined it there.
    window.__bloomosInstallPrompt = null;
    setBusy(false);
    remember();
    hide();
  }

  if (!render) return null;

  return (
    <InstallBannerCard
      ariaLabel="התקנת האפליקציה למסך הבית"
      enter={enter}
      onDismiss={dismiss}
      title="התקיני את BloomOS למסך הבית"
      icon={
        /* phone with a download arrow */
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
          <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
          <path d="M12 7.5v6" />
          <path d="M9.5 11 12 13.5 14.5 11" />
        </svg>
      }
      action={
        <button
          type="button"
          onClick={install}
          disabled={busy}
          style={{
            appearance: "none",
            border: "none",
            borderRadius: "999px",
            padding: "9px 18px",
            background: "var(--pc, #5B3E67)",
            color: "var(--pc-contrast, #FFFFFF)",
            fontSize: "13px",
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          התקנה
        </button>
      }
    >
      תיפתח במסך מלא, בלי שורת הכתובת, עם אייקון משלה במסך הבית.
    </InstallBannerCard>
  );
}
