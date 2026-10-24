// A review request is a signed link sent to one client: never a page to find in a search (and with no signature the page says "invalid
// link" with a 200, which a crawler would index as content).
import type { Metadata } from 'next';
// Her client opens this page from a link she sent: the tab and the WhatsApp preview say what it is, not Kalmea's slogan.
export const metadata: Metadata = {
  title: 'איך היה הטיפול?',
  description: 'כמה מילים על הביקור שלך',
  openGraph: { title: 'איך היה הטיפול?', description: 'כמה מילים על הביקור שלך', type: 'website' },
  robots: { index: false, follow: false },
};
export default function ReviewLayout({ children }: { children: React.ReactNode }) { return children; }
