// lib/design/templates/cream/universal.ts
//
// The genuinely dual-field definitions (see contract.ts's note on
// Template.fields): content honestly identical in either world, written
// field-neutral from the start — never a retrofit of an existing
// cosmetics-only template, which would mean rewriting shipped copy under a
// version that is supposed to be immutable. A sale banner and a review card
// are the two categories where "what she offers" genuinely never has to
// appear in the words at all, so they're what's here. Everything else that
// looks shared (before/after, a treatment showcase) is field-specific copy
// with a field-specific template — see cream/nails.ts.
//
// Small and deliberate on purpose: dual-tagging is the exception, not a
// shortcut for skipping a second field's own copy.

import type { CreamDef } from '../cream.ts';

export const limitedOffer: CreamDef = {
  slug: 'limited-offer', name: 'מבצע כללי', category: 'offer', group: 'evergreen',
  fields: ['cosmetics', 'nails'],
  description: 'תמונה גדולה, כותרת אלגנטית, מחיר גדול לצידה, וכפתור. מבצע כללי שמתאים לכל תחום.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { aiHint: 'a tasteful still life suited to a beauty or personal-care business — soft natural light, calm and elegant, warm neutral tones, no text, no logos' },
  kicker: { default: 'מבצע לזמן מוגבל' },
  headline: { default: 'מבצע מיוחד', maxLength: 40 },
  subline: { default: 'לפרטים ולהזמנה', maxLength: 60 },
  price: { default: '₪99', note: 'לזמן מוגבל' },
  cta: { default: 'לקביעת תור' },
  headlineWeight: 900,
};

export const clientReview: CreamDef = {
  slug: 'client-review', name: 'לקוחה מספרת (כללי)', category: 'review', group: 'evergreen',
  fields: ['cosmetics', 'nails'],
  description: 'ציטוט של לקוחה מהביקורות השמורות, עם דירוג ושם. מתאים לכל תחום.',
  versions: { feed: 1, story: 1 },
  layout: { family: 'top' },
  photoSlot: { label: 'תמונה (לא חובה)', required: false, aiHint: 'a warm, calm still life suited to a beauty or personal-care business — soft natural light, no text' },
  quote: true,
  headline: { default: 'הלקוחות שלי הכי טובות בלב שלי 💛', maxLength: 200 },
  cta: { default: 'לקביעת תור' },
};

export const UNIVERSAL: CreamDef[] = [limitedOffer, clientReview];
