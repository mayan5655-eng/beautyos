// lib/unsplash.ts
// Helper function to search images on Unsplash
// Used by marketing campaigns to add images to posts

export type UnsplashImage = {
  url: string
  thumbUrl: string
  photographerName: string
  photographerUrl: string
  description: string
}

/**
 * Search Unsplash and return up to `count` distinct images in ONE API call.
 * Returns an empty array if nothing is found or the API fails.
 *
 * One call per batch matters: Unsplash demo apps are capped at 50 requests
 * per hour, so calling once per variation burns the quota five times faster.
 */
export async function searchUnsplashImages(
  query: string,
  count: number
): Promise<UnsplashImage[]> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY

  if (!accessKey) {
    console.warn('UNSPLASH_ACCESS_KEY not set - skipping image search')
    return []
  }

  // Unsplash caps per_page at 30.
  const perPage = Math.min(Math.max(count, 1), 30)

  try {
    // Translate Hebrew keywords to English for better results
    const englishQuery = translateBeautyTerms(query)

    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      englishQuery
    )}&per_page=${perPage}&orientation=landscape`

    const response = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
      },
    })

    if (!response.ok) {
      console.error('Unsplash API error:', response.status)
      return []
    }

    const data = await response.json()

    if (!data.results || data.results.length === 0) {
      return []
    }

    return data.results.map((photo: any) => ({
      url: photo.urls.regular,
      thumbUrl: photo.urls.small,
      photographerName: photo.user.name,
      photographerUrl: photo.user.links.html,
      description: photo.alt_description || photo.description || query,
    }))
  } catch (error) {
    console.error('Error fetching from Unsplash:', error)
    return []
  }
}

/**
 * Pick one image per variation from a single search.
 *
 * Deterministic: variation index i takes result i. When Unsplash returns
 * fewer results than there are variations the index wraps around, so a post
 * repeats an earlier photo rather than ending up with no image at all.
 *
 * Returns an array the same length as `queries`, all null if the search failed.
 */
export async function searchUnsplashImagesForVariations(
  queries: string[]
): Promise<(UnsplashImage | null)[]> {
  if (queries.length === 0) return []

  // One representative query for the whole batch keeps this to a single API
  // call. translateBeautyTerms already collapses most Hebrew suggestions to
  // the same English phrase, so per-variation queries rarely differed anyway.
  const batchQuery =
    queries.find((q) => q && q.trim().length > 0) || 'beauty cosmetics'

  const photos = await searchUnsplashImages(batchQuery, queries.length)

  if (photos.length === 0) return queries.map(() => null)

  return queries.map((_, i) => photos[i % photos.length])
}

/**
 * Single-image search, kept as a thin wrapper for any caller that needs one.
 */
export async function searchUnsplashImage(
  query: string
): Promise<UnsplashImage | null> {
  const [first] = await searchUnsplashImages(query, 1)
  return first || null
}

/**
 * Translate Hebrew beauty terms to English for better Unsplash results
 */
function translateBeautyTerms(query: string): string {
  const translations: Record<string, string> = {
    'הסרת שיער': 'laser hair removal',
    'לייזר': 'laser treatment',
    'קוסמטיקה': 'beauty cosmetics',
    'טיפול פנים': 'facial treatment',
    'טיפוח': 'skincare',
    'איפור': 'makeup',
    'ספא': 'spa',
    'מסאז': 'massage',
    'מסאג': 'massage',
    'יופי': 'beauty',
    'פנים': 'face',
    'עור': 'skin',
    'שיער': 'hair',
    'ציפורניים': 'nails',
    'מניקור': 'manicure',
    'פדיקור': 'pedicure',
    'שעווה': 'waxing',
    'גבות': 'eyebrows',
    'ריסים': 'eyelashes',
    'אישה': 'woman',
    'נשים': 'women',
  }

  // Check if query contains Hebrew
  const hasHebrew = /[\u0590-\u05FF]/.test(query)

  if (!hasHebrew) {
    return query
  }

  // Try to find translations
  for (const [hebrew, english] of Object.entries(translations)) {
    if (query.includes(hebrew)) {
      return english + ' professional'
    }
  }

  // Default fallback
  return 'beauty cosmetics professional'
}