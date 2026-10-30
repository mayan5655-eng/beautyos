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

// React #310 guard (found on the preview 2026-10-24): no hook may come after BookingPage's first early return.
{
  const body = bk.slice(bk.indexOf('export default function BookingPage('));
  const firstReturn = body.search(/\n\s*if \(loading\) \{/);
  assert.ok(firstReturn > 0, 'the loading early return is where we think it is');
  const after = body.slice(firstReturn);
  assert.ok(!/\buse(Effect|State|Ref|Memo|Callback|LayoutEffect)\(/.test(after), 'no hook after the early returns in BookingPage');
  console.log('test-book-fewer-taps: hook order ok');
}
