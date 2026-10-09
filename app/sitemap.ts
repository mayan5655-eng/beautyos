// app/sitemap.ts
//
// /sitemap.xml used to be answered by app/[slug]/page.tsx - the catch-all for a tenant's booking page - with its
// "no business at this address" HTML and a 200 (the same bug robots.ts was written for). A file-convention route
// outranks the dynamic segment.
//
// Lists the pages that are Kalmea's own and meant to be found. Businesses' booking pages are deliberately NOT
// listed: a cosmetician's page is hers to share, and putting every one of them in a public index is a decision
// for her (an opt-in), not a default.

import type { MetadataRoute } from 'next';
import { APP_URL } from '../lib/appUrl.ts';

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: [string, number][] = [['/', 1], ['/signup', 0.8], ['/demo', 0.7], ['/privacy', 0.3], ['/terms', 0.3], ['/accessibility', 0.3]];
  return pages.map(([path, priority]) => ({ url: `${APP_URL}${path}`, priority }));
}
