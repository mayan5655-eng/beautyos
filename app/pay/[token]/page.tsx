// app/pay/[token]/page.tsx
//
// The payment page a client opens from the link her cosmetician sent (cashier or payment request). Public, no login: the token in the
// link opens that one payment only (lib/grow/wallet.ts). The page itself is only a shell; PayClient asks /api/grow/wallet for the state.
import type { Metadata } from 'next';
import PayClient from './PayClient';

export const metadata: Metadata = {
  title: 'תשלום מאובטח',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PayClient token={token} />;
}
