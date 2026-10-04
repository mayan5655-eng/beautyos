import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import PWARegister from "./pwa-register";
import IOSInstallBanner from "./ios-install-banner";
import InstallPromptBanner from "./install-prompt-banner";
import { APP_URL } from "@/lib/appUrl";

// ── Self-hosted, not next/font/google ───────────────────────────────────────
//
// A Vercel deploy died here: Turbopack (Next 16.2.4) failed to resolve
// next/font/google's internal font-fetch module after restoring a build
// cache from a previous deployment - 18 errors, one per Assistant
// weight/subset combination, all the same "Module not found:
// @vercel/turbopack-next/internal/font/google/font". A Google Fonts fetch at
// build time was a single point of failure the deploy pipeline had no
// business depending on - if it breaks again, for any reason, on any
// weight, it takes the whole build down with it, silently, the way this one
// did (production kept serving the OLD commit; nothing here even hinted a
// deploy had failed until it was reported by hand).
//
// Files: /fonts/*.woff2 (repo root, sibling to app/), fetched once from
// Google's own font source repo (github.com/google/fonts, same files their
// CDN subsets FROM - full Hebrew+Latin coverage, nothing lost) and converted
// locally. Five of six are the ORIGINAL VARIABLE font - one file covers every
// weight the app uses via a weight RANGE, same as next/font/google produced
// under the hood; only Amatic SC ships as static weights (400/700), because
// that is what Google's own source repo has for it. Same CSS variable names
// as before (--font-cormorant, --font-heebo, --font-inter, --font-assistant,
// --font-frank, --font-script), so nothing downstream (lib/design/mapBranding.ts's
// FONTS map, every literal var(--font-*) reference) needed to change.
//
// Re-fetching later (a font family added, or Google revises one): re-run the
// same two steps - GitHub's raw TTF for the family, then a WOFF2 convert
// (wawoff2, `npm install --no-save wawoff2` - not a project dependency,
// nothing to keep installed for this) - no browser, no next/font/google,
// nothing that can silently fail a deploy.

// Elegant Latin serif for display headings (Latin glyphs only).
const cormorant = localFont({
  src: "../fonts/CormorantGaramond.woff2",
  variable: "--font-cormorant",
  weight: "500 700",
  display: "swap",
});

// Legacy Hebrew sans — kept so any lingering literal references keep resolving.
// preload off: privacy/terms/the design studio name it, the dashboard does not,
// and a preloaded font is fetched on every page whether the page uses it or not.
//
// All five files here were cut down by scripts/subset-fonts.mjs (2026-10-04):
// Latin-only for Inter/Cormorant, Hebrew+Latin for the rest, and the weight
// ranges below are the ranges the CSS can actually ask for.
const heebo = localFont({
  src: "../fonts/Heebo.woff2",
  variable: "--font-heebo",
  weight: "400 700",
  display: "swap",
  preload: false,
});

// Premium Latin UI face (numerals, prices, labels, Latin copy).
const inter = localFont({
  src: "../fonts/Inter.woff2",
  variable: "--font-inter",
  weight: "400 800",
  display: "swap",
});

// Modern Hebrew UI face — the workhorse for body/RTL copy.
const assistant = localFont({
  src: "../fonts/Assistant.woff2",
  variable: "--font-assistant",
  weight: "400 800",
  display: "swap",
});

// Elegant Hebrew display serif for headings — feminine, high-end, real Hebrew.
const frankRuhl = localFont({
  src: "../fonts/FrankRuhlLibre.woff2",
  variable: "--font-frank",
  weight: "500 900",
  display: "swap",
});

