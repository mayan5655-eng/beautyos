// lib/localBusinessJsonLd.ts
//
// schema.org data for her public page, so Google reads it as a local beauty
// business: name, phone, address, opening hours, treatments and prices. It is
// what makes "קוסמטיקאית ב<city>" searches able to show her page with details,
// and it costs nothing at runtime - one <script type="application/ld+json">.
//
// Only what she actually entered. hasRealHours() guards the hours for the same
// reason the page does (dayHoursFrom invents Sun-Fri 9-18 when nothing is
// stored). The address is split into street and city only when it has the
// "רחוב, עיר" comma (parseClinicAddress); a half-typed one stays a single line.
// No geo: Kalmea stores no coordinates, and invented ones would pin her on the
// wrong street. Google geocodes the address itself.
//
// aggregateRating comes ONLY from reviews her clients wrote after a real visit
// (get_public_reviews, the same rows the page shows), never from the Google
// rating or the reviews she typed by hand: those are not ours to assert. It is
// left out when the list may be cut (get_public_reviews returns at most 50), so
// the count is never wrong. Google does not show stars for a business's own
// page, so this is for completeness and other readers, not a ranking trick.

import { normalizeBusinessHours, type HoursSettings } from './businessHours.ts';
import { hasRealHours, fmtHour, instagramHandle, facebookHref, googleInfo } from './publicLanding.ts';
import { parseClinicAddress } from './ai/profileHygiene.ts';
import { isNailsOnly } from './googleKit.ts';

const DAY_URIS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d) => `https://schema.org/${d}`);

type Brand = {
  businessName?: string;
  businessDescription?: string;
  welcomeMessage?: string;
  whatsapp?: string;
  address?: string;
  logoUrl?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  website?: string;
};

type Service = { name?: string; price?: number | string | null; duration?: number | null; description?: string | null };
type PublicReview = { rating?: number | string | null };

/** get_public_reviews returns at most this many rows; a list this long may be cut, so no count is claimed from it. */
export const PUBLIC_REVIEWS_LIMIT = 50;

