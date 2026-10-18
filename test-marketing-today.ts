// test-marketing-today.ts
//
// The home screen's "שיווק היום" card (lib/marketingToday.ts): review targets come only from real visits this week,
// the review message carries her link when there is one, and post captions exist only for suggestions we can
// caption without inventing anything.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { daysBefore, reviewTargets, reviewMessage, suggestionCaption, todaysPost } from './lib/marketingToday.ts';

const U = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const today = '2026-10-18';

assert.equal(daysBefore('2026-10-18', 7), '2026-10-11');
assert.equal(daysBefore('2026-03-02', 2), '2026-02-28');

{ // review targets
  const clients = [
    { id: 'c1', name: 'דנה כהן', phone: '0541234567' },
    { id: 'c2', name: 'רונית', phone: '0547654321' },
    { id: 'c3', name: 'בלי טלפון', phone: '' },
    { id: 'c4', name: 'בוטלה', phone: '0501111111' },
  ];
  const appts = [
    { id: U(1), client_id: 'c1', date: '2026-10-12' },
    { id: U(2), client_id: 'c1', date: '2026-10-17' },          // latest for c1
    { id: U(3), client_id: 'c2', date: '2026-10-11' },          // exactly 7 days ago: included
    { id: U(4), client_id: 'c2', date: '2026-10-10' },          // 8 days ago: out
    { id: U(5), client_id: 'c3', date: '2026-10-16' },          // no phone: out
    { id: U(6), client_id: 'c4', date: '2026-10-16', confirmation_status: 'cancelled' }, // cancelled: out
    { id: U(7), client_id: 'c1', date: '2026-10-19' },          // future: out
    { id: 'local-8', client_id: 'c2', date: '2026-10-17' },     // not a real id (no signed link possible): out
    { id: U(9), client_id: 'ghost', date: '2026-10-17' },       // unknown client: out
  ];
  const t = reviewTargets(appts, clients, today);
  assert.deepEqual(t.map((x) => [x.clientId, x.appointmentId, x.date]), [['c1', U(2), '2026-10-17'], ['c2', U(3), '2026-10-11']]);
  assert.deepEqual(reviewTargets([], clients, today), []);
}

{ // review message
  const withLink = reviewMessage({ name: 'דנה כהן', businessName: 'Maayan cosmetics', link: 'https://x/review?id=1&t=2', googleUrl: 'https://g.page/r/abc' });
  assert.match(withLink, /^היי דנה! 🌸/);
  assert.match(withLink, /תודה שהגעת לMaayan cosmetics/);
  assert.match(withLink, /https:\/\/x\/review\?id=1&t=2/);
  assert.doesNotMatch(withLink, /g\.page/, 'the signed link wins over Google');
  const google = reviewMessage({ name: 'דנה', link: null, googleUrl: 'https://g.page/r/abc' });
  assert.match(google, /https:\/\/g\.page\/r\/abc/);
  const none = reviewMessage({ name: '', businessName: 'העסק שלי' });
  assert.match(none, /^היי! 🌸/);
  assert.doesNotMatch(none, /העסק שלי|https?:/);
  assert.match(none, /לשמוע איך היה לך/);
}

{ // captions
  const url = 'https://beautyos-theta.vercel.app/maayan';
  assert.equal(suggestionCaption({ key: 'occasion:rosh_hashana', upcoming: { holiday: { key: 'rosh_hashana', name: 'ראש השנה' } } }, url),
    `לקראת ראש השנה 🌸\nזה הזמן לפנק את עצמך.\nלקביעת תור:\n${url}`);
  assert.match(suggestionCaption({ key: 'occasion:winter', upcoming: { holiday: { key: 'winter', name: 'חורף' } } }, null)!, /^לקראת החורף/);
  assert.equal(suggestionCaption({ key: 'quiet:2026-10-20', values: { subline: 'יום שלישי, 20.10' } }, null), 'התפנה מקום ליום שלישי, 20.10 ✨\nמי רוצה?');
  assert.match(suggestionCaption({ key: 'service:עיצוב גבות', values: { headline: 'עיצוב גבות' } }, url)!, /^עיצוב גבות 🌸/);
  assert.equal(suggestionCaption({ key: 'review:1' }, url), null);
  assert.equal(suggestionCaption({ key: 'idea:x' }, url), null);
  assert.equal(suggestionCaption({ key: 'quiet:2026-10-20', values: {} }, url), null);
  // no caption makes a claim about prices, availability counts or results
  for (const c of [suggestionCaption({ key: 'occasion:purim', upcoming: { holiday: { key: 'purim', name: 'פורים' } } }, url), suggestionCaption({ key: 'service:x', values: { headline: 'x' } }, url)]) {
    assert.doesNotMatch(c!, /₪|\d+%|הנחה|מבצע|נשארו|אחרונים|תוצאות/);
  }
  const pick = todaysPost([{ key: 'review:1' }, { key: 'service:פדיקור', values: { headline: 'פדיקור' } }], url);
  assert.equal(pick?.suggestion.key, 'service:פדיקור');
  assert.equal(todaysPost([{ key: 'review:1' }], url), null);
}

{ // the links route: her business only, past visits only, secret stays on the server
  const r = fs.readFileSync('app/api/reviews/links/route.js', 'utf8');
  assert.match(r, /auth\.getUser\(\)/);
  assert.match(r, /rpc\("get_user_tenant_id"\)/);
  assert.match(r, /\.eq\("tenant_id", tenantId\)/);
  assert.match(r, /confirmation_status === "cancelled"/);
  assert.match(r, /a\.date > today/);
  assert.doesNotMatch(r, /signReview|REVIEW_LINK_SECRET/, 'only finished links leave the route');
  const card = fs.readFileSync('app/MarketingToday.jsx', 'utf8');
  assert.doesNotMatch(card, /reviewToken|linkSecret/, 'the client never imports the signer');
}

console.log('marketing today: all assertions passed');
