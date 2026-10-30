// The skin scanner is reached through a business's own signed link. Bare, it says "invalid link" with a 200 - not a page to index.
import type { Metadata } from 'next';
// Her client opens this page from a link she sent: the tab and the WhatsApp preview say what it is, not Kalmea's slogan.
export const metadata: Metadata = {
  title: 'ניתוח עור אישי',
  description: 'תמונה אחת, וניתוח אישי והמלצת טיפול',
  openGraph: { title: 'ניתוח עור אישי', description: 'תמונה אחת, וניתוח אישי והמלצת טיפול', type: 'website' },
  robots: { index: false, follow: false },
};
export default function SkinScanLayout({ children }: { children: React.ReactNode }) { return children; }