/** "@handle" or a tiktok.com link -> the profile URL; anything else -> null. */
function tiktokHref(raw: string | undefined): string | null {
  let v = String(raw || '').trim();
  if (!v) return null;
  const m = /tiktok\.com\/@?([^/?#]+)/i.exec(v);
  if (m) v = m[1];
  else if (/^https?:\/\//i.test(v)) return null;
  v = v.replace(/^@/, '');
  return /^[A-Za-z0-9._]{2,24}$/.test(v) ? `https://www.tiktok.com/@${v}` : null;
}

/** Her own website, only an http(s) address. */
function websiteHref(raw: string | undefined): string | null {
  const v = String(raw || '').trim();
  if (!/^https?:\/\/\S+$/i.test(v)) return null;
  try { const u = new URL(v); return u.hostname.includes('.') ? u.toString() : null; } catch { return null; }
}

/** "₪80-₪350" from the real prices, or null. */
export function priceRangeOf(services: Service[] | null | undefined): string | null {
  const prices = (services || []).map((s) => Number(s?.price)).filter((n) => Number.isFinite(n) && n > 0);
  if (!prices.length) return null;
  const min = Math.round(Math.min(...prices));
  const max = Math.round(Math.max(...prices));
  return min === max ? `₪${min}` : `₪${min}-₪${max}`;
}

/** Average and count of the real, published client reviews; null when there are none or the list may be cut. */
export function aggregateRatingOf(reviews: PublicReview[] | null | undefined): Record<string, unknown> | null {
  if (!Array.isArray(reviews) || reviews.length >= PUBLIC_REVIEWS_LIMIT) return null;
  const ratings = reviews.map((r) => Number(r?.rating)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
  if (!ratings.length) return null;
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  return { '@type': 'AggregateRating', ratingValue: Math.round(avg * 10) / 10, reviewCount: ratings.length, bestRating: 5, worstRating: 1 };
}

/** "0501234567" / "+972 50-123-4567" -> "+972501234567"; anything else -> null. */
function intlPhone(raw: string | undefined): string | null {
  const d = String(raw || '').replace(/\D/g, '');
  if (/^0\d{8,9}$/.test(d)) return `+972${d.slice(1)}`;
  if (/^972\d{8,9}$/.test(d)) return `+${d}`;
  return null;
}

export function localBusinessJsonLd(opts: {
  brand: Brand;
  settings: (HoursSettings & { business_fields?: unknown; branding?: unknown }) | null | undefined;
  services: Service[] | null | undefined;
  reviews?: PublicReview[] | null;
  url: string;
  image?: string;
  fallbackName?: string;
}): Record<string, unknown> | null {
  const { brand, settings, url } = opts;
  const name = (brand.businessName || opts.fallbackName || '').trim();
  if (!name) return null;

  // NailSalon when everything she does is nails: by her chosen fields, or, with none chosen, by every treatment's name.
  const serviceNames = (opts.services || []).map((s) => String(s?.name || '').trim()).filter(Boolean);
  const type = isNailsOnly(settings?.business_fields, serviceNames) ? 'NailSalon' : 'BeautySalon';
  const branding = (settings?.branding && typeof settings.branding === 'object' ? settings.branding : {}) as Record<string, unknown>;

  const out: Record<string, unknown> = { '@context': 'https://schema.org', '@type': type, name, url };
  const description = (brand.businessDescription || brand.welcomeMessage || '').trim();
  if (description) out.description = description.slice(0, 300);
  const image = brand.logoUrl && /^https?:\/\//.test(brand.logoUrl) ? brand.logoUrl : opts.image;
  if (image) out.image = image;
  const tel = intlPhone(brand.whatsapp);
  if (tel) out.telephone = tel;
  if (brand.address) {
    const parsed = parseClinicAddress(brand.address);
    if (parsed) {
      const street = parsed.full.slice(0, parsed.full.lastIndexOf(',')).trim();
      out.address = { '@type': 'PostalAddress', streetAddress: street, addressLocality: parsed.city, addressCountry: 'IL' };
      out.areaServed = { '@type': 'City', name: parsed.city };
    } else {
      out.address = { '@type': 'PostalAddress', streetAddress: brand.address, addressCountry: 'IL' };
    }
  }
  const google = googleInfo(branding);
  const placeUrl = google?.url || (() => {
    try {
      const u = new URL(String(branding.google_place_url || '').trim());
      return u.protocol === 'https:' && /(^|\.)(google\.[a-z.]+|goo\.gl|g\.page)$/i.test(u.hostname) ? u.toString() : null;
    } catch { return null; }
  })();
  if (placeUrl) out.hasMap = placeUrl;
  const priceRange = priceRangeOf(opts.services);
  if (priceRange) out.priceRange = priceRange;

  const sameAs: string[] = [];
  const ig = instagramHandle(brand.instagram);
  if (ig) sameAs.push(`https://www.instagram.com/${ig}`);
  const fb = facebookHref(brand.facebook);
  if (fb) sameAs.push(fb);
  const tt = tiktokHref(brand.tiktok);
  if (tt) sameAs.push(tt);
  const site = websiteHref(brand.website);
  if (site && site !== url) sameAs.push(site);
  if (placeUrl) sameAs.push(placeUrl);
  if (sameAs.length) out.sameAs = sameAs;

  if (hasRealHours(settings)) {
    const bh = normalizeBusinessHours(settings);
    const spec = [];
    for (let d = 0; d < 7; d++) {
      const h = bh[d];
      if (h && h.open != null && h.close != null && h.close > h.open) {
        spec.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: DAY_URIS[d], opens: fmtHour(h.open), closes: fmtHour(h.close) });
      }
    }
    if (spec.length) out.openingHoursSpecification = spec;
  }

  const offers = (opts.services || [])
    .filter((s) => String(s?.name || '').trim())
    .slice(0, 30)
    .map((s) => {
      const price = Number(s.price);
      const offer: Record<string, unknown> = { '@type': 'Offer', itemOffered: { '@type': 'Service', name: String(s.name).trim() } };
      if (Number.isFinite(price) && price > 0) { offer.price = price; offer.priceCurrency = 'ILS'; }
      return offer;
    });
  if (offers.length) out.makesOffer = offers;

  const rating = aggregateRatingOf(opts.reviews);
  if (rating) out.aggregateRating = rating;

  return out;
}

/** Safe to drop inside <script>: a "</script>" in her text can't close the tag. */
export function jsonLdString(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
