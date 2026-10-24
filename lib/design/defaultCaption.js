// lib/design/defaultCaption.js
//
// A ready post text for a design she has not written one for (2026-10-24). The "post text" box used to open empty
// until she ran the paid AI fill, so the "copied on the same tap" promise of the save/share panel copied nothing and
// her Instagram post went up with no caption. This writes a plain one from what the card already says: its headline
// and lines in her words, then her business and phone. No AI, no cost; she edits it like any other text.
//
// Lines are whole values, one per line, in the template's own order - nothing is wrapped or reordered here (the
// Hebrew/RTL rules in the kalmea skill are about drawn text; a caption is plain text the phone lays out itself).

// Card-only labels that mean nothing in a caption.
const SKIP = new Set(['quote_mark', 'label_before', 'label_after', 'business_name', 'contact', 'stars']);
const WORDY = new Set(['user', 'review_text', 'review_name']);

const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/**
 * @param {{ variables: Array<{ key: string, kind: string, source: string }> }} template
 * @param {Record<string, string>} values  the filled values (fillTemplate(...).values)
 * @param {{ business_name?: string, business_phone?: string } | null | undefined} settings
 * @returns {string}
 */
export function defaultCaption(template, values, settings) {
  const v = values || {};
  const lines = [];
  let cta = '';
  for (const x of template?.variables || []) {
    if (SKIP.has(x.key) || x.kind === 'stars') continue;
    const text = clean(v[x.key]);
    if (!text) continue;
    if (x.kind === 'cta') { cta = text; continue; }
    if (!WORDY.has(x.source) && x.key !== 'kicker' && x.key !== 'price_note') continue;
    if (x.key === 'review_text') lines.push(`"${text}"`);
    else if (x.key === 'review_name') lines.push(`- ${text}`);
    else lines.push(text);
  }
  const body = [...new Set(lines)];
  const name = clean(settings?.business_name);
  const phone = clean(settings?.business_phone);
  const footer = [];
  if (name) footer.push(`✨ ${name}`);
  if (phone) footer.push(`${cta || 'לקביעת תור'}: ${phone}`);
  else if (cta) footer.push(cta);
  return [body.join('\n'), footer.join('\n')].filter(Boolean).join('\n\n');
}
