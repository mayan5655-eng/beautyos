// A business's announcements feed is reached through its own link (?t=...). Bare, it says "no business" with a 200 - not a page to index.
import type { Metadata } from 'next';
// Her client opens this page from a link she sent: the tab and the WhatsApp preview say what it is, not Kalmea's slogan.
export const metadata: Metadata = {
  title: 'מרחב הלקוחות',
  description: 'עדכונים, מבצעים וטיפים',
  openGraph: { title: 'מרחב הלקוחות', description: 'עדכונים, מבצעים וטיפים', type: 'website' },
  robots: { index: false, follow: false },
};
export default function CommunityLayout({ children }: { children: React.ReactNode }) { return children; }