// Handwritten Hebrew accent for the public page (a script line in the hero and
// a sign-off in the about section). preload off: only that page uses it.
// Static weights, not variable - Google's own source repo has none for this one.
const script = localFont({
  src: [
    { path: "../fonts/AmaticSC-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/AmaticSC-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-script",
  display: "swap",
  preload: false,
});

// Handwritten Hebrew cursive for the Kalmea chrome's own small flourishes (the
// "שאלה אחת" card label in the botanical visual pass, design/target-today.html).
// A different font from --font-script above on purpose - that one is Amatic SC,
// reserved for the public booking page's accent; this is Gveret Levin, a
// flowing script, used only inside the dashboard. preload off: one small
// label, not above-the-fold critical text. Static weight - Google's source
// repo has only Regular for this family.
const hand = localFont({
  src: "../fonts/GveretLevin.woff2",
  variable: "--font-hand",
  weight: "400",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "Kalmea — Beauty Business OS",
  description: "Beauty Business OS",
  applicationName: "Kalmea",
  manifest: "/manifest.json",
  // No openGraph/twitter existed here before this rebrand - a share of the
  // bare root domain (not a tenant's /<slug> page, which has its own real
  // metadata in app/[slug]/page.tsx) previously had no preview image at all.
  openGraph: {
    type: "website",
    title: "Kalmea — Beauty Business OS",
    description: "Beauty Business OS",
    url: APP_URL,
    locale: "he_IL",
    siteName: "Kalmea",
    images: [{ url: "/og-1200x630.jpg", width: 1200, height: 630, alt: "Kalmea" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kalmea — Beauty Business OS",
    description: "Beauty Business OS",
    images: ["/og-1200x630.jpg"],
  },
  appleWebApp: {
    capable: true,
    title: "Kalmea",
    // "default" is an opaque light bar sitting ABOVE the app, which is the
    // other half of why an install does not look fullscreen.
    // "black-translucent" hands the status bar area to our own content, so the
    // header's background runs all the way to the top of the screen.
    //
    // This only works BECAUSE viewportFit is "cover" below. On its own it would
    // put the header underneath the clock and battery: the insets that push it
    // clear are the same ones that stay 0px without viewport-fit. The two are a
    // pair and must never be split.
    statusBarStyle: "black-translucent",

    // ── Launch images ────────────────────────────────────────────────────────
    // iOS has NO fallback here: with no matching image it shows a blank white
    // screen from tap until first paint. That moment is most of what "doesn't
    // feel native" means, and she sees it every time she opens her business.
    //
    // iOS does not scale these. It matches one exactly on device width, height
    // and pixel ratio, so this is a list of device geometries rather than a set
    // of sizes - miss one and that device gets white. Regenerate with
    // scripts/generate-splash.mjs, which prints this array.
    //
    // Portrait only, deliberately: landscape would double the count for a case
    // that barely happens on a phone held one-handed, and a missing landscape
    // image costs exactly what we have today rather than breaking anything.
    startupImage: [
      { url: "/splash/splash-1320x2868.png", media: "(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/splash-1290x2796.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/splash-1284x2778.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/splash-1206x2622.png", media: "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/splash-1179x2556.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/splash-1170x2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/splash-1125x2436.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/splash-1242x2688.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/splash-828x1792.png",  media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
      { url: "/splash/splash-1242x2208.png", media: "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/splash/splash-750x1334.png",  media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    ],
  },
  icons: {
    // app/favicon.ico covers the .ico convention automatically; this adds a
    // PNG favicon for the browsers that prefer one, sized the usual 32x32.
    icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: "/icons/apple-touch-icon.png",
  },

  // ── The tag that actually turns standalone on ─────────────────────────────
  //
  // appleWebApp.capable above makes Next emit <meta name="mobile-web-app-capable">
  // and nothing else. That is the modern, cross-browser name, and it is the
  // correct thing for Next to prefer - but iOS Safari still reads the
  // apple-prefixed one, and without it a home-screen launch opens in a normal
  // Safari tab with the address bar showing. Which is exactly what happened:
  // viewport-fit and the status bar style were both landing correctly, and the
  // app still was not running standalone, because iOS never entered that mode
  // to begin with.
  //
  // There is no field for it - `capable` owns that slot - so it goes through
  // `other`, which emits a raw meta tag. The two names coexist happily: any
  // browser that reads the unprefixed one keeps doing so.
  //
  // Verify in the BUILT html, not here:
  //   grep -o '<meta name="apple-mobile-web-app-capable"[^>]*>' .next/server/app/login.html
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  // ── theme-color: the header's colour, not the brand's ──────────────────
  //
  // This paints the browser/status-bar strip directly ABOVE the header, so
  // its only job is to be invisible against it. The header is tinted GLASS:
  //
  //   beautyos.jsx @media (max-width:680px)
  //     .app-header background linear-gradient(180deg,
  //       color-mix(in srgb, var(--pc) 13%, rgba(255,255,255,0.74)), ...)
  //
  // 13% accent in 74%-opaque white, composited over BRAND_WASH's cream (the
  // wash's inner 26% is flat CREAM, now Kalmea's paper #FDFBF9 - skipTop
  // keeps the blossoms out from behind the header too), approximates to
  // #E9EBEA - a pale, barely-green neutral. "Approximates" because the
  // header's own backdrop-filter saturate(1.2) shifts the result slightly
  // further than flat alpha compositing predicts, the same way the old
  // value (#EAE5E9) was itself read off the rendered page rather than
  // computed by hand - worth a glance against a real build before trusting
  // the hex to the pixel.
  //
  // Keep in lockstep with public/manifest.json theme_color, and re-derive if
  // the .app-header gradient changes.
  //
  // UNLIKE before the Kalmea rebrand, this is no longer an approximation
  // that drifts per tenant: --pc used to be overwritten from
  // settings.primary_color, so a tenant on a custom accent got a header this
  // missed by however far her colour sat from the default. Stage 2 fixed
  // --pc to Kalmea's deep green for the whole dashboard shell regardless of
  // her choice, so this static value now matches the real header exactly,
  // for every tenant, not just the unthemed default.
  //
  // Pale, so the status bar icons must go dark: that follows from the
  // luminance automatically, and needs no colorScheme declaration.
  themeColor: "#E9EBEA",

  // ── viewportFit: "cover" — the line that makes the app fullscreen on iPhone ──
  //
  // Without it iOS emits width=device-width, initial-scale=1 and nothing else,
  // which does two things:
  //
  //   1. The web view is letterboxed INSIDE the safe area. It never reaches
  //      under the notch or past the home indicator, so a home-screen install
  //      looks like a web page in a frame rather than an app.
  //   2. Every env(safe-area-inset-*) resolves to 0px.
  //
  // (2) matters more than it looks, because this codebase already carries the
  // safe-area handling and it has never once executed:
  //
  //     beautyos.jsx  .app-main    padding-bottom calc(74px + env(...-bottom))
  //     beautyos.jsx  .app-header  padding-top    env(...-top)
  //     beautyos.jsx  bottom nav   padding-bottom env(...-bottom)
  //
  // All three are inside @media (max-width:680px), so this is mobile-only, and
  // all three start doing something the moment this property exists. Layout
  // that has never actually run will move - which is exactly why this ships on
  // its own, ahead of splash screens and the native-feel CSS.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={[
        cormorant.variable,
        heebo.variable,
        inter.variable,
        assistant.variable,
        frankRuhl.variable,
        script.variable,
        hand.variable,
        "h-full antialiased",
      ].join(" ")}
    >
      <body className="min-h-full flex flex-col relative">
        {/* Chromium fires beforeinstallprompt early - routinely before React
            has hydrated - and the event is gone the moment it goes unhandled.
            Catching it here, ahead of any app code, is what leaves
            install-prompt-banner.tsx something to offer: the banner reads the
            stash on mount, or waits for the re-announcement if it lands later.

            A bare <script>, NOT next/script. `strategy="beforeInteractive"` is
            what the docs point at and it does not work here - on 16.2.4 the
            inline body never reaches <head>, it is only serialised into the
            RSC payload, so it runs no earlier than hydration and the whole
            point is lost. React renders this one into the streamed HTML where
            it executes during parse - top of <body>, ahead of every bundle.
            Verify a REAL tag in the BUILT html, not here; next/script put its copy
            in the RSC payload only, which greps the same and runs far too late:
              grep -o '<script id="capture-install-prompt">' .next/server/app/login.html
            (any prerendered page will do). */}
        <script
          id="capture-install-prompt"
          dangerouslySetInnerHTML={{
            __html: `(function(){window.__bloomosInstallPrompt=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__bloomosInstallPrompt=e;window.dispatchEvent(new Event('bloomos:installprompt'))})})();`,
          }}
        />
        <PWARegister />
        {children}
        <IOSInstallBanner />
        <InstallPromptBanner />
      </body>
    </html>
  );
}
