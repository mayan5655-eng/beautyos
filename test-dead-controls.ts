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

// ── a deposit link made at booking can expire: each press after the first minutes asks for a fresh page, only while the hold is open ──
const { freshDepositLink } = await import('./lib/grow/cancelFees.ts');
const future = new Date(Date.now() + 10 * 60000).toISOString();
const past = new Date(Date.now() - 60000).toISOString();
const depDeps = (consent: unknown) => ({ repo: { getConsent: async () => consent, getAccount: async () => ({ user_id: 'u', enabled: true }), getAppointment: async () => ({ id: 'a', service: 'x', name: 'n', client_phone: '0501234567', confirmation_status: 'pending' }) } }) as never;
const base = { mode: 'deposit', client_id: null, client_name: 'n', snapshot: { deposit_amount: 100, via: 'booking_page' } };
assert.equal((await freshDepositLink(depDeps(null), { tenantId: 't', appointmentId: 'a', returnUrl: 'r' }) as { code: string }).code, 'none');
assert.equal((await freshDepositLink(depDeps({ ...base, status: 'deposit_paid', hold_expires_at: null }), { tenantId: 't', appointmentId: 'a', returnUrl: 'r' }) as { code: string }).code, 'paid');
assert.equal((await freshDepositLink(depDeps({ ...base, status: 'awaiting_deposit', hold_expires_at: past }), { tenantId: 't', appointmentId: 'a', returnUrl: 'r' }) as { code: string }).code, 'expired');
assert.equal((await freshDepositLink(depDeps({ ...base, status: 'hold_expired', hold_expires_at: future }), { tenantId: 't', appointmentId: 'a', returnUrl: 'r' }) as { code: string }).code, 'expired');
assert.ok(/fetch\("\/api\/grow\/deposit\/pay"/.test(booking) && /data-testid="deposit-pay"/.test(booking), 'the deposit button asks for a fresh page');

// ── the FAQ editor (bot answers) shows only where the bot runs; results publish uses the full consent record ──
assert.ok(!/הבוט עוד לא פעיל בחשבון שלך/.test(dash) && /inG\("advanced"\)&&!!\(settings\.green_api_instance/.test(dash), 'no bot promise for a business without the bot');
const results = read('./app/ResultsManager.jsx');
assert.ok(!/!r\.published && !r\.consent_confirmed/.test(results) && /!r\.published && !consentComplete\(fromRow\(r\)\)/.test(results), 'publish checks the whole consent record');

// ── the saved-card page lasts ~10 minutes too: a later press opens a fresh save-only page, moving the tick's process id to it ──
const { freshCardLink } = await import('./lib/grow/cancelFees.ts');
const cardCalls: string[] = [];
const cardDeps = (consent: unknown, card: unknown) => ({
  notifyUrl: 'n',
  ops: { createTokenSession: async (i: { mode: string }) => { cardCalls.push(`session:${i.mode}`); return { ok: true, url: 'https://grow/new', processId: 'p2' }; } },
  repo: {
    getConsent: async () => consent, getCardConsent: async () => card,
    getAccount: async () => ({ user_id: 'u', enabled: true }),
    getAppointment: async () => ({ id: 'a', name: 'n', client_phone: '0501234567', confirmation_status: 'confirmed' }),
    updateCardConsent: async (_id: string, p: { process_id: string }) => { cardCalls.push(`update:${p.process_id}`); },
    insertCardConsent: async (r: { process_id: string }) => { cardCalls.push(`insert:${r.process_id}`); return r; },
    updateConsent: async (_id: string, p: { status: string }) => { cardCalls.push(`consent:${p.status}`); },
  },
}) as never;
const sc = { id: 'c', mode: 'saved_card', client_id: null, client_name: 'n', consented_at: new Date().toISOString(), token_id: null };
const args = { tenantId: 't', appointmentId: 'a', returnUrl: 'r' };
assert.equal((await freshCardLink(cardDeps({ ...sc, status: 'card_saved' }, null), args) as { code: string }).code, 'saved', 'a saved card opens nothing');
assert.equal((await freshCardLink(cardDeps({ ...base, status: 'awaiting_deposit' }, null), args) as { code: string }).code, 'none', 'not for a deposit booking');
const ok1 = await freshCardLink(cardDeps({ ...sc, status: 'awaiting_card' }, { id: 'k', status: 'awaiting' }), args) as { url: string };
assert.equal(ok1.url, 'https://grow/new');
assert.deepEqual(cardCalls.splice(0), ['session:save_only', 'update:p2'], 'a save-only page (no charge), and the stored tick follows it');
await freshCardLink(cardDeps({ ...sc, status: 'step_failed' }, null), args);
assert.deepEqual(cardCalls.splice(0), ['session:save_only', 'insert:p2', 'consent:awaiting_card'], 'when the first page never opened, the tick is stored now');
assert.ok(/kind: policyStep\.kind === "saved_card" \? "card" : "deposit"/.test(booking) && /data-testid="card-retry"/.test(booking), 'the booking page asks for a fresh card page too');

console.log('dead controls: ok');
