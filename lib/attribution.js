// lib/attribution.js
//
// Which ad (or link, or post) brought her here? Pure functions, no DOM and no network, so every rule
// is tested (test-attribution.ts).
//
// Until 2026-10-06 nothing carried a campaign from the landing page to the account: the CTA was a plain
// /signup, no cookie or storage kept the UTM, and tenants.signup_source - which the admin panel has a
// column for - was empty for every tenant. So "which ad worked" could not be answered.
//
// First touch wins: the cookie is written once, on the first landing that carries a campaign (utm_*, a
// click id) or an external referrer, and kept 30 days. When she has an account the onboarding page sends
// it to /api/attribution, which writes tenants.signup_source if it is still empty and the cookie is
// cleared. The label is short and human ("facebook / cpc / audit-2026-10") because the admin panel shows
// it in a table cell.

export const ATTR_COOKIE = 'kl_attr';
export const ATTR_MAX_AGE_S = 30 * 24 * 60 * 60;

const KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const CLICK_IDS = { fbclid: 'facebook', gclid: 'google', ttclid: 'tiktok', msclkid: 'bing' };

const clean = (v, n = 60) => String(v ?? '').replace(/[^\p{L}\p{N}_.\-/ +]/gu, '').trim().slice(0, n);

/**
 * What a landing carries: its UTM parameters, a click id if any, else the external referrer's host.
 * Returns null when it carries nothing worth keeping (a plain visit with no campaign and no outside referrer).
 */
export function readAttribution({ search = '', referrer = '', ownHost = '' } = {}) {
  let params;
  try { params = new URLSearchParams(search); } catch { params = new URLSearchParams(''); }
  const out = {};
  for (const k of KEYS) { const v = clean(params.get(k)); if (v) out[k] = v; }
  for (const [id, platform] of Object.entries(CLICK_IDS)) { if (params.get(id)) { out.click = platform; break; } }
  // The outside referrer's host is kept as well, even next to a UTM (2026-11-10): "instagram / bio" says which link,
  // the referrer says which app actually opened it (l.instagram.com, m.facebook.com, open.spotify.com...).
  let host = '';
  try { host = new URL(referrer).hostname.replace(/^www\./, ''); } catch { /* no usable referrer */ }
  const own = String(ownHost || '').replace(/^www\./, '');
  if (host && host !== own && !host.endsWith(`.${own}`) && !/\.vercel\.app$/.test(host)) { const r = clean(host, 80); if (r) out.ref = r; }
  return Object.keys(out).length ? out : null;
}

export function serializeAttribution(obj) {
  return encodeURIComponent(JSON.stringify({ ...obj, t: Math.floor(Date.now() / 1000) }));
}

/** The cookie value back to an object holding only the keys we ever write, each bounded. Anything else -> null. */
export function parseAttribution(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let o;
  try { o = JSON.parse(decodeURIComponent(raw)); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out = {};
  for (const k of [...KEYS, 'ref']) if (typeof o[k] === 'string' && clean(o[k])) out[k] = clean(o[k], k === 'ref' ? 80 : 60);
  if (typeof o.click === 'string' && Object.values(CLICK_IDS).includes(o.click)) out.click = o.click;
  return Object.keys(out).length ? out : null;
}

/** "facebook / cpc / audit-2026-10": source / medium / campaign, falling back to the click id or referrer. */
export function signupSourceLabel(attr) {
  const a = attr || {};
  const source = a.utm_source || a.click || a.ref || '';
  if (!source) return '';
  return [source, a.utm_medium || (a.click && !a.utm_source ? 'click' : ''), a.utm_campaign || ''].filter(Boolean).join(' / ').slice(0, 120);
}

/**
 * The structured copy of the same first touch, for the tenants.signup_utm_* / signup_referrer columns
 * (supabase/migrations/signup_attribution_columns_2026-11-10.sql). Every value is already cleaned and bounded by
 * parseAttribution; a missing one is null, never an empty string.
 */
export function attributionColumns(attr) {
  const a = attr || {};
  const v = (x) => (typeof x === 'string' && x ? x : null);
  return {
    signup_utm_source: v(a.utm_source),
    signup_utm_medium: v(a.utm_medium),
    signup_utm_campaign: v(a.utm_campaign),
    signup_referrer: v(a.ref),
  };
}

export const UNKNOWN_SOURCE_LABEL_HE = 'לא ידוע';

/** "instagram / bio / reel-3" -> "instagram": the channel, for a count by source. Case-insensitive; empty -> "לא ידוע". */
export function sourceChannel(label) {
  const first = String(label ?? '').split(' / ')[0].trim().toLowerCase();
  return first || UNKNOWN_SOURCE_LABEL_HE;
}

/** How many signups each channel brought, most first ("לא ידוע" always last, it is not a channel). */
export function countBySource(labels) {
  const map = new Map();
  for (const l of labels || []) { const k = sourceChannel(l); map.set(k, (map.get(k) || 0) + 1); }
  return [...map.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => (a.source === UNKNOWN_SOURCE_LABEL_HE) - (b.source === UNKNOWN_SOURCE_LABEL_HE) || b.count - a.count || a.source.localeCompare(b.source));
}
