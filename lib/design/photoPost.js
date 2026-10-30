// lib/design/photoPost.js
//
// "Photo to ready post + story" (2026-10-25): right after a treatment she takes ONE photo and gets a finished 4:5 post
// and a 9:16 story in her own brand. The drawing, the branding and the share panel are the studio's own; this file is
// only the short path's decisions, kept pure so they are tested:
//   * which existing template a bare photo goes into (a full-bleed, photo-first one, in her field, with a story twin);
//   * whether the photo may be used at all (an explicit yes about the client, the same rule as the image picker);
//   * what she may type over the template's headline.
// The photo itself never leaves her phone: it is drawn from a local blob URL and nothing is uploaded or saved, so a
// client's picture is not in any bucket (the picker's own "upload" puts it in the public one).

/**
 * Feed keys that are photo-first: the picture fills the whole card, one required headline that has a good default,
 * no price. In the order she sees them; "another design" steps through them. Every key has a -story twin (a test
 * proves both exist and are full-bleed, so a library edit cannot quietly break this list).
 */
export const PHOTO_FEED_KEYS = {
  cosmetics: ['pampering-feed', 'anti-aging-feed', 'self-care-feed'],
  nails: ['nail-new-shade-feed', 'nail-art-macro-feed', 'nail-event-feed'],
};

/** The candidate feed keys for a tenant's fields: one field = its list, both = the two lists interleaved. */
export function photoCandidates(fields) {
  const f = Array.isArray(fields) ? fields : [];
  const nails = f.includes('nails');
  const cos = f.includes('cosmetics');
  if (nails && cos) {
    const out = [];
    for (let i = 0; i < Math.max(PHOTO_FEED_KEYS.cosmetics.length, PHOTO_FEED_KEYS.nails.length); i++) {
      for (const k of ['nails', 'cosmetics']) if (PHOTO_FEED_KEYS[k][i]) out.push(PHOTO_FEED_KEYS[k][i]);
    }
    return out;
  }
  return nails ? PHOTO_FEED_KEYS.nails : PHOTO_FEED_KEYS.cosmetics;
}

/** The feed key and its story key for step `index` (wraps around), so "another design" never runs out. */
export function pickPhotoKeys(fields, index = 0) {
  const list = photoCandidates(fields);
  const n = Number.isInteger(index) ? index : 0;
  const feed = list[((n % list.length) + list.length) % list.length];
  return { feed, story: feed.replace(/-feed$/, '-story') };
}

/** Where the first pick starts, so two days in a row do not open on the same design. Any integer; the day of the year. */
export function startIndex(now = new Date()) {
  const start = Date.UTC(now.getFullYear(), 0, 0);
  return Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - start) / 86400000);
}

/**
 * May this photo be used? Only after she says, for THIS photo, that the client agreed to have it posted (or that it is
 * not a client at all, e.g. her own hands). Unchecked is the default and it fails closed.
 * @returns {{ ok: boolean, why: string }}
 */
export function photoUse({ hasPhoto, agreed, readOnly }) {
  if (readOnly) return { ok: false, why: 'החשבון במצב קריאה בלבד' };
  if (!hasPhoto) return { ok: false, why: 'צריך תמונה' };
  if (agreed !== true) return { ok: false, why: 'סמני שהלקוחה אישרה לפרסם את התמונה' };
  return { ok: true, why: '' };
}

/** What may be read from a file input: an image, not absurdly large. null = fine, otherwise the Hebrew reason. */
export function photoFileProblem(file, maxBytes = 25 * 1024 * 1024) {
  if (!file) return 'לא נבחרה תמונה';
  if (!/^image\//i.test(String(file.type || ''))) return 'אפשר לבחור רק תמונה';
  if (Number(file.size) > maxBytes) return 'התמונה גדולה מדי (עד 25MB)';
  return null;
}

/** The headline she typed over the default: trimmed, single-spaced, cut to the template's limit; empty = keep the default. */
export function headlineInput(raw, maxLength = 40) {
  const s = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  return s.slice(0, Math.max(1, maxLength));
}

/**
 * The `inputs` for fillTemplate: only the headline, and only when she changed it.
 * @returns {Record<string, string>}
 */
export function photoInputs(headline, template) {
  const v = (template?.variables || []).find((x) => x.key === 'headline');
  const h = headlineInput(headline, v?.maxLength || 40);
  return h && h !== (v?.default || '') ? { headline: h } : {};
}

/**
 * The post text. Built from the card's own words and her business line (lib/design/defaultCaption.js: free, no AI),
 * and never anything about the client: no name, no treatment she did for her.
 */
export function photoCaption(buildCaption, template, values, settings, edited) {
  if (typeof edited === 'string') return edited;
  return buildCaption(template, values, settings);
}
