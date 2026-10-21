// Controls that looked clickable but saved nothing. Found 2026-10-21: the owner changed the cancellation-policy "מצב" in Settings and
// "it would not let her update". The policy saves to its own table with its own button inside the Grow card, while the sticky Settings
// bar ignored it: it stayed on "אין שינויים", disabled, and "סגירה" dropped the change without asking.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ── the pending-saves registry ──────────────────────────────────────────────
const reg = await import('./app/pendingSaves.js');
let calls = 0;
reg.setPendingSave('a', async () => { calls++; reg.setPendingSave('a', null); return true; });
reg.setPendingSave('b', async () => { calls++; return false; });
assert.equal(await reg.flushPendingSaves(), false, 'one failed save fails the flush');
assert.equal(calls, 2, 'every pending save ran');
reg.clearPendingSaves();
assert.equal(await reg.flushPendingSaves(), true, 'nothing pending is a clean flush');

// ── the Settings bar counts the cards ───────────────────────────────────────
const dash = read('./app/beautyos.jsx');
assert.ok(/const panelDirty = settingsDirty \|\| pendingCardSaves > 0;/.test(dash), 'the bar is dirty when a card has an unsaved change');
assert.ok(/onClick=\{saveSettingsPanel\} disabled=\{isBusy\("saveSettings"\)\|\|!panelDirty\}/.test(dash), 'its "שמירה" saves the cards too');
assert.ok(/if \(force \|\| !panelDirty\) \{ done\(\); return; \}/.test(dash), '"סגירה" asks before dropping a card change');

// ── the policy card registers its change and says it is unsaved ─────────────
const policy = read('./app/CancelPolicyCard.jsx');
assert.ok(/setPendingSave\('cancel-policy', dirty && !isDemo/.test(policy), 'the policy card registers its unsaved change');
assert.ok(/יש שינוי שעוד לא נשמר/.test(policy), 'and says so next to its button');
assert.ok(/opacity: busy \|\| !dirty \? 0\.55 : 1/.test(policy), 'a disabled save button looks disabled');

// ── back from Grow, the page says how it went ───────────────────────────────
const { withGrowResult } = await import('./lib/grow/payload.ts');
assert.equal(withGrowResult('https://kalmea.app/book?t=x', 'paid'), 'https://kalmea.app/book?t=x&grow=paid');
assert.equal(withGrowResult('https://kalmea.app/dashboard', 'cancelled'), 'https://kalmea.app/dashboard?grow=cancelled');
const booking = read('./app/BookingPage.jsx');
assert.ok(/params\.get\("grow"\)/.test(booking) && /data-testid="grow-return"/.test(booking), 'the booking page reads ?grow= and shows a banner');

// ── the booking page: deposit info on the done step, no full-price button over a held booking, no empty promise ──
const step4 = booking.slice(booking.indexOf('STEP 4'));
assert.ok(/data-testid="deposit-info"/.test(step4), 'the manual deposit note is on the done step, where the client sees it');
assert.ok(/cardPay && bookedId && !policyStep && /.test(booking), 'no full-price pay button while a deposit/card step is pending');
assert.ok(/cardPay && Number\(selectedService\?\.price\) > 0 && !needsPolicy && \(\s*<p data-testid="booking-card-pay"/.test(booking), 'the "a pay button will appear" note only when it will');
assert.ok(/confirmation_status === 'pending'/.test(read('./app/api/grow/booking-pay/route.ts')), 'booking-pay refuses a booking held for its deposit');

// ── the landing page never prefetches the demo sign-in route ────────────────
assert.ok(!/<Link href=\{d\.href\}/.test(read('./app/LandingPage.jsx')), 'demo links are plain <a>, not prefetched <Link>');

// ── billing: a paused account is not promised a card unlock; a failed read is not "hidden" ──
const billingCard = read('./app/BillingCard.jsx');
assert.ok(!/'expired' \|\| status === 'paused'\) line = 'החשבון במצב צפייה בלבד. הוספת כרטיס/.test(billingCard), 'paused has its own copy');
assert.ok(/\{ failed: true \}/.test(billingCard), 'a failed billing read shows a retry');

console.log('dead controls: ok');
