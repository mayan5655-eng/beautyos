// Accessibility statement and the fixes behind its claims (IS 5568 / WCAG 2.0 AA). Pins the wiring, so a claim on /accessibility cannot
// quietly stop being true: the page exists, every public page links it, the contact placeholders live in ONE file, and the fixes
// found in the 2026-10-09 audit (focus ring, skip link, labels, keyboard-operable day tiles, h1, solid sign-up button) stay in.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = (f: string) => fs.readFileSync(f, 'utf8');

// the page
const page = src('app/accessibility/page.tsx');
assert.ok(page.includes('הצהרת נגישות') && page.includes('ת&quot;י 5568') && page.includes('WCAG 2.0'), 'names the standard');
assert.ok(page.includes('מה עשינו') && page.includes('מגבלות ידועות') && page.includes('פניות בנושא נגישות'), 'what was done, known limits, contact');
assert.ok(page.includes('<h1'), 'one h1');
assert.ok(page.includes('ACCESSIBILITY_COORDINATOR') && !/\d{2,3}-?\d{7}/.test(page), 'the coordinator comes from lib/accessibilityContact.ts, no phone number written in the page');

// the one place she fills in
const contact = src('lib/accessibilityContact.ts');
for (const k of ['name', 'phone', 'email']) assert.ok(new RegExp(`${k}: '\\[`).test(contact), `placeholder for ${k} in lib/accessibilityContact.ts`);

// every public page links it
for (const f of ['app/LandingPage.jsx', 'app/BookingPage.jsx', 'app/signup/page.tsx', 'app/terms/page.tsx', 'app/privacy/page.tsx']) {
  assert.ok(src(f).includes('PublicFooterLinks'), `${f} carries the footer links`);
}
assert.ok(src('app/PublicFooterLinks.tsx').includes('href="/accessibility"'), 'the footer links /accessibility');
assert.ok(src('app/sitemap.ts').includes('/accessibility'), 'listed in the sitemap');
assert.ok(src('lib/slug.ts').includes("'accessibility'"), 'reserved, so a business cannot claim the slug');

// the audit fixes
const css = src('app/globals.css');
assert.ok(/:focus-visible\s*\{[^}]*outline: 3px solid #1F3A30 !important/.test(css), 'a visible keyboard focus ring on every page');
assert.ok(css.includes('.skip-link') && src('app/layout.tsx').includes('href="#main-content"') && src('app/layout.tsx').includes('id="main-content"'), 'skip link to the main landmark');
const signup = src('app/signup/page.tsx');
assert.ok(signup.includes('<h1 style={welcomeTitleStyle}>') && signup.includes('htmlFor={htmlFor}') && signup.includes('autoComplete="new-password"') && signup.includes('role="alert"'), 'sign-up: h1, real labels, autocomplete, announced errors');
assert.ok(/background: loading \? '#5B6B63' : DEEP/.test(signup), 'sign-up button is solid (white on the pale end of the old gradient was under 4.5:1)');
const booking = src('app/BookingPage.jsx');
assert.ok(booking.includes('role="button" tabIndex={0} aria-pressed={!!isSel}') && booking.includes('e.key === "Enter"'), 'booking: day tiles work from the keyboard');
assert.ok(booking.includes('aria-label="שם מלא" autoComplete="name"') && booking.includes('autoComplete="tel"') && booking.includes('<h1 className="serif" style={{ fontSize: 26'), 'booking: labelled inputs, h1 on the flow');

console.log('accessibility: ok');
