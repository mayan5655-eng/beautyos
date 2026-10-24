// Onboarding needs a business name; the public page says "follow us" only with something to follow.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const ob = read('./app/onboarding/page.tsx');
assert.ok(/if \(step === 1 && !data\.business_name\.trim\(\)\) \{\s*setError\("מה השם של העסק\?/.test(ob), 'step 1 asks for the name');
assert.ok(ob.includes('{!(step === 1 && !data.business_name.trim()) && !(step === 4'), '"דלגי" does not skip it');
assert.ok(/if \(!data\.business_name\.trim\(\)\) \{\s*setStep\(1\);/.test(ob), 'an old draft without a name goes back to step 1');
assert.ok(read('./app/BookingPage.jsx').includes('eyebrow(socials.length > 0 ? "עקבו אחרינו" : "כתבי לנו")'));
console.log('test-onboarding-name-follow: ok');
