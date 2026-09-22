import type { Template } from '../contract.ts';

// Before / after, feed 4:5. Two client photos side by side on a tinted
// plate, "לפני" on the right and "אחרי" on the left as Hebrew reads, a
// headline above, CTA below. Both slots demand recorded consent.
export const beforeAfterFeedV1: Template = {
  key: 'before-after-feed',
  version: 1,
  category: 'before_after',
  format: 'feed45',
  name: 'לפני / אחרי',
  description: 'שתי תמונות של לקוחה, זו לצד זו, עם כותרת וכפתור.',
  needs: ['תמונת לפני ותמונת אחרי של לקוחה שאישרה פרסום'],
  variables: [
    { key: 'headline', label: 'כותרת', kind: 'text', source: 'user', default: 'התוצאה אחרי טיפול אחד', maxLength: 40, required: true },
    { key: 'label_before', label: 'תווית ימין', kind: 'text', source: 'static', default: 'לפני', maxLength: 10 },
    { key: 'label_after', label: 'תווית שמאל', kind: 'text', source: 'static', default: 'אחרי', maxLength: 10 },
    { key: 'note', label: 'הערה', kind: 'text', source: 'user', default: 'ללא פילטרים, באור טבעי', maxLength: 50 },
    { key: 'cta', label: 'כפתור', kind: 'cta', source: 'user', default: 'גם את? לקביעת תור', maxLength: 26 },
    { key: 'business_name', label: 'שם העסק', kind: 'text', source: 'business_name', maxLength: 40 },
  ],
  slots: [
    { key: 'before', label: 'לפני', sources: ['before', 'upload'], required: true, consent: true },
    { key: 'after', label: 'אחרי', sources: ['after', 'upload'], required: true, consent: true },
  ],
  layers: [
    { id: 'plate', type: 'shape', box: { x: 0, y: 0, w: 100, h: 100 }, color: 'tint', gradient: { to: 'surface', angle: 180 } },
    { id: 'logo', type: 'logo', box: { x: 70, y: 4, w: 24, h: 8 }, fallback: 'business_name', color: 'deep' },
    { id: 'headline', type: 'text', bind: 'headline', box: { x: 6, y: 14, w: 88, h: 9 }, font: 'display', size: 66, weight: 700, color: 'ink', align: 'right', maxLines: 2, lineHeight: 1.05 },
    { id: 'before', type: 'image', slot: 'before', box: { x: 51, y: 26, w: 43, h: 48 }, fit: 'cover', radius: 24, focus: { x: 0.5, y: 0.35 } },
    { id: 'after', type: 'image', slot: 'after', box: { x: 6, y: 26, w: 43, h: 48 }, fit: 'cover', radius: 24, focus: { x: 0.5, y: 0.35 } },
    { id: 'label_before', type: 'text', bind: 'label_before', box: { x: 64, y: 69, w: 18, h: 4 }, font: 'body', size: 26, weight: 700, color: 'ink', align: 'center', maxLines: 1, background: { color: 'surface', radius: 20, padding: 10 } },
    { id: 'label_after', type: 'text', bind: 'label_after', box: { x: 19, y: 69, w: 18, h: 4 }, font: 'body', size: 26, weight: 700, color: 'contrast', align: 'center', maxLines: 1, background: { color: 'primary', radius: 20, padding: 10 } },
    { id: 'note', type: 'text', bind: 'note', box: { x: 6, y: 77, w: 88, h: 4 }, font: 'body', size: 30, weight: 400, color: 'muted', align: 'right', maxLines: 1 },
    { id: 'cta', type: 'text', bind: 'cta', box: { x: 6, y: 84, w: 88, h: 6.5 }, font: 'body', size: 36, weight: 700, color: 'contrast', align: 'center', maxLines: 1, background: { color: 'primary', radius: 40, padding: 18 } },
    { id: 'business_name', type: 'text', bind: 'business_name', box: { x: 6, y: 93.5, w: 88, h: 3.5 }, font: 'body', size: 26, weight: 600, color: 'muted', align: 'right', maxLines: 1 },
  ],
};
