import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Heebo, Inter, Assistant, Frank_Ruhl_Libre } from "next/font/google";
import "./globals.css";
import PWARegister from "./pwa-register";
import IOSInstallBanner from "./ios-install-banner";
import InstallPromptBanner from "./install-prompt-banner";

// Elegant Latin serif for display headings (Latin glyphs only).
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Legacy Hebrew sans — kept so any lingering literal references keep resolving.
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Premium Latin UI face (numerals, prices, labels, Latin copy).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

// Modern Hebrew UI face — the workhorse for body/RTL copy.
const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

// Elegant Hebrew display serif for headings — feminine, high-end, real Hebrew.
const frankRuhl = Frank_Ruhl_Libre({
  variable: "--font-frank",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: "BloomOS — Beauty Business OS",
  description: "Beauty Business OS",
  applicationName: "BloomOS",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "BloomOS",
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
  // its only job is to be invisible against it. Both halves of it used to be
  // a raw brand purple - #4A2E5A here, #5B3E67 in the manifest - and neither
  // is a colour the header has ever painted. The header is tinted GLASS:
  //
  //   beautyos.jsx @media (max-width:680px)
  //     .app-header background linear-gradient(180deg,
  //       color-mix(in srgb, var(--pc) 13%, rgba(255,255,255,0.74)), ...)
  //
  // 13% accent in 74%-opaque white is rgba(227.45,222.58,229.46,0.7738). What
  // it composites OVER is BRAND_WASH's cream, not --bg: the wash is a radial
  // whose inner 26% is flat CREAM #FEFAF7, and the header sits well inside
  // that (skipTop keeps the blossoms out from behind it too). Through the
  // header's own backdrop-filter saturate(1.2) that cream reads #FFFAF6, and
  // the gradient over it resolves to #EAE5E9 - a pale mauve.
  //
  // So the two purples were not disagreeing with each other so much as both
  // disagreeing with the app: a dark bar sat on top of a near-white header.
  // Matching the render is what removes the seam, and it is what iOS already
  // does on its own, since black-translucent runs the real header gradient up
  // under the clock - .app-header takes padding-top:env(safe-area-inset-top),
  // so it is literally the top stop that paints behind the status bar.
  //
  // Keep in lockstep with public/manifest.json theme_color, and re-derive if
  // the .app-header gradient changes.
  //
  // Only the DEFAULT accent is baked in here. --pc is overwritten at runtime
  // from settings.primary_color, so a tenant on a custom accent gets a header
  // this misses by however far her colour sits from #5B3E67. Both of these are
  // static files, so that is not fixable here; it would want a per-tenant
  // <meta name="theme-color"> emitted once her accent is known.
  //
  // Pale, so the status bar icons must go dark: that follows from the
  // luminance automatically, and needs no colorScheme declaration.
  themeColor: "#EAE5E9",

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
