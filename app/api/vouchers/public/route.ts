// app/api/vouchers/public/route.ts
//
// PUBLIC, read only.
//   GET ?k=<token>      the voucher page's state (lib/giftVoucherView.ts): display fields only, scoped by the 192-bit token. The
//                       buyer's page polls this while Grow confirms her payment.
//   GET ?shop=<tenant>  is online purchase open for this business? { online, href }. The small link on her public page asks this
//                       after it loads, so her page never waits on it.
// Nothing here writes, except issuing a voucher whose payment the database already holds as paid (the safety net in giftVoucherView).
import { NextResponse } from 'next/server';
import { APP_URL } from '@/lib/appUrl';
import { checkIpLimit } from '@/lib/rateLimit';
import { loadPublicVoucher } from '@/lib/giftVoucherView';
import { loadVoucherShop } from '@/lib/giftVoucherShop';
import { admin } from '../../grow/_shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const limited = checkIpLimit(request, 'voucher-view');
  if (limited) return limited;
  const u = new URL(request.url);
  const shop = u.searchParams.get('shop');
  try {
    if (shop) {
      if (!UUID_RE.test(shop)) return json({ online: false });
      const s = await loadVoucherShop(admin(), shop, process.env, APP_URL);
      return json({ online: s.online, href: s.online && s.slug ? `/${encodeURIComponent(s.slug)}/gift` : null });
    }
    const st = await loadPublicVoucher(admin(), u.searchParams.get('k') || '');
    return json(st, st.state === 'unknown' ? 404 : 200);
  } catch (e) {
    console.error('[vouchers] public read failed:', (e as Error)?.message);
    return json({ state: 'error' }, 500);
  }
}
