// A business's announcements feed is reached through its own link (?t=...). Bare, it says "no business" with a 200 - not a page to index.
import type { Metadata } from 'next';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function CommunityLayout({ children }: { children: React.ReactNode }) { return children; }
