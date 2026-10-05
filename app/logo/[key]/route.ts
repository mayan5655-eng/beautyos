// app/logo/[key]/route.ts
//
// GET /logo/<slug | tenant id>  ->  that business's logo, with a white background taken out.
//
// Her logo as uploaded is often an opaque JPEG on white (see lib/logoKnockout.ts for the whole
// story). Public pages draw it from here instead of straight from storage, so a logo that has
// a white box in the file stops having one on screen. Built on request and cached at the CDN
// for a day; the page puts a hash of the logo's URL in ?v= so a new logo is a new URL. Nothing
// is stored per tenant, and her uploaded file is never modified.
//
// A logo that is already a real cut-out, or has no white border, is served as it is. Whatever
// goes wrong - no logo, sharp missing, a fetch that fails - the answer is a redirect to the
// original, never a broken image: the page looks as it did before, not worse.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { brandFor, allowedImageUrl } from '@/lib/og/tenantOg';
import { knockOutWhiteBackground } from '@/lib/logoKnockout';

const CACHE = 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  let original = '';
  try {
    const found = await brandFor(key);
    original = found?.brand.logoUrl || '';
    if (!original || !allowedImageUrl(original)) return new Response('no logo', { status: 404, headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60' } });

    const r = await fetch(original, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`logo fetch ${r.status}`);
    const type = (r.headers.get('content-type') || '').split(';')[0].trim();
    if (type !== 'image/jpeg' && type !== 'image/png') return NextResponse.redirect(original, { status: 307, headers: { 'Cache-Control': CACHE } }); // svg / webp: leave as is
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > 6_000_000) return NextResponse.redirect(original, { status: 307, headers: { 'Cache-Control': CACHE } });

    const sharp = (await import('sharp')).default;
    const cut = await knockOutWhiteBackground(bytes, sharp as never);
    if (!cut) return new Response(new Uint8Array(bytes), { status: 200, headers: { 'Content-Type': type, 'Cache-Control': CACHE } });
    return new Response(new Uint8Array(cut.png), { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': CACHE } });
  } catch (e) {
    console.error('[logo] falling back to the original for', key, e instanceof Error ? e.message : String(e));
    if (original && allowedImageUrl(original)) return NextResponse.redirect(original, { status: 307, headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60' } });
    return new Response('logo unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
