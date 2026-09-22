import type { Template } from '../contract.ts';

// Seasonal, feed 4:5. One atmospheric photo under a strong wash in her deep
// shade, a season kicker, a big headline and a CTA. The same file serves
// every season: the kicker and headline change, the mood comes from the
// picture and her colours.
export const seasonalFeedV1: Template = {
  key: 'seasonal-feed',
  version: 1,
  category: 'seasonal',
  format: 'feed45',
  name: 'עונתי',
  description: 'תמונת אווירה עם כותרת עונתית וכפתור. לחגים, לעונה, לתחילת שנה.',
  needs: ['תמונת אווירה (מהגלריה או AI)'],
  variables: [
    { key: 'kicker', label: 'העונה / החג', kind: 'text', source: 'user', default: 'מתכוננות לחורף', maxLength: 26, required: true },
    { key: 'headline', label: 'כותרת', kind: 'text', source: 'user', default: 'העור צריך לחות אחרת עכשיו', maxLength: 44, required: true },
    { key: 'subline', label: 'שורת משנה', kind: 'text', source: 'user', default: 'טיפול לחות עמוק, מותאם לעונה', maxLength: 60 },
    { key: 'cta', label: 'כפתור', kind: 'cta', source: 'user', default: 'לקביעת תור', maxLength: 22 },
    { key: 'business_name', label: 'שם העסק', kind: 'text', source: 'business_name', maxLength: 40 },
  ],
  slots: [
    { key: 'photo', label: 'תמונה', sources: ['gallery', 'clinic', 'hero', 'upload', 'ai', 'previous'], required: true },
  ],
  layers: [
    { id: 'photo', type: 'image', slot: 'photo', box: { x: 0, y: 0, w: 100, h: 100 }, fit: 'cover', focus: { x: 0.5, y: 0.45 }, overlay: { color: 'deep', opacity: 0.55, direction: 'flat' } },
    { id: 'logo', type: 'logo', box: { x: 38, y: 5, w: 24, h: 8 }, fallback: 'business_name', color: 'surface' },
    { id: 'kicker', type: 'text', bind: 'kicker', box: { x: 25, y: 40, w: 50, h: 5 }, font: 'body', size: 30, weight: 700, color: 'contrast', align: 'center', maxLines: 1, background: { color: 'primary', radius: 30, padding: 14 } },
    { id: 'headline', type: 'text', bind: 'headline', box: { x: 8, y: 47, w: 84, h: 16 }, font: 'display', size: 82, weight: 700, color: 'surface', align: 'center', maxLines: 3, lineHeight: 1.08 },
    { id: 'subline', type: 'text', bind: 'subline', box: { x: 10, y: 64, w: 80, h: 5 }, font: 'body', size: 34, weight: 400, color: 'surface', align: 'center', maxLines: 1 },
    { id: 'cta', type: 'text', bind: 'cta', box: { x: 25, y: 74, w: 50, h: 6.5 }, font: 'body', size: 34, weight: 700, color: 'deep', align: 'center', maxLines: 1, background: { color: 'surface', radius: 40, padding: 16 } },
    { id: 'business_name', type: 'text', bind: 'business_name', box: { x: 10, y: 93, w: 80, h: 3.5 }, font: 'body', size: 26, weight: 600, color: 'surface', align: 'center', maxLines: 1 },
  ],
};
