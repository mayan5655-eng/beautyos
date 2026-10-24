// The confirm / cancel link from her appointment message. Reached only through a signed link: not a page to index.
// Her client opens this page from a link she sent: the tab and the WhatsApp preview say what it is, not Kalmea's slogan.
import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'התור שלך',
  description: 'אישור או ביטול התור',
  openGraph: { title: 'התור שלך', description: 'אישור או ביטול התור', type: 'website' },
  robots: { index: false, follow: false },
};
export default function ConfirmLayout({ children }: { children: React.ReactNode }) { return children; }
