// lib/testimonials.ts
//
// Real words from real Kalmea customers, for the landing page (app/landing/Testimonials.jsx). EMPTY on purpose: owner rule,
// 2026-10-30, no invented testimonials. While this list is empty the section renders nothing at all (no heading, no placeholder).
// Add an entry only with the customer's written permission to quote her, her real first name and her real business.

export type Testimonial = {
  /** Her own words, as she wrote them. */
  quote: string;
  /** Her first name. */
  name: string;
  /** Her business or profession, e.g. "קוסמטיקאית, חולון". */
  role: string;
};

export const TESTIMONIALS: Testimonial[] = [];

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Only complete entries: a quote and a name. Anything partial is left out rather than shown half-empty. */
export function visibleTestimonials(list: readonly Testimonial[] = TESTIMONIALS): Testimonial[] {
  return list
    .map((t) => ({ quote: clean(t?.quote), name: clean(t?.name), role: clean(t?.role) }))
    .filter((t) => t.quote && t.name);
}
