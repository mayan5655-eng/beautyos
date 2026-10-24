// A consent form is a bearer link sent to one client: it is never a page to find in a search. (The page is client-side, so this server
// layout is where its metadata can live. Also: with no ?id= the page answers "form not found" with a 200, which a crawler would index.)
import type { Metadata } from 'next';
// Her client opens this page from a link she sent: the tab and the WhatsApp preview say what it is, not Kalmea's slogan.
export const metadata: Metadata = {
  title: 'טופס לחתימה',
  description: 'טופס קצר לפני הטיפול',
  openGraph: { title: 'טופס לחתימה', description: 'טופס קצר לפני הטיפול', type: 'website' },
  robots: { index: false, follow: false },
};
export default function FormLayout({ children }: { children: React.ReactNode }) { return children; }
