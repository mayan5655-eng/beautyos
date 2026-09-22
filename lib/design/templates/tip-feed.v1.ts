import type { Template } from '../contract.ts';

// A tip, feed 4:5. No photo required: a gradient plate in her colours, a
// kicker, the tip as a big title and a few lines of body. Her portrait, when
// she has one, sits as a small round badge next to her name.
export const tipFeedV1: Template = {
  key: 'tip-feed',
  version: 1,
  category: 'tip',
  format: 'feed45',
  name: 'טיפ',
  description: 'טיפ מקצועי על רקע בצבעי המותג, בלי צורך בתמונה.',
  needs: [],
  variables: [
    { key: 'kicker', label: 'כותרת עליונה', kind: 'text', source: 'static', default: 'טיפ מהקוסמטיקאית', maxLength: 24 },
    { key: 'title', label: 'הטיפ', kind: 'text', source: 'user', default: 'קרם הגנה גם בחורף', maxLength: 44, required: true },
    { key: 'body', label: 'הסבר', kind: 'text', source: 'user', default: 'קרינת UVA עוברת עננים וזכוכית. מריחה קטנה בבוקר שומרת על הקולגן ומונעת כתמים.', maxLength: 180 },
    { key: 'therapist_name', label: 'שם', kind: 'text', source: 'therapist_name', maxLength: 30 },
    { key: 'therapist_title', label: 'תפקיד', kind: 'text', source: 'therapist_title', default: 'קוסמטיקאית', maxLength: 30 },
    { key: 'cta', label: 'כפתור', kind: 'cta', source: 'user', default: 'שאלות? כתבי לי', maxLength: 22 },
  ],
  slots: [
    { key: 'portrait', label: 'תמונה שלך', sources: ['portrait', 'upload'] },
  ],
  layers: [
    { id: 'plate', type: 'shape', box: { x: 0, y: 0, w: 100, h: 100 }, color: 'primary', gradient: { to: 'deep', angle: 160 } },
    { id: 'card', type: 'shape', box: { x: 6, y: 9, w: 88, h: 70 }, color: 'surface', opacity: 0.96, radius: 36 },
    { id: 'kicker', type: 'text', bind: 'kicker', box: { x: 10, y: 14, w: 80, h: 4 }, font: 'body', size: 28, weight: 700, color: 'primary', align: 'right', maxLines: 1 },
    { id: 'title', type: 'text', bind: 'title', box: { x: 10, y: 20, w: 80, h: 16 }, font: 'display', size: 76, weight: 700, color: 'ink', align: 'right', maxLines: 3, lineHeight: 1.08 },
    { id: 'body', type: 'text', bind: 'body', box: { x: 10, y: 38, w: 80, h: 30 }, font: 'body', size: 34, weight: 400, color: 'ink', align: 'right', maxLines: 6, lineHeight: 1.45 },
    { id: 'cta', type: 'text', bind: 'cta', box: { x: 10, y: 70, w: 44, h: 6 }, font: 'body', size: 30, weight: 700, color: 'contrast', align: 'center', maxLines: 1, background: { color: 'primary', radius: 36, padding: 14 } },
    { id: 'portrait', type: 'image', slot: 'portrait', box: { x: 79, y: 83, w: 15, h: 12 }, fit: 'cover', radius: 999, focus: { x: 0.5, y: 0.3 } },
    { id: 'therapist_name', type: 'text', bind: 'therapist_name', box: { x: 30, y: 85, w: 47, h: 4 }, font: 'display', size: 34, weight: 700, color: 'surface', align: 'right', maxLines: 1 },
    { id: 'therapist_title', type: 'text', bind: 'therapist_title', box: { x: 30, y: 89.5, w: 47, h: 3.5 }, font: 'body', size: 26, weight: 400, color: 'surface', align: 'right', maxLines: 1 },
    { id: 'logo', type: 'logo', box: { x: 6, y: 84, w: 20, h: 9 }, fallback: 'none', color: 'surface' },
  ],
};
