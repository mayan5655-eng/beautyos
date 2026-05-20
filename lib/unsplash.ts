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
 * Search for an image on Unsplash based on a query
 * Returns null if no image found or if API fails
 */
export async function searchUnsplashImage(
  query: string
): Promise<UnsplashImage | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY

  if (!accessKey) {
    console.warn('UNSPLASH_ACCESS_KEY not set - skipping image search')
    return null
  }

  try {
    // Translate Hebrew keywords to English for better results
    const englishQuery = translateBeautyTerms(query)

    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      englishQuery
    )}&per_page=1&orientation=landscape`

    const response = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
      },
    })

    if (!response.ok) {
      console.error('Unsplash API error:', response.status)
      return null
    }

    const data = await response.json()

    if (!data.results || data.results.length === 0) {
      return null
    }

    const photo = data.results[0]

    return {
      url: photo.urls.regular,
      thumbUrl: photo.urls.small,
      photographerName: photo.user.name,
      photographerUrl: photo.user.links.html,
      description: photo.alt_description || photo.description || query,
    }
  } catch (error) {
    console.error('Error fetching from Unsplash:', error)
    return null
  }
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