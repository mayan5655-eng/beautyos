// app/api/vouchers/image/route.tsx
//
// PUBLIC, read only: the gift voucher as an image, in her design (lib/og/voucherImage.tsx).
//   GET ?k=<token>            one voucher, 1080x1350, display fields only (exactly what /v/<token> shows). For the buyer to share.
//   GET ?shop=<tenant>&f=story  an Instagram story for her shop, 1080x1920: her design, amounts and the shop address. Only when the
//                             shop exists (gift vouchers on, migration run, business open).
// Rate limited like the voucher page. The design is re-validated on the way in (voucherConfig -> sanitizeDesign), and the only
// image fetched is her own validated upload or her logo from her branding.
import { APP_URL } from '@/lib/appUrl';
import { checkIpLimit } from '@/lib/rateLimit';
import { loadPublicVoucher } from '@/lib/giftVoucherView';
import { loadVoucherShop } from '@/lib/giftVoucherShop';
import { resolveBranding } from '@/lib/branding';
import { voucherLook, storageHostOf } from '@/lib/giftVoucherDesign';
import { voucherConfig } from '@/lib/giftVouchers';
import { allowedImageUrl } from '@/lib/og/tenantOg';
import { renderVoucherImage, loadImageData } from '@/lib/og/voucherImage';
import { admin } from '../../grow/_shared';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const nope = (status: number) => new Response('not found', { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const limited = checkIpLimit(request, 'voucher-view');
  if (limited) return limited;
  const u = new URL(request.url);
  const origin = u.origin;
  const host = storageHostOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  try {
    const shop = u.searchParams.get('shop');
    if (shop) {
      if (!UUID_RE.test(shop)) return nope(404);
      const s = await loadVoucherShop(admin(), shop, process.env, APP_URL);
      if (!s.visible || !s.settings) return nope(404);
      const cfg = voucherConfig(s.settings as never, shop, host);
      const brand = resolveBranding(s.settings);
      const look = voucherLook(cfg.design, brand.primary);
      const [logo, bg] = await Promise.all([allowedImageUrl(brand.logoUrl) ? loadImageData(brand.logoUrl) : null, look.image ? loadImageData(look.image) : null]);
      const address = s.slug ? `${APP_URL.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/${s.slug}/gift` : '';
      const amounts = s.options.filter((o) => o.kind === 'amount').map((o) => o.label).slice(0, 4);
      return await renderVoucherImage(origin, look, { businessName: brand.businessName, logo, background: bg, title: 'שובר מתנה', amounts, address, tagline: 'המתנה המושלמת למי שאת אוהבת' }, 'story',
        { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600', 'Content-Disposition': 'inline; filename="gift-voucher-story.png"' });
    }
    const st = await loadPublicVoucher(admin(), u.searchParams.get('k') || '');
    if (st.state !== 'ready') return nope(404);
    const v = st.voucher;
    const look = voucherLook(st.design, st.brand.primary);
    const [logo, bg] = await Promise.all([allowedImageUrl(st.brand.logoUrl) ? loadImageData(st.brand.logoUrl) : null, look.image ? loadImageData(look.image) : null]);
    const money = (n: number) => `₪${(Math.round(n * 100) / 100).toLocaleString('en-US')}`;
    return await renderVoucherImage(origin, look, {
      businessName: st.brand.name, logo, background: bg, recipientName: v.recipientName,
      title: v.kind === 'service' && v.serviceName ? v.serviceName : money(v.initial),
      sub: v.kind === 'service' ? `בשווי ${money(v.initial)}` : undefined,
      message: v.message, fromName: v.fromName, code: v.status === 'active' ? v.code : undefined,
    }, 'voucher', { 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="gift-voucher.png"' });
  } catch (e) {
    console.error('[vouchers] image failed:', (e as Error)?.message);
    return new Response('image unavailable', { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
