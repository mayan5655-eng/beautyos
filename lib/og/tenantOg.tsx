// lib/og/tenantOg.tsx
//
// The link preview of a tenant's public page: the 1200x630 image WhatsApp, Instagram
// and Facebook show when she shares her booking link.
//
// Built on request by app/og/[key]/route.tsx and cached at the CDN (s-maxage), never
// stored per tenant: nothing to migrate, nothing to clean up when she leaves, and the
// image follows her page. Her page's metadata puts a content hash in the URL (?v=), so
// a changed photo, name or colour is a NEW url and a link scraper cannot keep serving
// the old picture from its own cache.
//
// What it shows, in order of what she has:
//   * her photo (the 1200x630 crop written at upload, else her hero), full bleed, with her
//     name over a gradient in her own deep colour, her accent as the bar and the button,
//     and her logo in the corner;
//   * nothing uploaded: the Kalmea banner, with her business name across the top.
// Her colours, not Kalmea's: settings.primary_color is hers on every public surface.

import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';
import { fetchPublicSettings, resolveBranding } from '@/lib/branding';
import { rtlLines, visualRtl } from './visualRtl';

export const OG_SIZE = { width: 1200, height: 630 } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const publicClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

type Brand = ReturnType<typeof resolveBranding>;

/** slug (or a tenant uuid, for the old /book?t= links) -> her public branding. null = no such business. */
export async function brandFor(key: string): Promise<{ id: string; brand: Brand; tenantName: string } | null> {
  let k = key;
  try { k = decodeURIComponent(key); } catch { /* keep as given */ }
  const db = publicClient();
  let id: string | null = null;
  let tenantName = '';
  if (UUID.test(k)) {
    id = k;
  } else {
    const { data, error } = await db.rpc('get_public_tenant_by_slug', { p_slug: k });
    if (error) throw new Error(`tenant lookup failed: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    id = row.id;
    tenantName = row.name || '';
  }
  const settings = await fetchPublicSettings(db, id!);
  if (!settings) return null;
  return { id: id!, brand: resolveBranding(settings), tenantName };
}

/** A short stable hash of what the image shows: goes in the URL so a change is a new URL. */
export function ogVersion(brand: Brand, name: string): string {
  const s = [name, brand.portraitOgUrl, brand.portraitUrl, brand.heroImageUrl, brand.logoUrl, brand.primary].join('|');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Only her own uploads: https, on our Supabase storage host. The URL is read from her settings,
// so it is not trusted to point anywhere else (the server would fetch it).
export function allowedImageUrl(u: string): boolean {
  try {
    const url = new URL(u);
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.invalid').host;
    return url.protocol === 'https:' && url.host === host;
  } catch {
    return false;
  }
}

/** Fetch an image as a data URI the renderer can embed; null if it is missing, too big or not jpeg/png. */
async function loadImage(u: string): Promise<string | null> {
  if (!u || !allowedImageUrl(u)) return null;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const type = (r.headers.get('content-type') || '').split(';')[0].trim();
    if (type !== 'image/jpeg' && type !== 'image/png') return null; // the renderer cannot draw webp
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 3_000_000) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

const assets = new Map<string, Promise<ArrayBuffer>>();
function asset(origin: string, path: string): Promise<ArrayBuffer> {
  if (!assets.has(path)) {
    const p = fetch(new URL(path, origin)).then((r) => {
      if (!r.ok) throw new Error(`asset ${path}: ${r.status}`);
      return r.arrayBuffer();
    });
    p.catch(() => assets.delete(path)); // a failed fetch must not be remembered
    assets.set(path, p);
  }
  return assets.get(path)!;
}

const CACHE = 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400';

// Font size from the longest of her (at most two) lines.
const fitName = (longest: number) => (longest <= 14 ? 96 : longest <= 20 ? 80 : longest <= 26 ? 66 : 54);

/**
 * PNG -> JPEG. A photo as PNG came out at ~1 MB, and WhatsApp drops preview images that heavy;
 * the same picture is ~150 KB as JPEG. sharp ships with Next but only as an optional dependency, so
 * if it cannot load we serve the PNG rather than no image.
 */
async function asJpeg(res: Response): Promise<Response> {
  const png = Buffer.from(await res.arrayBuffer());
  try {
    const sharp = (await import('sharp')).default;
    const jpg = await sharp(png).flatten({ background: '#FBF8F1' }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
    return new Response(new Uint8Array(jpg), { status: 200, headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': CACHE } });
  } catch (e) {
    console.error('[og] jpeg encode unavailable, serving png:', e instanceof Error ? e.message : String(e));
    return new Response(new Uint8Array(png), { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': CACHE } });
  }
}

export async function renderTenantOg(origin: string, found: { brand: Brand; tenantName: string } | null) {
  const [frank, assistant] = await Promise.all([
    asset(origin, '/design-fonts/FrankRuhlLibre-700.ttf'),
    asset(origin, '/design-fonts/Assistant-600.ttf'),
  ]);
  const fonts = [
    { name: 'Frank', data: frank, weight: 700 as const, style: 'normal' as const },
    { name: 'Assistant', data: assistant, weight: 600 as const, style: 'normal' as const },
  ];
  // CDN-cached ten minutes, then served stale while it refreshes: her page changes show up
  // quickly, and a burst of shares does not re-render per tenant per request.
  const headers = { 'Cache-Control': CACHE };

  const brand = found?.brand;
  const name = (brand?.businessName || found?.tenantName || '').slice(0, 70);
  const photo = brand ? (await loadImage(brand.portraitOgUrl)) || (await loadImage(brand.heroImageUrl)) || (await loadImage(brand.portraitUrl)) : null;
  const logo = brand ? await loadImage(brand.logoUrl) : null;
  const accent = brand?.primary || '#1F3A30';
  const deep = brand?.deep || '#1F3A30';
  const onAccent = brand?.onPrimary || '#FFFFFF';

  // ── nothing uploaded (or no such business): the Kalmea banner, her name across the top ──
  if (!photo) {
    const banner = `data:image/jpeg;base64,${Buffer.from(await asset(origin, '/og-1200x630.jpg')).toString('base64')}`;
    const bannerName = rtlLines(name, 34, 1)[0] || '';
    return asJpeg(new ImageResponse(
      (
        <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#FBF8F1' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={banner} width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0 }} alt="" />
          {bannerName ? (
            <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 112, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FBF8F1', borderBottom: `5px solid ${accent}` }}>
              <div style={{ fontFamily: 'Frank', fontWeight: 700, fontSize: name.length <= 24 ? 64 : 52, color: deep, display: 'flex' }}>{bannerName}</div>
            </div>
          ) : null}
        </div>
      ),
      { ...OG_SIZE, fonts, headers }
    ));
  }

  // ── her photo ──
  const lines = rtlLines(name, 26, 2);
  const size = fitName(Math.max(1, ...lines.map((l) => l.length)));
  return asJpeg(new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: deep }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} width={1200} height={630} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} alt="" />
        <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 630, display: 'flex', background: `linear-gradient(to top, ${deep}F2 0%, ${deep}B8 34%, ${deep}00 70%)` }} />
        <div style={{ position: 'absolute', top: 0, left: 0, width: 1200, height: 12, display: 'flex', background: accent }} />
        {logo ? (
          <div style={{ position: 'absolute', top: 40, left: 40, width: 132, height: 132, borderRadius: 66, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={104} height={104} style={{ objectFit: 'contain' }} alt="" />
          </div>
        ) : null}
        <div style={{ position: 'absolute', right: 64, left: 64, bottom: 56, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {lines.map((l, i) => (
            <div key={i} style={{ fontFamily: 'Frank', fontWeight: 700, fontSize: size, color: '#FFFFFF', lineHeight: 1.12, display: 'flex' }}>{l}</div>
          ))}
          <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', padding: '12px 30px', borderRadius: 40, background: accent, color: onAccent, fontFamily: 'Assistant', fontWeight: 600, fontSize: 30 }}>{visualRtl('קביעת תור אונליין')}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts, headers }
  ));
}
