// app/pay/[token]/page.tsx
//
// The payment page a client opens from the link her cosmetician sent (cashier or payment request), or from her booking (a booking deposit
// or paying for the visit, gift vouchers too: lib/grow/wallet.ts payContextOf). Public, no login: the token in the
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
  // Grow: Apple Pay needs this script in the page's head (React moves an async script there).
  return <><script async src="https://meshulam.co.il/_media/js/apple_pay_sdk/sdk.min.js" /><PayClient token={token} /></>;
}
