// lib/pageMeta.ts
// Hebrew title, description and share card for the public pages that are client components (they cannot export metadata
// themselves, so each gets a tiny layout.tsx that calls this). Same style as the landing page in app/page.tsx; the
// og image stays the shared 1200x630 card from the root layout.
import type { Metadata } from 'next'

export function hebrewPageMeta(title: string, description: string): Metadata {
  return {
    title,
    description,
    openGraph: {
      type: 'website',
      title,
      description,
      locale: 'he_IL',
      siteName: 'קלמיה',
      images: [{ url: '/og-1200x630.jpg', width: 1200, height: 630, alt: 'קלמיה' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og-1200x630.jpg'],
    },
  }
}
