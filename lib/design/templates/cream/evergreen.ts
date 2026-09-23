// lib/design/templates/cream/evergreen.ts
//
// The evergreen definitions of the studio look (see ../cream.ts). Each one
// becomes a feed 4:5 and a story 9:16 template. The first three of the
// launch library; the rest of the evergreen set joins once these are
// approved.

import type { CreamDef } from '../cream.ts';

export const offer: CreamDef = {
  slug: 'offer',
  name: 'מבצע',
  category: 'offer',
  description: 'תמונה גדולה, כותרת אלגנטית, מחיר גדול לצידה, וכפתור. לפוסט מבצע.',
  versions: { feed: 2, story: 1 },
  photo: 'top',
  photoSlot: { aiHint: 'a calm treatment moment in a bright clinic, soft window light, warm neutral tones, the subject slightly off-centre, quiet and unposed' },
  kicker: { default: 'מבצע לזמן מוגבל' },
  headline: { default: 'טיפול פנים קלאסי', maxLength: 40 },
  subline: { default: 'עור זוהר, רגוע ונקי, בשעה אחת' },
  price: { default: '₪249', note: 'במקום ₪320' },
  cta: { default: 'לקביעת תור' },
  headlineWeight: 900,
};

export const beforeAfter: CreamDef = {
  slug: 'before-after',
  name: 'לפני / אחרי',
  category: 'before_after',
  description: 'שתי תמונות של לקוחה זו לצד זו, כותרת ושורת הסבר. שתי התמונות דורשות אישור פרסום.',
  versions: { feed: 2, story: 1 },
  photo: 'pair',
  kicker: { default: 'תוצאה אמיתית' },
  headline: { default: 'אחרי טיפול אחד', maxLength: 40 },
  subline: { default: 'ללא פילטרים, באור טבעי' },
  cta: { default: 'גם את? לקביעת תור' },
};

export const review: CreamDef = {
  slug: 'review',
  name: 'לקוחה מספרת',
  category: 'review',
  description: 'ציטוט של לקוחה מהביקורות השמורות, עם דירוג ושם, מעל תמונה מהקליניקה.',
  versions: { feed: 2, story: 1 },
  photo: 'top',
  photoSlot: { label: 'תמונה (לא חובה)', required: false, aiHint: 'a serene detail from a skincare clinic: folded towels, a ceramic bowl, soft daylight on linen, warm neutral palette' },
  quote: true,
  headline: { default: 'הגעתי עם עור עייף ויצאתי זוהרת. מקצועיות, סבלנות ויחס אישי.', maxLength: 200 },
  cta: { default: 'לקביעת תור' },
};

export const EVERGREEN: CreamDef[] = [offer, beforeAfter, review];
