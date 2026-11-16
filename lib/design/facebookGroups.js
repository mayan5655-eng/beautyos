// lib/design/facebookGroups.js
//
// "הקבוצות שלי": the Facebook groups she posts in, saved once, so the save/share panel can open each one with the
// post text on her clipboard and remember where she already posted this week.
//
// Why not post for her: Meta closed the Groups API in April 2024 - no app can publish to a group any more. So
// the panel does everything around the last tap (text copied, image saved, the right group opened) and she taps
// "פרסום" in Facebook. No Meta permission or app review is involved: nothing here calls Facebook.
//
// Pure helpers, shared by app/api/facebook-groups and app/design/FacebookGroups.jsx.

export const MAX_GROUPS = 50;
export const MAX_NAME = 80;
export const MAX_RULE = 140;

const FB_HOSTS = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com', 'mbasic.facebook.com', 'web.facebook.com', 'fb.com', 'www.fb.com']);

/**
 * A group link she pasted -> a clean https://www.facebook.com/... link, or null when it is not a Facebook group.
 * Accepts facebook.com/groups/<id or name>, the newer share links (facebook.com/share/g/<code>), with or without
 * https://, from the app (m.) or a desktop, with tracking junk after it.
 */
export function normalizeGroupUrl(raw) {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  // Facebook's "copy link" sometimes arrives inside a sentence; take the first link-looking token.
  const m = s.match(/(https?:\/\/)?([a-z0-9.-]*\b(?:facebook|fb)\.com)\/[^\s]+/i);
  if (!m) return null;
  s = m[0];
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!FB_HOSTS.has(u.hostname.toLowerCase())) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  let path;
  if (parts[0]?.toLowerCase() === 'groups' && parts[1] && /^[\w.-]+$/.test(parts[1])) path = `groups/${parts[1]}`;
  else if (parts[0]?.toLowerCase() === 'share' && parts[1]?.toLowerCase() === 'g' && parts[2] && /^[\w-]+$/.test(parts[2])) path = `share/g/${parts[2]}`;
  else return null;
  return `https://www.facebook.com/${path}/`;
}

const clip = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** What a new group may be: { name, url, rule } or { error } in her words. */
export function cleanGroupInput(body) {
  const url = normalizeGroupUrl(body?.url);
  if (!url) return { error: 'זה לא נראה כמו קישור לקבוצה בפייסבוק. בקבוצה: שיתוף ← העתקת קישור' };
  const name = clip(body?.name, MAX_NAME);
  if (!name) return { error: 'חסר שם לקבוצה' };
  return { name, url, rule: clip(body?.rule, MAX_RULE) || null };
}

/** Start of this week (Sunday 00:00, Israel's week) for a given moment, in local time. */
export function weekStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

/** Did she post in this group since Sunday? */
export function postedThisWeek(lastPostedAt, now = new Date()) {
  if (!lastPostedAt) return false;
  const t = new Date(lastPostedAt).getTime();
  return Number.isFinite(t) && t >= weekStart(now).getTime() && t <= now.getTime() + 60_000;
}

/** Groups she has not posted in this week first, then the rest; by name inside each. */
export function sortGroups(groups, now = new Date()) {
  return [...(Array.isArray(groups) ? groups : [])].sort((a, b) => {
    const pa = postedThisWeek(a.last_posted_at, now) ? 1 : 0;
    const pb = postedThisWeek(b.last_posted_at, now) ? 1 : 0;
    return pa - pb || String(a.name).localeCompare(String(b.name), 'he');
  });
}
