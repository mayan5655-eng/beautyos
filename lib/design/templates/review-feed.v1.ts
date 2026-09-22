import type { Template } from '../contract.ts';

// A client review, feed 4:5. Pulled from her saved reviews (settings.branding
// .reviews): the text as a big quote, the stars, the client's first name.
// Not offered in the gallery when she has no reviews.
export const reviewFeedV1: Template = {
  key: 'review-feed',
  version: 1,
  category: 'review',
  format: 'feed45',
  name: 'ביקורת לקוחה',
  description: 'ציטוט של לקוחה עם דירוג כוכבים, על רקע בצבעי המותג.',
  needs: ['לפחות ביקורת אחת שמורה בהגדרות'],
  variables: [
    { key: 'quote_mark', label: 'מרכאות', kind: 'text', source: 'static', default: '״', maxLength: 2 },
    { key: 'review_text', label: 'הביקורת', kind: 'text', source: 'review_text', default: 'הגעתי עם עור עייף ויצאתי זוהרת. מקצועיות, סבלנות ויחס אישי.', maxLength: 220, required: true },
    { key: 'stars', label: 'דירוג', kind: 'stars', source: 'review_rating', default: '★★★★★', maxLength: 5 },
    { key: 'review_name', label: 'שם הלקוחה', kind: 'text', source: 'review_name', default: 'לקוחה', maxLength: 30 },
    { key: 'cta', label: 'כפתור', kind: 'cta', source: 'user', default: 'לקביעת תור', maxLength: 22 },
    { key: 'business_name', label: 'שם העסק', kind: 'text', source: 'business_name', maxLength: 40 },
  ],
  slots: [
    { key: 'photo', label: 'תמונת רקע (לא חובה)', sources: ['gallery', 'clinic', 'hero', 'upload', 'ai'] },
  ],
  layers: [
    { id: 'plate', type: 'shape', box: { x: 0, y: 0, w: 100, h: 100 }, color: 'tint', gradient: { to: 'surface', angle: 200 } },
    { id: 'photo', type: 'image', slot: 'photo', box: { x: 0, y: 0, w: 100, h: 44 }, fit: 'cover', focus: { x: 0.5, y: 0.4 }, overlay: { color: 'deep', opacity: 0.35, direction: 'flat' } },
    { id: 'logo', type: 'logo', box: { x: 70, y: 4, w: 24, h: 8 }, fallback: 'business_name', color: 'surface' },
    { id: 'card', type: 'shape', box: { x: 6, y: 36, w: 88, h: 50 }, color: 'surface', radius: 36 },
    { id: 'quote_mark', type: 'text', bind: 'quote_mark', box: { x: 78, y: 37, w: 12, h: 10 }, font: 'display', size: 140, weight: 700, color: 'primary', align: 'center', maxLines: 1, lineHeight: 1 },
    { id: 'review_text', type: 'text', bind: 'review_text', box: { x: 10, y: 47, w: 80, h: 24 }, font: 'display', size: 44, weight: 500, color: 'ink', align: 'right', maxLines: 5, lineHeight: 1.35 },
    { id: 'stars', type: 'text', bind: 'stars', box: { x: 10, y: 73, w: 40, h: 4.5 }, font: 'body', size: 36, weight: 400, color: 'primary', align: 'right', maxLines: 1 },
    { id: 'review_name', type: 'text', bind: 'review_name', box: { x: 50, y: 73.5, w: 40, h: 4 }, font: 'body', size: 30, weight: 700, color: 'muted', align: 'left', maxLines: 1 },
    { id: 'cta', type: 'text', bind: 'cta', box: { x: 6, y: 89, w: 50, h: 6 }, font: 'body', size: 32, weight: 700, color: 'contrast', align: 'center', maxLines: 1, background: { color: 'primary', radius: 40, padding: 16 } },
    { id: 'business_name', type: 'text', bind: 'business_name', box: { x: 58, y: 90, w: 36, h: 4 }, font: 'body', size: 26, weight: 600, color: 'muted', align: 'right', maxLines: 1 },
  ],
};
