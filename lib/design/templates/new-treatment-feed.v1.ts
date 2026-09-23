import type { Template } from '../contract.ts';

// New treatment, feed 4:5. The picture takes the top three fifths, a panel in
// her surface colour holds the kicker, the treatment name, a line about it
// and the CTA. Calm and product-like.
export const newTreatmentFeedV1: Template = {
  key: 'new-treatment-feed',
  version: 1,
  category: 'treatment',
  format: 'feed45',
  name: 'טיפול חדש',
  description: 'תמונה למעלה, פאנל עם שם הטיפול, תיאור קצר וכפתור למטה.',
  needs: ['תמונה אחת של הטיפול או הקליניקה'],
  variables: [
    { key: 'kicker', label: 'כותרת עליונה', kind: 'text', source: 'static', default: 'חדש בקליניקה', maxLength: 22 },
    { key: 'headline', label: 'שם הטיפול', kind: 'text', source: 'user', default: 'הידרה-פיישל', maxLength: 36, required: true },
    { key: 'subline', label: 'מה זה נותן', kind: 'text', source: 'user', default: 'ניקוי עמוק, לחות ורעננות, בלי זמן החלמה', maxLength: 90 },
    { key: 'price', label: 'מחיר (לא חובה)', kind: 'price', source: 'user', default: '', maxLength: 14 },
    { key: 'cta', label: 'כפתור', kind: 'cta', source: 'user', default: 'לפרטים ולקביעת תור', maxLength: 26 },
    { key: 'business_name', label: 'שם העסק', kind: 'text', source: 'business_name', maxLength: 40 },
  ],
  slots: [
    { key: 'photo', label: 'תמונה', sources: ['gallery', 'clinic', 'hero', 'upload', 'ai', 'previous'], required: true },
  ],
  layers: [
    { id: 'plate', type: 'shape', box: { x: 0, y: 0, w: 100, h: 100 }, color: 'surface' },
    { id: 'photo', type: 'image', slot: 'photo', box: { x: 0, y: 0, w: 100, h: 60 }, fit: 'cover', focus: { x: 0.5, y: 0.4 } },
    { id: 'logo', type: 'logo', box: { x: 70, y: 4, w: 24, h: 8 }, fallback: 'business_name', color: 'surface' },
    { id: 'kicker', type: 'text', bind: 'kicker', box: { x: 60, y: 57, w: 34, h: 5 }, font: 'body', size: 28, weight: 700, color: 'contrast', align: 'center', maxLines: 1, background: { color: 'primary', radius: 30, padding: 14 } },
    { id: 'headline', type: 'text', bind: 'headline', box: { x: 6, y: 65, w: 88, h: 9 }, font: 'display', size: 74, weight: 700, color: 'ink', align: 'right', maxLines: 2, lineHeight: 1.05 },
    { id: 'subline', type: 'text', bind: 'subline', box: { x: 6, y: 75, w: 88, h: 8 }, font: 'body', size: 34, weight: 400, color: 'muted', align: 'right', maxLines: 2, lineHeight: 1.35 },
    { id: 'price', type: 'text', bind: 'price', box: { x: 6, y: 85, w: 30, h: 6 }, font: 'display', size: 44, weight: 700, color: 'deep', align: 'right', maxLines: 1 },
    { id: 'cta', type: 'text', bind: 'cta', box: { x: 40, y: 85, w: 54, h: 6.5 }, font: 'body', size: 32, weight: 700, color: 'contrast', align: 'center', maxLines: 1, background: { color: 'deep', radius: 40, padding: 16 } },
    { id: 'business_name', type: 'text', bind: 'business_name', box: { x: 6, y: 93.5, w: 88, h: 3.5 }, font: 'body', size: 26, weight: 600, color: 'muted', align: 'right', maxLines: 1 },
  ],
};
