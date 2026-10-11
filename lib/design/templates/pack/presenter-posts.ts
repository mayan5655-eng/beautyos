// lib/design/templates/pack/presenter-posts.ts
//
// Six feed posts (4:5) with an AI character: full-bleed character, her name or logo across the top, the
// fixed "AI character" label, and a card with the headline, a line, the booking button and her contact.
// The same sets exist as reels in lib/design/reels/pack.ts.

import type { Template } from '../../contract.ts';
import { Frame, aiLabel } from './kit.ts';
import { CTA_DEFAULT, PRESENTERS, presenterSlot } from './presenters.ts';

function post(i: number): Template {
  const c = PRESENTERS[i];
  const f = new Frame('feed45');
  const slot = f.slot(presenterSlot('presenter', c));

  f.image(slot, { x: 0, y: 0, w: 1080, h: 1350 }, { focus: { x: 0.5, y: 0.18 }, overlay: { color: 'ink', opacity: 0.5, direction: 'top' }, id: 'photo' });
  f.logo({ x: 400, y: 56, w: 616, h: 72 }, 'surface');
  const badge = f.v('badge', 'התווית למעלה', c.badge, { max: 24 });
  f.text(badge, { x: 64, y: 62, w: 300, h: 60 }, { font: 'accent', size: 28, weight: 700, color: 'contrast', align: 'left', maxLines: 1, pill: { color: 'primary', radius: 40, padding: 22 }, id: 'badge' });
  aiLabel(f, slot, { x: 64, y: 150, w: 440, h: 56 }, 'ink', 'surface', 'left');

  f.shape({ x: 45, y: 850, w: 990, h: 455 }, 'surface', { radius: 38, id: 'card' });
  const headline = f.v('headline', 'כותרת', c.headlines[0], { max: 60, lineBreaks: true });
  f.text(headline, { x: 90, y: 880, w: 900, h: 190 }, { font: 'display', size: 84, weight: 700, color: 'ink', align: 'right', maxLines: 2, lineHeight: 1.1, id: 'headline' });
  const detail = f.v('detail', 'שורה מתחת לכותרת', c.detail, { max: 50 });
  f.text(detail, { x: 90, y: 1076, w: 900, h: 56 }, { size: 34, weight: 500, color: 'ink', align: 'right', maxLines: 1, id: 'detail' });
  const cta = f.v('cta', 'הזמנה לפעולה', CTA_DEFAULT, { max: 36, kind: 'cta' });
  f.shape({ x: 90, y: 1160, w: 900, h: 78 }, 'primary', { radius: 39, id: 'cta-pill' });
  f.text(cta, { x: 90, y: 1160, w: 900, h: 78 }, { size: 34, weight: 700, color: 'contrast', align: 'center', maxLines: 1, id: 'cta' });
  const contact = f.v('contact', 'טלפון ואינסטגרם', '', { source: 'contact', max: 80 });
  f.text(contact, { x: 90, y: 1252, w: 900, h: 40 }, { size: 26, weight: 600, color: 'ink', align: 'center', maxLines: 1, id: 'contact' });

  return f.build({
    key: `pk-${c.slug}-feed`, category: c.category, group: 'evergreen', fields: [c.field],
    name: `פוסט עם דמות · ${c.name}`,
    description: 'פוסט 4:5 עם דמות AI שמזמינה לקבוע תור. אפשר להחליף את הדמות בתמונה שלך, ואז התווית נעלמת.',
    needs: [],
    suggestedCaption: c.caption,
  });
}

export const PACK_PRESENTER_POSTS: Template[] = PRESENTERS.map((_, i) => post(i));
