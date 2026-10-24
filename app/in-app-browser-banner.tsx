"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import InstallBannerCard from "./InstallBannerCard";
import { inAppBrowser, isIos, openInBrowserHref } from "@/lib/design/sharePost";

const DISMISS_KEY = "kalmea-inapp-dismissed";
const APP_HE: Record<string, string> = { instagram: "אינסטגרם", facebook: "פייסבוק", whatsapp: "וואטסאפ", tiktok: "טיקטוק", line: "LINE" };

// Her own screens. The public booking page is left alone: her clients book from inside Instagram all the time, and a
// booking works fine there.
const OWNER_PATHS = ["/dashboard", "/login", "/signup", "/onboarding", "/reset-password"];

/**
 * Kalmea opened inside Instagram's / Facebook's / WhatsApp's own browser (2026-10-24: a customer could not add it to
 * her home screen, download a post or share one - all three are impossible in there, and nothing told her).
 * Tells her where she is and gets her out: a button that opens the page in Safari (iPhone, iOS 17+) or Chrome
 * (Android), and "copy the link" for every phone where that trick does not work. Dismissible for this visit only:
 * she will be back in the in-app browser the next time she taps a link, and the hint should be too.
 * Server-renders nothing, so there is no hydration mismatch.
 */
export default function InAppBrowserBanner() {
  const pathname = usePathname() || "";
  const [app, setApp] = useState<string | null>(null);
  const [enter, setEnter] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ua, setUa] = useState("");

  useEffect(() => {
    if (!OWNER_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) { setApp(null); return; }
    const u = window.navigator.userAgent;
    const which = inAppBrowser(u);
    let dismissed = false;
    try { dismissed = window.sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { /* storage blocked */ }
    if (which && !dismissed) {
      setUa(u);
      setApp(which);
      requestAnimationFrame(() => setEnter(true));
    }
  }, [pathname]);

  function dismiss() {
    try { window.sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* just hide for now */ }
    setEnter(false);
    window.setTimeout(() => setApp(null), 220);
  }

  if (!app) return null;

  const url = `${window.location.origin}${window.location.pathname}`;
  const ios = isIos(ua);
  const href = openInBrowserHref(ua, url);
  const browser = ios ? "ספארי" : "כרום";
  const copy = () => {
    const done = () => setCopied(true);
    try { navigator.clipboard?.writeText ? navigator.clipboard.writeText(url).then(done, () => window.prompt("העתיקי את הקישור:", url)) : window.prompt("העתיקי את הקישור:", url); } catch { window.prompt("העתיקי את הקישור:", url); }
  };
  const btn: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 40, padding: "8px 14px", borderRadius: 10, fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", textDecoration: "none" };

  return (
    <InstallBannerCard
      ariaLabel="פתיחה בדפדפן של הטלפון"
      enter={enter}
      onDismiss={dismiss}
      title={`פתחי את Kalmea ב${browser}`}
      icon={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="m15.5 8.5-2 5-5 2 2-5z" />
        </svg>
      }
      action={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }} data-testid="inapp-actions">
          {href && <a href={href} style={{ ...btn, background: "var(--k-green, #1F3A30)", color: "#fff" }}>פתיחה ב{browser}</a>}
          <button type="button" onClick={copy} style={{ ...btn, background: "transparent", color: "inherit", border: "1px solid currentColor" }}>{copied ? "הקישור הועתק ✓" : "העתקת הקישור"}</button>
        </div>
      }
    >
      את בתוך הדפדפן של {APP_HE[app] || app}. כאן אי אפשר להוסיף את Kalmea למסך הבית, ושמירה ושיתוף של פוסטים לא עובדים.
      <span style={{ display: "block", marginTop: "3px", opacity: 0.85 }}>
        {ios
          ? `אם הכפתור לא פותח: לחצי על ⋯ או על סמל המצפן ← "פתיחה בספארי", או העתיקי את הקישור והדביקי בספארי.`
          : `אם הכפתור לא פותח: לחצי על ⋮ ← "פתיחה בדפדפן", או העתיקי את הקישור והדביקי בכרום.`}
      </span>
    </InstallBannerCard>
  );
}
