// app/[slug]/gift/page.tsx
//
// THE GIFT VOUCHER SHOP on her public page: kalmea.app/<slug>/gift. A visitor picks a voucher, writes her own name and phone, the
// friend's name and a message, and pays through Grow (app/api/vouchers/buy). What is on offer, and whether it can be paid for online
// at all, comes from lib/giftVoucherShop.ts, the same answer the purchase route checks again. Off (the platform flag, or her switch)
// is a plain 404; no Grow means an honest "buy it at the business" with her WhatsApp, never a button that cannot work.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { resolveBranding } from '@/lib/branding';
import { APP_URL } from '@/lib/appUrl';
import { loadVoucherShop } from '@/lib/giftVoucherShop';
import { waLink } from '@/lib/whatsappLink';
import GiftPurchase from './GiftPurchase';
import { voucherConfig } from '@/lib/giftVouchers';
import { storageHostOf } from '@/lib/giftVoucherDesign';
import { PublicPage, BusinessHeader, LineIcon } from '@/app/PublicChrome';
import { ICON_HEART } from '@/lib/brand';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

function decodeSlug(raw: string): string {
  try { return decodeURIComponent(raw); } catch { return raw; }
}

async function tenantOf(slug: string): Promise<{ id: string; name: string } | null> {
  // The same public lookup her page uses (SECURITY DEFINER, granted to anon): never a direct read of the tenants table.
  const { data, error } = await anon().rpc('get_public_tenant_by_slug', { p_slug: slug });
  if (error) throw new Error(`tenant lookup failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return row && row.id ? { id: String(row.id), name: String(row.name || '') } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = decodeSlug((await params).slug);
  const t = await tenantOf(slug).catch(() => null);
  const title = t?.name ? `שובר מתנה · ${t.name}` : 'שובר מתנה';
  return { title, description: 'שובר מתנה לטיפול או בסכום לבחירתך', robots: { index: false, follow: true }, alternates: { canonical: `/${slug}/gift` } };
}

export default async function GiftShopPage({ params }: Props) {
  const slug = decodeSlug((await params).slug);
  const tenant = await tenantOf(slug);
  if (!tenant) notFound();
  const shop = await loadVoucherShop(admin(), tenant.id, process.env, APP_URL);
  // The business exists but the voucher tables do not yet (the migration has not run). A direct visit used to land on
  // "לא מצאנו עסק", which is false and sends her client away thinking the business is gone. Still no shop, no link and no
  // button (owner decision), only the true sentence and the way back to her page.
  if (!shop.visible && shop.reason === 'no-migration') return <VouchersNotYet slug={slug} tenantName={tenant.name} settings={shop.settings} />;
  if (!shop.visible) notFound();
  const b = resolveBranding(shop.settings || {});
  // Her design, validated (lib/giftVoucherDesign.ts): the preview at the top is the card her friend will get.
  const design = voucherConfig(shop.settings as never, tenant.id, storageHostOf(process.env.NEXT_PUBLIC_SUPABASE_URL)).design;
  return (
    <GiftPurchase
      tenantId={tenant.id}
      slug={slug}
      brand={{ name: b.businessName || tenant.name, primary: b.primary, logoUrl: b.logoUrl }}
      options={shop.options.map((o) => ({ key: o.key, kind: o.kind, amount: o.amount, label: o.label }))}
      validityMonths={shop.cfg.validityMonths}
      note={shop.cfg.note}
      online={shop.online}
      contact={waLink(b.whatsapp) || null}
      design={design}
    />
  );
}

function VouchersNotYet({ slug, tenantName, settings }: { slug: string; tenantName: string; settings: Record<string, unknown> | null }) {
  const b = resolveBranding(settings || {});
  const name = b.businessName || tenantName;
  return (
    <PublicPage primary={b.primary} maxWidth={440}>
      <BusinessHeader logoUrl={b.logoUrl} name={name} />
      <div className="pub-card" data-testid="gift-not-yet" style={{ padding: '28px 24px 26px', textAlign: 'center' }}>
        <LineIcon src={ICON_HEART} />
        <h1 className="pub-h1">שוברי מתנה עדיין לא זמינים כאן</h1>
        <p className="pub-p">אפשר לחזור לעמוד של {name} ולקבוע תור, או לשאול אותה ישירות על שובר מתנה.</p>
        <a href={`/${encodeURIComponent(slug)}`} style={{ display: 'inline-block', marginTop: 14, color: 'var(--pc-text, var(--pc))', fontWeight: 700 }}>לעמוד של {name}</a>
      </div>
    </PublicPage>
  );
}
