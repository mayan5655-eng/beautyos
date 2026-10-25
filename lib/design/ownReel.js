// lib/design/ownReel.js
//
// "רילס מהצילומים שלי" (2026-10-25): she picks her own photos and short clips (her work, before/after, a treatment) and
// gets a finished 9:16 reel in her brand: her colour, her logo or business name, one Hebrew line per scene, a closing
// card with how to book. The drawing is app/design/ownReelDraw.js and the encoder is the studio's (reelEncoder.js);
// this file is only the decisions, kept pure so they are tested:
//   * what a file may be (a photo or a video, not absurdly large);
//   * how long each scene runs, so the whole reel stays short enough to be watched to the end;
//   * the words on each scene (one line each, chosen by us, never auto-wrapped: .claude/skills/kalmea §4);
//   * the closing card's lines, one per line, each Hebrew-first or a bare number/handle;
//   * whether the media may be used at all (an explicit yes about the client, the same rule as photo-to-post).
// Nothing she picks leaves her phone: no upload, no bucket, no AI.

import { glueShekel } from './canvasText.ts';

export const MAX_ITEMS = 6;
export const PHOTO_MS = 2600;
export const VIDEO_MAX_MS = 6000;
export const VIDEO_MIN_MS = 1500;
export const END_MS = 3000;
/** Media scenes together stay under this, so the reel with its closing card is at most ~30 seconds. */
export const MEDIA_BUDGET_MS = 27000;
export const CAPTION_MAX = 32;
export const HEADLINE_MAX = 28;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

/** 'photo' | 'video' | null for a picked file. iPhone .mov / .heic sometimes come with an empty type: the name decides. */
export function mediaKind(file) {
  const t = String(file?.type || '').toLowerCase();
  if (t.startsWith('image/')) return 'photo';
  if (t.startsWith('video/')) return 'video';
  const n = String(file?.name || '').toLowerCase();
  if (/\.(jpe?g|png|webp|heic|heif|gif)$/.test(n)) return 'photo';
  if (/\.(mp4|mov|m4v|webm|3gp)$/.test(n)) return 'video';
  return null;
}

/** null = fine, otherwise the Hebrew reason this file cannot go into a reel. */
export function ownMediaProblem(file) {
  if (!file) return 'לא נבחר קובץ';
  const kind = mediaKind(file);
  if (!kind) return 'אפשר לבחור רק תמונות או סרטונים';
  if (kind === 'photo' && Number(file.size) > MAX_IMAGE_BYTES) return 'התמונה גדולה מדי (עד 25MB)';
  if (kind === 'video' && Number(file.size) > MAX_VIDEO_BYTES) return 'הסרטון גדול מדי (עד 200MB). אפשר לקצר אותו בגלריה של הטלפון ולנסות שוב.';
  return null;
}

/** How many more she may add, and the Hebrew note when she picked more than fit. */
export function roomFor(current, picked) {
  const room = Math.max(0, MAX_ITEMS - (Number(current) || 0));
  const take = Math.min(room, Math.max(0, Number(picked) || 0));
  return { take, note: picked > take ? `אפשר עד ${MAX_ITEMS} תמונות וסרטונים ברילס אחד. נכנסו ${take} הראשונים.` : '' };
}

/**
 * The timeline. items: [{ kind: 'photo' | 'video', durationMs? }]. A photo holds PHOTO_MS; a clip plays from its start
 * for up to VIDEO_MAX_MS (shorter if the clip is shorter), and when the clips together would run past the budget they
 * are all shortened by the same factor (never under VIDEO_MIN_MS, or the clip's own length).
 * @returns {{ scenes: { kind: 'photo'|'video'|'end', item: number, ms: number, startMs: number }[], totalMs: number }}
 */
export function planOwnReel(items) {
  const list = Array.isArray(items) ? items.slice(0, MAX_ITEMS) : [];
  const want = list.map((it) => {
    if (it?.kind !== 'video') return PHOTO_MS;
    const d = Number(it.durationMs);
    return d > 0 ? Math.min(VIDEO_MAX_MS, d) : VIDEO_MAX_MS;
  });
  const photoMs = list.reduce((n, it) => n + (it?.kind === 'video' ? 0 : PHOTO_MS), 0);
  const videoMs = want.reduce((n, ms, i) => n + (list[i]?.kind === 'video' ? ms : 0), 0);
  const room = MEDIA_BUDGET_MS - photoMs;
  const k = videoMs > room && videoMs > 0 ? Math.max(0, room) / videoMs : 1;
  const scenes = [];
  let at = 0;
  list.forEach((it, i) => {
    let ms = want[i];
    if (it?.kind === 'video' && k < 1) ms = Math.min(want[i], Math.max(VIDEO_MIN_MS, Math.round(want[i] * k)));
    ms = Math.round(ms);
    scenes.push({ kind: it?.kind === 'video' ? 'video' : 'photo', item: i, ms, startMs: at });
    at += ms;
  });
  scenes.push({ kind: 'end', item: -1, ms: END_MS, startMs: at });
  return { scenes, totalMs: at + END_MS };
}

