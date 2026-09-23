// lib/design/templates/cream/holidays.ts
//
// Holidays and seasons in the studio look. `holiday` names the occasion in
// lib/design/holidays.ts, which opens the template's window: the studio
// surfaces it as a card three weeks before the date. The picture is never a
// client's: her gallery or the AI route, under the same cream page.

import type { CreamDef } from '../cream.ts';

export const roshHashana: CreamDef = {
  slug: 'rosh-hashana',
  name: 'ראש השנה',
  category: 'seasonal',
  holiday: 'rosh_hashana',
  description: 'ברכה לשנה החדשה עם רימון מצויר, מעל תמונה שלך או תמונת AI, והזמנה לטיפול לפני החג.',
  versions: { feed: 1, story: 1 },
  photo: 'top',
  photoSlot: { sources: ['ai', 'gallery', 'clinic', 'upload', 'previous'], aiHint: 'a warm still life for the Jewish new year: honey in a small glass jar, apple slices, a pomegranate, on cream linen in soft window light, shallow depth of field, lots of calm empty space' },
  kicker: { default: 'שנה טובה ומתוקה' },
  headline: { default: 'שתהיה לך שנה של עור זוהר', maxLength: 44 },
  subline: { default: 'טיפולי פנים לפני החג, במקומות אחרונים' },
  cta: { default: 'לתור לפני החג' },
  deco: { asset: 'pomegranate' },
};

export const HOLIDAYS: CreamDef[] = [roshHashana];
