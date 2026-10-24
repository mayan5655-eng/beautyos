// The automatic booking address is Latin (a Hebrew one is percent-encoded in every copied link).
import assert from 'node:assert/strict';
import { latinSlugFromName, shortCodeSlug } from './lib/latinSlug.ts';
import { slugError } from './lib/slug.ts';
import { claimNameSlug } from './lib/autoSlug.ts';

const cases: Record<string, string> = {
  'סטודיו ציפורניים של רונית': 'studio-nails-by-ronit',
  'נועה ביוטי': 'noa-beauty',
  'קליניקת דנה': 'clinic-dana',
  'מיכל לק ג׳ל': 'michal-nails-gel',
  'הדר - טיפוח פנים': 'hadar-care-face',
  'Lily Nails': 'lily-nails',
  'Zohar B&Beauty': 'zohar-b-beauty',
};
for (const [name, want] of Object.entries(cases)) assert.equal(latinSlugFromName(name), want, name);

// Whatever the name, the result is a valid address made of a-z 0-9 and hyphens, or nothing.
for (const name of ['סטודיו בדיקה מלאה', 'שירה אשכנזי', 'יעל', 'א'.repeat(80), '!!!', '', 'ש"ס & co.', 'ביוטי 2000']) {
  const s = latinSlugFromName(name);
  assert.ok(/^[a-z0-9-]*$/.test(s), `${name} -> ${s}`);
  assert.ok(s.length <= 40);
  if (s.length >= 2) assert.equal(slugError(s), '', `${name} -> ${s} must pass the address rules`);
}

// The short code is valid and Latin.
for (let i = 0; i < 50; i++) { const c = shortCodeSlug(); assert.match(c, /^beauty-[a-z2-9]{5}$/); assert.equal(slugError(c), ''); }

// A name that gives nothing still leaves the email-handle placeholder behind: a short code is claimed.
{
  const tried: string[] = [];
  const rpc = async (_fn: string, a: Record<string, unknown>) => { tried.push(String(a.p_slug)); return { data: null, error: null }; };
  const got = await claimNameSlug(rpc, '!!!');
  assert.match(String(got), /^beauty-/);
  assert.equal(tried.length, 1);
}

console.log('test-latin-slug: ok');
