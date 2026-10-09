// Marketing consent and opt-out (Israeli communications law, section 30A). Pins: the rule, that every marketing path asks it, that the
// booking checkbox is optional and unchecked, and that reminders/receipts were NOT put behind it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canMarket, marketingStatus, withMarketingFooter, consentFields, optOutFields, MARKETING_FOOTER } from './lib/marketingConsent.js';

const src = (f: string) => fs.readFileSync(f, 'utf8');

// the rule: fails closed
assert.equal(canMarket(null), false);
assert.equal(canMarket({}), false, 'a row without the columns (migration not run) is not marketable');
assert.equal(canMarket({ marketing_consent: false }), false);
assert.equal(canMarket({ marketing_consent: true }), true);
assert.equal(canMarket({ marketing_consent: 'true' }), false, 'only a real true counts');
assert.equal(canMarket({ marketing_consent: true, marketing_opted_out_at: '2026-10-08T10:00:00Z' }), false, 'opt-out wins');
assert.equal(marketingStatus({ marketing_consent: true, marketing_opted_out_at: '2026-10-08T10:00:00Z' }), 'opted_out');
assert.equal(marketingStatus({ marketing_consent: true }), 'consent');
assert.equal(marketingStatus({}), 'none');
const yes = consentFields('booking_page', '2026-10-08T10:00:00.000Z');
assert.deepEqual(yes, { marketing_consent: true, marketing_consent_at: '2026-10-08T10:00:00.000Z', marketing_consent_source: 'booking_page', marketing_opted_out_at: null });
assert.equal(canMarket({ ...yes }), true, 'a new explicit yes clears an earlier opt-out');
assert.deepEqual(optOutFields('2026-10-09T00:00:00.000Z'), { marketing_opted_out_at: '2026-10-09T00:00:00.000Z' });

// footer
assert.equal(MARKETING_FOOTER, 'להסרה מרשימת התפוצה השיבי הסר');
const once = withMarketingFooter('שלום!');
assert.ok(once.endsWith(MARKETING_FOOTER));
assert.equal(withMarketingFooter(once), once, 'never doubled');

// every marketing path asks the rule
for (const [file, n] of [
  ['app/api/clients/comeback/route.js', 1], ['app/api/slots/offer/route.js', 2], ['app/api/questions/route.js', 2],
  ['app/api/clients/lapsed/route.js', 1], ['lib/reminders/smartReminders.js', 2],
] as [string, number][]) {
  const hits = (src(file).match(/canMarket\(/g) || []).length;
  assert.ok(hits >= n, `${file} must call canMarket (found ${hits}, need ${n})`);
}
const ui = src('app/beautyos.jsx');
assert.ok(ui.includes('upcomingBirthdays.filter(canMarket)') && ui.includes('coldClients.filter(canMarket)') && /if\(!c\.phone\|\|!canMarket\(c\)\)return false/.test(ui), 'birthday / cold / broadcast lists need consent');
// not marketing: reminders stay as they were
assert.ok(!/reminderTargets=[^;]*canMarket/.test(ui.replace(/\n/g, ' ')), 'reminders are not behind marketing consent');
assert.ok(!/canMarket/.test(src('app/api/send-reminders/route.js')) && !/canMarket/.test(src('app/api/send-receipt/route.js')), 'reminders and receipts are untouched');
// footer on the templates
for (const f of ['app/api/clients/comeback/route.js', 'app/api/slots/offer/route.js', 'lib/reminders/smartReminders.js']) assert.ok(src(f).includes('MARKETING_FOOTER'), `${f} carries the removal line`);
assert.ok(src('app/LapsedClientsModal.jsx').includes('withMarketingFooter'), 'lapsed modal carries the removal line');

// booking page: optional, unchecked, saved with the date
const bp = src('app/BookingPage.jsx');
assert.ok(/useState\(false\);\s*[\r\n]/.test(bp) && bp.includes('const [marketingOk, setMarketingOk] = useState(false)'), 'the checkbox starts unchecked');
assert.ok(bp.includes('אשמח לקבל עדכונים ומבצעים') && bp.includes('marketingConsent: marketingOk === true'));
assert.ok(!/if \(!marketingOk\)/.test(bp), 'it is optional: nothing blocks the booking when unchecked');
const api = src('app/api/book-appointment/route.js');
assert.ok(api.includes('marketingConsent === true') && api.includes('consentFields("booking_page")'), 'server records consent (with date, source) only on a literal true');

// migration
const mig = src('supabase/migrations/add_marketing_consent.sql');
for (const c of ['marketing_consent ', 'marketing_consent_at', 'marketing_consent_source', 'marketing_opted_out_at']) assert.ok(mig.includes(c), `migration adds ${c}`);
assert.ok(/default false/.test(mig) && /if not exists/.test(mig), 'existing clients start as no consent; re-runnable');



// ── v2: the cashier prompt and the treatment consent form ──
{
  const ui2 = src('app/beautyos.jsx');
  assert.ok(ui2.includes('data-testid="consent-prompt"') && ui2.includes('שאלת אם היא מאשרת לקבל עדכונים ומבצעים?') && ui2.includes('כן, אישרה') && ui2.includes('לא עכשיו'), 'cashier prompt text and buttons');
  assert.ok(/marketingStatus\(cl\)!=="none"/.test(ui2), 'asked only when there is no answer yet: never after an opt-out, never twice');
  assert.ok(/consentFields\("manual"\)/.test(ui2), 'a yes at the till is source manual');
  assert.ok(!/לא עכשיו[^\n]*saveClientMarketing/.test(ui2), '"לא עכשיו" writes nothing');
  const form = src('app/form/page.jsx');
  assert.ok(form.includes('useState(false)') && form.includes('const [marketingOk, setMarketingOk] = useState(false)') && form.includes('אשמח לקבל עדכונים ומבצעים') && form.includes('marketingConsent: marketingOk === true'), 'form checkbox starts unchecked, optional');
  const fapi = src('app/api/forms/route.ts');
  assert.ok(fapi.includes("body?.marketingConsent === true") && fapi.includes("consentFields('consent_form')"), 'server records consent_form only on a literal true');
  assert.ok(fapi.indexOf("consentFields('consent_form')") > fapi.indexOf("state: 'signed'") - 900, 'after the signature write');
  assert.deepEqual(consentFields('consent_form', 'x').marketing_consent_source, 'consent_form');
  const m2 = src('supabase/migrations/add_consent_form_source.sql');
  assert.ok(m2.includes("'booking_page', 'manual', 'consent_form'") && m2.includes('drop constraint if exists'), 'constraint widened, re-runnable');
}
console.log('marketing consent: ok');
