// UX pass 2026-11-18 (owner asked for a usability review): the small clarity fixes that must not quietly regress.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
const app = rd('app/beautyos.jsx');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('the header inquiries badge is a labelled button, not a bare number', () => {
  const m = app.match(/<button type="button" data-testid="header-leads-badge"[^\n]*/);
  assert.ok(m, 'badge button exists');
  assert.match(m![0], /aria-label=/);
  assert.match(m![0], /tr\("\{0\} פניות",\[newLeadsCount\]\)/, 'visible text says what the number counts');
  assert.doesNotMatch(app, /<span onClick=\{\(\)=>setActiveTab\("leads"\)\}[^>]*>\{newLeadsCount\}<\/span>/);
});

ok('Content tab: templates and posts come before the voucher and Google cards', () => {
  const start = app.indexOf('{activeTab==="campaigns"&&(<>');
  const posts = app.indexOf('{marketingView==="posts"&&(<>', start);
  const gift = app.indexOf('<GiftVoucherMarketingCard', start);
  const google = app.indexOf('<GoogleKitCard', start);
  assert.ok(start > 0 && posts > start, 'posts view inside the content tab');
  assert.ok(gift > posts, 'voucher card after the posts view');
  assert.ok(google > posts, 'Google card after the posts view');
});

ok('Today asks one automation question at a time', () => {
  assert.match(rd('app/AutomationSuggestCard.jsx'), /automationSuggestions\(settings, \{ services, origin, autoSend \}\)\.slice\(0, 1\)/);
});

ok('no CRM jargon on the clients screen', () => {
  assert.doesNotMatch(app, /ניהול קשרי לקוחות/);
});

console.log(`\n${n} passed`);
