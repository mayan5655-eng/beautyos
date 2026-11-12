// app/pay/membership/[token]/page.tsx
//
// The client's membership page, from the link her cosmetician sent her or opened for her (lib/memberships.ts): the terms, the consent
// tick (its exact words are frozen once she agrees), the step to save her card on Grow's page, then what is left this month and the
// way to cancel per the plan's terms. Public, no login: the 192-bit id in the link opens that ONE membership. Under /pay, which is
// already public (lib/supabase/middleware.ts). NEXT_PUBLIC_CLIENT_MEMBERSHIPS off: a plain 404, the page does not exist.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { clientMembershipsEnabled } from '@/lib/membershipFlag';
import MembershipLinkClient from './MembershipLinkClient';

export const metadata: Metadata = {
  title: 'המנוי שלך',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function MembershipPage({ params }: { params: Promise<{ token: string }> }) {
  if (!clientMembershipsEnabled()) notFound();
  const { token } = await params;
  return <MembershipLinkClient token={token} />;
}
