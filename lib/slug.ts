// lib/slug.ts
//
// The rules for a cosmetician's own URL, in the browser.
//
// THE DATABASE IS THE AUTHORITY, not this file: tenants_slug_shape and
// tenants_slug_not_reserved in supabase/migrations/add_tenant_slug_rules.sql
// are what actually decide, because the claim form will not be the only thing
// that ever writes this column. What is here exists to fail fast and say why in
// Hebrew, instead of letting her type a slug, press save, and read a raw 23514.
//
// If the two ever drift, the database wins and the message she gets is still
// true - "not available" - just less specific. That is the right way round.

/**
 * Both alphabets, deliberately. A cosmetician typing her own name in Hebrew and
 * getting bloomos.app/דנה-קוסמטיקס is the point of the feature, not a
 * compromise in it. No transliteration: machine-Latinised Hebrew gives her a
 * name she would not recognise as hers.
 *
 * א-ת is U+05D0..U+05EA, which includes the final forms (ך ם ן ף ץ) because
 * they are interleaved in that range rather than appended after it.
 */
export const SLUG_RE = /^[a-z0-9א-ת]+(-[a-z0-9א-ת]+)*$/;

export const SLUG_MIN = 2;
export const SLUG_MAX = 40;

/** Mirrors tenants_slug_not_reserved. Routes first, then names worth holding. */
export const RESERVED_SLUGS = new Set([
  'api', 'auth', 'book', 'claim', 'community', 'confirm', 'dashboard',
  'form', 'login', 'onboarding', 'privacy', 'reset-password', 'signup',
  'skin-scan', 'terms',
  'admin', 'app', 'assets', 'blog', 'help', 'icons', 'images', 'new',
  'pricing', 'public', 'settings', 'splash', 'static', 'support',
  'www', '_next',
]);

/** '' when the value is usable. Otherwise the reason, in Hebrew. */
export function slugError(value: string): string {
  const v = String(value || '').trim();
  if (!v) return '';
  if (v.length < SLUG_MIN || v.length > SLUG_MAX) return `בין ${SLUG_MIN} ל-${SLUG_MAX} תווים`;
  if (/[A-Z]/.test(v)) return 'אותיות אנגליות קטנות בלבד';
  if (v.startsWith('-') || v.endsWith('-')) return 'הכתובת לא יכולה להתחיל או להסתיים במקף';
  if (v.includes('--')) return 'בלי שני מקפים ברצף';
  if (!SLUG_RE.test(v)) return 'אותיות בעברית או באנגלית, מספרים ומקף בלבד';
  if (RESERVED_SLUGS.has(v)) return 'הכתובת הזו שמורה למערכת';
  return '';
}

/**
 * A first suggestion from her business name. A SEED, not a rule: whatever it
 * produces she can edit, and it is only offered when the field is empty.
 *
 * Hebrew is caseless so toLowerCase touches only the Latin half, which is
 * exactly the asymmetry we want - "Dana Beauty" becomes dana-beauty, and
 * "דנה קוסמטיקס" is already in its final form.
 */
export function slugify(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_.]+/g, '-')
    .replace(/[^a-z0-9א-ת-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
}
