// From her page to a calendar in fewer taps (2026-10-23 pass, I1): the main book buttons skip the second landing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const lp = read('./app/PublicLandingPage.tsx');
assert.ok(lp.includes('const bookStart = services.length === 1 ? `${bookBase}&service=${encodeURIComponent(String(services[0].name))}` : `${bookBase}&go=services`;'));
assert.ok(lp.includes('{canBook && <a href={bookStart} className="lp-btn lp-primary"'), 'the hero button uses it');
assert.ok(lp.includes('canBook && { key: "book", href: bookStart,'), 'the sticky bar uses it');
const bk = read('./app/BookingPage.jsx');
assert.ok(bk.includes('if (params.get("go") === "services") goServicesOnLoad.current = true;'));
assert.ok(/if \(loading \|\| !goServicesOnLoad\.current\) return;[\s\S]{0,200}getElementById\("bk-services"\)/.test(bk), 'scrolls to the treatments once loaded');
console.log('test-book-fewer-taps: ok');