/** One line of words for a scene: single-spaced, no line breaks, ₪ glued to its number, cut to the limit. */
export function captionLine(raw, max = CAPTION_MAX) {
  const s = typeof raw === 'string' ? glueShekel(raw.replace(/\s+/g, ' ').trim()) : '';
  return Array.from(s).slice(0, Math.max(1, max)).join('').trim();
}

const LINES = {
  cosmetics: ['רגע של טיפוח', 'תשומת לב לכל פרט', 'העור מודה לך', 'התוצאה מדברת', 'זמן לעצמך', 'זוהר טבעי'],
  nails: ['ציפורניים חדשות', 'כל פרט בדיוק', 'הגוון של העונה', 'עבודת יד', 'מוכנה לכל אירוע', 'התוצאה'],
};

/** The opening line over the first scene, by her field. */
export function defaultHeadline(fields) {
  const f = Array.isArray(fields) ? fields : [];
  return f.includes('nails') && !f.includes('cosmetics') ? 'העבודה שלי' : 'מהטיפולים שלי';
}

/**
 * Default words per scene. In before/after mode the first is "לפני" and the last "אחרי" (and the ones between are
 * left empty: the pictures speak); otherwise a calm line per scene from her field's list.
 * @param {number} n
 * @param {{ beforeAfter?: boolean, fields?: string[] }} [opts]
 * @returns {string[]}
 */
export function defaultCaptions(n, { beforeAfter = false, fields = [] } = {}) {
  const count = Math.max(0, Math.min(MAX_ITEMS, Number(n) || 0));
  if (beforeAfter && count >= 2) return Array.from({ length: count }, (_, i) => (i === 0 ? 'לפני' : i === count - 1 ? 'אחרי' : ''));
  const f = Array.isArray(fields) ? fields : [];
  const list = f.includes('nails') && !f.includes('cosmetics') ? LINES.nails : LINES.cosmetics;
  return Array.from({ length: count }, (_, i) => list[i % list.length]);
}

/** Before/after is offered only when there is a "before" and an "after" to show. */
export const canBeforeAfter = (n) => Number(n) >= 2;

/**
 * The closing card, one entry per line, top to bottom. Each line is drawn on its own (a phone number never shares a
 * line with Hebrew, so it cannot flip the line's direction). Missing details are simply left out.
 * @param {{ businessName?: string, phone?: string, instagram?: string, showPhone?: boolean, showInstagram?: boolean }} [opts]
 * @returns {{ role: 'name'|'cta'|'phone'|'handle', text: string }[]}
 */
export function endCardLines({ businessName, phone, instagram, showPhone = true, showInstagram = true } = {}) {
  const out = [];
  const name = captionLine(businessName || '', 40);
  if (name) out.push({ role: 'name', text: name });
  const p = typeof phone === 'string' ? phone.replace(/[^\d+]/g, '') : '';
  const h = typeof instagram === 'string' ? instagram.trim() : '';
  const shownPhone = showPhone && p.length >= 9 ? p : '';
  const shownHandle = showInstagram && /^@[A-Za-z0-9._]{1,30}$/.test(h) ? h : '';
  if (shownPhone || shownHandle) out.push({ role: 'cta', text: shownPhone ? 'לקביעת תור' : 'עקבי אחריי' });
  if (shownPhone) out.push({ role: 'phone', text: shownPhone });
  if (shownHandle) out.push({ role: 'handle', text: shownHandle });
  return out;
}

/**
 * May these pictures and clips be used? Only after she says the client agreed to have them posted (or that no client
 * is in them, e.g. her own hands or the studio). Unchecked is the default and it fails closed.
 * @returns {{ ok: boolean, why: string }}
 */
export function ownReelUse({ count, agreed, readOnly }) {
  if (readOnly) return { ok: false, why: 'החשבון במצב קריאה בלבד' };
  if (!(Number(count) > 0)) return { ok: false, why: 'צריך לפחות תמונה או סרטון אחד' };
  if (agreed !== true) return { ok: false, why: 'סמני שהלקוחה אישרה לפרסם את התמונות והסרטונים' };
  return { ok: true, why: '' };
}

/**
 * The post text: her words when she edited it, otherwise her headline, business line and handle. Never a client's name.
 * @param {{ headline?: string, businessName?: string, phone?: string, instagram?: string, edited?: string }} [opts]
 */
export function ownReelCaption({ headline, businessName, phone, instagram, edited } = {}) {
  if (typeof edited === 'string') return edited;
  const lines = [captionLine(headline || '', HEADLINE_MAX), captionLine(businessName || '', 40)].filter(Boolean);
  const contact = [phone ? `לקביעת תור: ${String(phone).replace(/[^\d+]/g, '')}` : '', instagram || ''].filter(Boolean);
  return [lines.join(' · '), ...contact].filter(Boolean).join('\n');
}
