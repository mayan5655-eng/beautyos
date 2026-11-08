// app/api/products/public/route.ts
//
// PUBLIC, read only. GET ?t=<tenant>&s=<scan link signature>: the products she tagged for the home routine, for the skin-scan
// result page to match against the client's routine (lib/products.ts recommendProducts). Display fields only (lib/productPublic.ts).
// Only her SIGNED scan link opens it (the same signature the scanner itself requires), rate limited per address and per business,
// and a closed business shows none. Nothing here writes, and nothing is sold online: the page links to her WhatsApp.
import { NextResponse } from 'next/server';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { verifyScanLink } from '@/lib/scanToken';
import { tenantIsBlocked } from '@/lib/tenantActive';
import { loadPublicProducts } from '@/lib/productPublic';
import { admin } from '../../grow/_shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const limited = checkIpLimit(request, 'products-view');
  if (limited) return limited;
  const u = new URL(request.url);
  const tenantId = u.searchParams.get('t') || '';
  if (!UUID_RE.test(tenantId) || !verifyScanLink(tenantId, u.searchParams.get('s'))) return json({ products: [] }, 403);
  const tLimited = checkTenantLimit(tenantId, 'products-view');
  if (tLimited) return tLimited;
  try {
    const db = admin();
    if (await tenantIsBlocked(db, tenantId)) return json({ products: [] });
    return json({ products: await loadPublicProducts(db, tenantId) });
  } catch (e) {
    console.error('[products] public route failed:', (e as Error)?.message);
    return json({ products: [] }, 500);
  }
}
