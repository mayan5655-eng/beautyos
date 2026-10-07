// A review request is a signed link sent to one client: never a page to find in a search (and with no signature the page says "invalid
// link" with a 200, which a crawler would index as content).
import type { Metadata } from 'next';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function ReviewLayout({ children }: { children: React.ReactNode }) { return children; }
