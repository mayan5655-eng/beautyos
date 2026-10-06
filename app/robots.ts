// app/robots.ts
//
// /robots.txt used to be answered by app/[slug]/page.tsx - the catch-all for
// a tenant's booking page - which treated "robots.txt" as a slug nobody owns
// and served its HTML "no business at this address" page with a 200. Lighthouse
// read that HTML as a robots file and reported "Syntax not understood" on
// every page; a real crawler gets no usable rules at all. A file-convention
// route outranks the dynamic segment, so this is all it takes.
//
// Crawlers may read everything public (the landing page, /demo, each tenant's
// booking page, terms and privacy). They are kept out of the signed-in app and
// the API, which hold nothing a search result should point at.

import type { MetadataRoute } from 'next'
import { APP_URL } from '@/lib/appUrl'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/api/', '/auth/', '/onboarding'],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  }
}
