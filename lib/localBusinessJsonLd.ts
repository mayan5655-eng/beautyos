// lib/localBusinessJsonLd.ts
//
// schema.org data for her public page, so Google reads it as a local beauty
// business: name, phone, address, opening hours, treatments and prices. It is
// what makes "קוסמטיקאית ב<city>" searches able to show her page with details,
// and it costs nothing at runtime - one <script type="application/ld+json">.
//
// Only what she actually entered. hasRealHours() guards the hours for the same
// reason the page does (dayHoursFrom invents Sun-Fri 9-18 when nothing is
// stored). No aggregateRating: Google ignores ratings a business publishes about
// itself on its own page, and a rating she typed by hand is not ours to assert.

import { normalizeBusinessHours, type HoursSettings } from './businessHours.ts';
import { hasRealHours, fmtHour, instagramHandle, facebookHref } from './publicLanding.ts';
import { businessFieldsOf } from './businessFields.ts';

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
};

type Service = { name?: string; price?: number | string | null; duration?: number | null; description?: string | null };

/** "0501234567" / "+972 50-123-4567" -> "+972501234567"; anything else -> null. */
function intlPhone(raw: string | undefined): string | null {
  const d = String(raw || '').replace(/\D/g, '');
  if (/^0\d{8,9}$/.test(d)) return `+972${d.slice(1)}`;
  if (/^972\d{8,9}$/.test(d)) return `+${d}`;
  return null;
}

export function localBusinessJsonLd(opts: {
  brand: Brand;
  settings: (HoursSettings & { business_fields?: unknown }) | null | undefined;
  services: Service[] | null | undefined;
  url: string;
  image?: string;
  fallbackName?: string;
}): Record<string, unknown> | null {
  const { brand, settings, url } = opts;
  const name = (brand.businessName || opts.fallbackName || '').trim();
  if (!name) return null;

  const fields = businessFieldsOf(settings);
  const type = fields.length === 1 && fields[0] === 'nails' ? 'NailSalon' : 'BeautySalon';

  const out: Record<string, unknown> = { '@context': 'https://schema.org', '@type': type, name, url };
  const description = (brand.businessDescription || brand.welcomeMessage || '').trim();
  if (description) out.description = description.slice(0, 300);
  const image = brand.logoUrl && /^https?:\/\//.test(brand.logoUrl) ? brand.logoUrl : opts.image;
  if (image) out.image = image;
  const tel = intlPhone(brand.whatsapp);
  if (tel) out.telephone = tel;
  if (brand.address) out.address = { '@type': 'PostalAddress', streetAddress: brand.address, addressCountry: 'IL' };

  const sameAs: string[] = [];
  const ig = instagramHandle(brand.instagram);
  if (ig) sameAs.push(`https://www.instagram.com/${ig}`);
  const fb = facebookHref(brand.facebook);
  if (fb) sameAs.push(fb);
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

  return out;
}

/** Safe to drop inside <script>: a "</script>" in her text can't close the tag. */
export function jsonLdString(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
