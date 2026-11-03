// app/PublicAnalytics.tsx
//
// Vercel Web Analytics, on the PUBLIC marketing pages only (the landing page, signup, the tutorials): how many visitors and where they
// came from (referrer, utm_source), for the owner (2026-11-03). Cookieless, no personal data, so no consent banner is needed.
// Deliberately NOT in app/layout.tsx: the app's other addresses carry secrets in the URL (/pay/<token>, /confirm?t=, /c/<token>,
// /claim/<token>) and the dashboard is hers alone, none of which belongs in an analytics report.
// The script is Vercel's own, served from this site (/_vercel/insights/script.js) once Analytics is enabled for the project, so the
// Content-Security-Policy ('self') already allows it; until it is enabled the request simply 404s and nothing else changes.
import Script from "next/script";

export default function PublicAnalytics() {
  return (
    <>
      <Script id="va-queue" strategy="afterInteractive">{`window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};`}</Script>
      <Script src="/_vercel/insights/script.js" strategy="afterInteractive" />
    </>
  );
}
