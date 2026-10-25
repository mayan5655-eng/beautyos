// /c/<token>: one client's private results page, opened from a link her cosmetician sent her. Never a page for a search engine,
// and the link must not travel in a Referer header to the photo host or the booking page.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'הדף האישי שלך',
  description: 'התוצאות שלך, מה עשינו, ואיך לשמור על זה',
  robots: { index: false, follow: false, nocache: true, noarchive: true, noimageindex: true },
  referrer: 'no-referrer',
  openGraph: { title: 'הדף האישי שלך', description: 'התוצאות שלך, מה עשינו, ואיך לשמור על זה', type: 'website' },
};

export default function ClientPageLayout({ children }: { children: React.ReactNode }) { return children; }
