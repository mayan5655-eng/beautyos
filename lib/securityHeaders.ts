// lib/securityHeaders.ts
//
// The response headers every page and route gets, built in one place so they
// can be read, argued with, and tested without a browser.
//
// ── Why there were none ────────────────────────────────────────────────────
// next.config.ts had no headers() at all. So the booking page could be framed
// by any site (a clickjack over "confirm my appointment" is a real attack on
// a page whose whole job is one button), nothing pinned the transport, and
// the browser was free to sniff types. The seven-lens review listed this as
// one afternoon; this is that afternoon.
//
// ── What the policy has to allow, and where each line comes from ──────────
//   script-src   'self' plus 'unsafe-inline': Next 16 emits inline scripts
//                for hydration and the install-prompt catcher in layout.tsx
//                is a bare inline <script> by design. No nonce yet - that is
//                a later tightening, not a blocker. cdnjs.cloudflare.com for
//                html2canvas, which PostDesigner.tsx loads from there.
//                'unsafe-eval' in development only, for React Refresh.
//   style-src    'unsafe-inline' because the app is inline-styled end to end;
//                fonts.googleapis.com for the @import in three style blocks.
//   font-src     fonts.gstatic.com for those, data: for next/font inlining.
//   img-src      https: broadly - Unsplash, Supabase Storage public URLs and
//                signed URLs, Facebook profile pictures - plus blob: and data:
//                for canvases and previews. Images are the low-risk class.
//   media-src    blob: for the reel studio's player.
//   connect-src  the Supabase project (REST, auth, storage, realtime) and
//                Sentry ingest. The Supabase host is read from
//                NEXT_PUBLIC_SUPABASE_URL at build so a custom domain works;
//                *.supabase.co stays as the fallback. ws: in development for
//                hot reload.
//   worker-src   'self' for the service worker, blob: for anything a library
//                spins up.
//   frame-src    'none': nothing on this product is embedded. The Facebook
//                share is a popup, not a frame.
//   frame-ancestors 'none': the point. Also sent as X-Frame-Options DENY for
//                the browsers that still read it.
//
// Anything blocked shows in the browser console as a CSP violation naming
// the directive, so a future addition that breaks is loud, not silent.

export type HeaderPair = { key: string; value: string };

function supabaseOrigin(env: Record<string, string | undefined>): string | null {
  const raw = String(env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/** The Content-Security-Policy value. */
export function buildCsp(opts: { dev?: boolean; env?: Record<string, string | undefined> } = {}): string {
  const dev = !!opts.dev;
  const env = opts.env || process.env;
  const supabase = supabaseOrigin(env);
  const supabaseWs = supabase ? supabase.replace(/^https:/, 'wss:') : null;

  const connect = [
    "'self'",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    supabase,
    supabaseWs,
    'https://*.ingest.sentry.io',
    'https://*.ingest.us.sentry.io',
    'https://*.ingest.de.sentry.io',
    dev ? 'ws://localhost:*' : null,
    dev ? 'http://localhost:*' : null,
  ].filter(Boolean);

  // CE.SDK loads its engine (script + wasm + assets) from IMG.LY's CDN. Only
  // when the design studio's editor renderer is CE.SDK (NEXT_PUBLIC_DESIGN_
  // RENDERER=cesdk, app/design/renderers) or the reel POC is on
  // (NEXT_PUBLIC_CESDK_POC=1). Off, the CSP never names the vendor.
  const cesdkPoc = env.NEXT_PUBLIC_CESDK_POC === '1' || env.NEXT_PUBLIC_DESIGN_RENDERER === 'cesdk';
  const cesdkCdn = cesdkPoc ? ['https://cdn.img.ly'] : [];
  if (cesdkPoc) connect.push('https://cdn.img.ly');

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', ...(dev ? ["'unsafe-eval'"] : []), ...cesdkCdn, ...(cesdkPoc ? ["'wasm-unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:', ...cesdkCdn],
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'media-src': ["'self'", 'blob:', 'data:'],
    'connect-src': connect as string[],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(' ')}`);
  if (!dev) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

/** Every header, for next.config.ts's headers(). */
export function securityHeaders(opts: { dev?: boolean; env?: Record<string, string | undefined> } = {}): HeaderPair[] {
  const dev = !!opts.dev;
  const headers: HeaderPair[] = [
    { key: 'Content-Security-Policy', value: buildCsp(opts) },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // Camera for the skin scanner's photo input, microphone for voice booking,
    // both first-party only. Everything else off.
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()' },
    { key: 'X-DNS-Prefetch-Control', value: 'on' },
  ];
  // Two years, subdomains included. Not `preload`: that is a one-way door
  // submitted to a browser list, and it belongs to a decision about the
  // final domain, not a config file.
  if (!dev) headers.push({ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' });
  return headers;
}
