// The small copy / a11y batch from the 2026-10-23 full pass (S4 items).
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const dash = read('./app/beautyos.jsx');

assert.ok(!dash.includes('אסתתי'), 'no made-up skin type');
assert.ok(dash.includes('const SKIN_TYPES = ["רגיל","יבש","שמן","מעורב","רגיש","נוטה לאקנה"];'));
assert.ok(dash.includes('function fmtDateHe(iso)'), 'one Hebrew date helper');
assert.ok(/לבטל את התור של \$\{appt\.name\} \(\$\{appt\.service\}, \$\{fmtDateHe\(appt\.date\)\}/.test(dash), 'cancel dialog date in Hebrew form');
assert.ok(dash.includes('{isPersonal(appt)?"מחיקת האירוע":"ביטול התור"}'), 'the menu says what it does (cancel, not delete)');
assert.ok(!dash.includes('>Beauty Voice ✦</h3>'), 'no old English brand on the voice sheet');
assert.ok(!dash.includes('יחזרו אליך'), 'support line grammar');
assert.ok(!/>דחייה<\/button>/.test(dash), '"דחייה" read as rejecting the booking');
assert.ok(dash.includes('const emptyLead = {name:"",phone:"",source:"",'), 'a new lead has no source until she picks one');
assert.ok(dash.includes('source:newLead.source||null'), 'an unpicked source is saved as unknown, not Facebook');

// fmtDateHe itself
const m = /function fmtDateHe\(iso\) \{([\s\S]*?)\n\}/.exec(dash);
assert.ok(m);
const fmtDateHe = new Function('iso', m![1]) as (s: string) => string;
assert.equal(fmtDateHe('2026-10-25'), '25.10.2026');
assert.equal(fmtDateHe('2026-01-05T10:00:00'), '5.1.2026');
assert.equal(fmtDateHe(''), '');
assert.equal(fmtDateHe('לא תאריך'), 'לא תאריך');

// Skin scan photo slots are keyboard buttons.
const scan = read('./app/skin-scan/page.jsx');
assert.ok(scan.includes('role="button" tabIndex={0} aria-label={`צילום ${a.label}'), 'photo slots reachable by keyboard and screen reader');

// Client-facing pages carry their own title, not Kalmea's slogan.
for (const f of ['./app/form/layout.tsx', './app/review/layout.tsx', './app/community/layout.tsx', './app/skin-scan/layout.tsx', './app/confirm/layout.tsx']) {
  const s = read(f);
  assert.match(s, /title: '[^']+'/, `${f} has a title`);
  assert.ok(!s.includes('עסק פורח'), `${f} does not reuse the slogan`);
  assert.match(s, /robots: \{ index: false, follow: false \}/, `${f} stays out of search`);
}

// Sitemap lists the tutorials page.
assert.ok(read('./app/sitemap.ts').includes("['/tutorials', 0.5]"));

console.log('test-small-copy-a11y-1024: ok');
