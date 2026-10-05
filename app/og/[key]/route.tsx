// app/og/[key]/route.tsx
//
// GET /og/<slug>  or  /og/<tenant uuid>  ->  a 1200x630 PNG: that tenant's link preview.
// Public on purpose (a link scraper has no session); see lib/og/tenantOg.tsx for what it
// draws and how it is cached. A lookup that FAILS answers 502 so the CDN does not cache a
// blank, while an unknown business gets the neutral Kalmea banner.

import type { NextRequest } from 'next/server';
import { brandFor, renderTenantOg } from '@/lib/og/tenantOg';

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const origin = new URL(request.url).origin;
  try {
    return await renderTenantOg(origin, await brandFor(key));
  } catch (e) {
    console.error('[og] failed for', key, e instanceof Error ? e.message : String(e));
    return new Response('og unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
