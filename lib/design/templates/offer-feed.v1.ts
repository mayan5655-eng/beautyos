import type { Template } from '../contract.ts';

// Offer, feed 4:5. One photo full bleed, a deep wash rising from the bottom,
// her mark top-right, headline + price + CTA in the bottom third. The
// template the AI fills first, and the one a typed "249 ₪" lands in.
export const offerFeedV1: Template = {
  key: 'offer-feed',
  version: 1,
  category: 'offer',
  format: 'feed45',
  name: 'מבצע',
  description: 'תמונה אחת, כותרת, מחיר וכפתור. לפוסט מבצע בפיד.',
  needs: ['תמונה אחת (מהגלריה או AI)', 'מחיר'],
  variables: [
    { key: 'headline', label: 'כותרת', kind: 'text', source: 'user', default: 'טיפול פנים קלאסי', maxLength: 40, required: true },
    { key: 'subline', label: 'שורת משנה', kind: 'text', source: 'user', default: 'עור זוהר, רגוע ונקי', maxLength: 60 },
    { key: 'price', label: 'מחיר', kind: 'price', source: 'user', default: '₪249', maxLength: 12, required: true },
    { key: 'price_note', label: 'הערת מחיר', kind: 'text', source: 'static', default: 'במקום ₪320', maxLength: 20 },
    { key: 'cta', label: 'כפתור', kind: 'cta', source: 'user', default: 'לקביעת תור', maxLength: 22 },
    { key: 'business_name', label: 'שם העסק', kind: 'text', source: 'business_name', maxLength: 40 },
  ],
  slots: [
    { key: 'photo', label: 'תמונה', sources: ['gallery', 'clinic', 'hero', 'upload', 'ai', 'previous'], required: true },
  ],
  layers: [
    { id: 'photo', type: 'image', slot: 'photo', box: { x: 0, y: 0, w: 100, h: 100 }, fit: 'cover', focus: { x: 0.5, y: 0.4 }, overlay: { color: 'deep', opacity: 0.72, direction: 'bottom' } },
    { id: 'logo', type: 'logo', box: { x: 70, y: 4, w: 24, h: 9 }, fallback: 'business_name', color: 'surface' },
    { id: 'headline', type: 'text', bind: 'headline', box: { x: 6, y: 62, w: 88, h: 12 }, font: 'display', size: 84, weight: 700, color: 'surface', align: 'right', maxLines: 2, lineHeight: 1.05 },
    { id: 'subline', type: 'text', bind: 'subline', box: { x: 6, y: 74, w: 88, h: 5 }, font: 'body', size: 36, weight: 400, color: 'surface', align: 'right', maxLines: 1 },
    { id: 'price', type: 'text', bind: 'price', box: { x: 62, y: 81, w: 32, h: 8 }, font: 'display', size: 70, weight: 700, color: 'contrast', align: 'center', maxLines: 1, background: { color: 'primary', radius: 28, padding: 18 } },
    { id: 'price_note', type: 'text', bind: 'price_note', box: { x: 62, y: 89.5, w: 32, h: 3.5 }, font: 'body', size: 28, weight: 400, color: 'surface', align: 'center', maxLines: 1 },
    { id: 'cta', type: 'text', bind: 'cta', box: { x: 6, y: 82, w: 50, h: 6 }, font: 'body', size: 34, weight: 700, color: 'deep', align: 'center', maxLines: 1, background: { color: 'surface', radius: 40, padding: 16 } },
    { id: 'business_name', type: 'text', bind: 'business_name', box: { x: 6, y: 93.5, w: 88, h: 3.5 }, font: 'body', size: 26, weight: 600, color: 'surface', align: 'right', maxLines: 1 },
  ],
};
