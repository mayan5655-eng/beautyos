// app/PublicAnalytics.tsx
//
// Vercel Web Analytics, on the PUBLIC marketing pages only (the landing page, signup, the tutorials): how many visitors and where they
// came from (referrer, utm_source), for the owner (2026-11-03). Cookieless, no personal data, so no consent banner is needed.
// Deliberately NOT in app/layout.tsx: the app's other addresses carry secrets in the URL (/pay/<token>, /confirm?t=, /c/<token>,
// /claim/<token>) and the dashboard is hers alone, none of which belongs in an analytics report.
// The script is Vercel's own, served from this site (/_vercel/insights/script.js) once Analytics is enabled for the project, so the
// Content-Security-Policy ('self') already allows it; until it is enabled the request simply 404s and nothing else changes.
//
// The owner's own visits (2026-11-04): opening any of these pages once with ?no-track=1 marks THAT browser (localStorage
// "kl_no_track"), and from then on the script is never loaded there, so her checks do not count as visitors. ?track=1 undoes it.
// Per device and browser; a blocked or cleared storage simply means the visit is counted, as before.
import Script from "next/script";

export const NO_TRACK_KEY = "kl_no_track";
export const ANALYTICS_SRC = "/_vercel/insights/script.js";

const LOADER = `(function(){try{var q=location.search;if(/[?&]no-track=1(&|$)/.test(q))localStorage.setItem("${NO_TRACK_KEY}","1");if(/[?&]track=1(&|$)/.test(q))localStorage.removeItem("${NO_TRACK_KEY}");if(localStorage.getItem("${NO_TRACK_KEY}")==="1")return;}catch(e){}window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};var s=document.createElement("script");s.src="${ANALYTICS_SRC}";s.defer=true;document.head.appendChild(s);})();`;

export default function PublicAnalytics() {
  return <Script id="va-loader" strategy="afterInteractive">{LOADER}</Script>;
}
