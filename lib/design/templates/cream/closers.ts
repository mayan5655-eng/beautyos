// lib/design/templates/cream/closers.ts
//
// The closers: the templates that turn interest into a booking or a gift.
// One of the launch five is here; the rest of the set joins after approval.

import type { CreamDef } from '../cream.ts';

export const giftCard: CreamDef = {
  slug: 'gift-card',
  name: 'שובר מתנה',
  category: 'offer',
  description: 'תמונה על כל הרקע עם עלייה של קרם מלמטה, סכום גדול, סרט מצויר. למי שרוצה לפנק מישהי.',
  versions: { feed: 1, story: 1 },
  photo: 'bleed',
  photoSlot: { aiHint: 'a gift-wrapped box in cream paper with a thin satin ribbon on a linen surface, soft daylight, warm neutral palette, the box in the upper half, the lower half calm and empty' },
  kicker: { default: 'מתנה שמרגישים' },
  headline: { default: 'שובר מתנה לטיפול פנים', maxLength: 40 },
  subline: { default: 'בכל סכום, נשלח באותו היום' },
  price: { default: '₪300', label: 'סכום', note: 'או כל סכום שתבחרי' },
  cta: { default: 'לרכישת שובר' },
  deco: { asset: 'ribbon' },
};

export const CLOSERS: CreamDef[] = [giftCard];
