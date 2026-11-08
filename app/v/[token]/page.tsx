// app/v/[token]/page.tsx
//
// THE GIFT VOUCHER PAGE: kalmea.app/v/<token>. Public (the 192-bit token is the authorisation), never indexed, never cached.
// Everything comes from lib/giftVoucherView.ts loadPublicVoucher, scoped by the token alone and reduced to display fields: what the
// gift is, its balance and expiry, the code for the till, the names and the message. No phone, no ids, no other client's data.
// An unknown token and a missing migration answer the same neutral 404, so the page cannot be used to probe for tokens.
//
// ?b=1 is the buyer coming back from Grow's payment page: the page waits for Grow's confirmation, then shows her a WhatsApp button
// to send the gift herself (wa.me, no number: she picks the friend). Nothing is ever sent by us.
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { loadPublicVoucher } from '@/lib/giftVoucherView';
import { PublicPage, LineIcon } from '@/app/PublicChrome';
import { ICON_QUESTION } from '@/lib/brand';
import VoucherView from './VoucherView';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'שובר מתנה',
  description: 'יש לך מתנה 🎁',
  robots: { index: false, follow: false, nocache: true, noarchive: true, noimageindex: true },
  referrer: 'no-referrer',
  openGraph: { title: 'שובר מתנה 🎁', description: 'יש לך מתנה', type: 'website' },
};

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

type Props = { params: Promise<{ token: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function VoucherPage({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = (await searchParams) || {};
  const one = (k: string) => { const v = sp[k]; return Array.isArray(v) ? v[0] : v; };
  let state;
  try {
    state = await loadPublicVoucher(admin(), decodeURIComponent(token));
  } catch (e) {
    console.error('[vouchers] page load failed:', (e as Error)?.message);
    return (
      <PublicPage owner="kalmea">
        <div className="pub-card">
          <LineIcon src={ICON_QUESTION} />
          <h1 className="pub-h1">הדף לא נטען עכשיו</h1>
          <p className="pub-p">אפשר לנסות לרענן בעוד רגע.</p>
        </div>
      </PublicPage>
    );
  }
  if (state.state === 'unknown') notFound();
  return <VoucherView token={token} initial={state} buyer={one('b') === '1'} growResult={one('grow') || null} />;
}
