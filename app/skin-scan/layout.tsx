// The skin scanner is reached through a business's own signed link. Bare, it says "invalid link" with a 200 - not a page to index.
import type { Metadata } from 'next';
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function SkinScanLayout({ children }: { children: React.ReactNode }) { return children; }
