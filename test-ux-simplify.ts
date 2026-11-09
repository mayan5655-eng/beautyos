// UX simplification pass (2026-11-08): the owner asked for "the whole system as easy and clear as possible".
// Source checks for each change, so a later edit cannot quietly undo it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { voiceBookingVisible } from './lib/featureFlags.ts';

const app = readFileSync('app/beautyos.jsx', 'utf8');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('calendar card: payment is the main action; the timer is in "עוד" unless it is running', () => {
  const i = app.indexOf('const running=canTime&&!!appt.actual_start_at;');
  assert.ok(i > 0);
  const card = app.slice(i, i + 4000);
  assert.match(card, /\{running&&!paidRcpt\?\(\s*<button onClick=\{stop\(\(\)=>handleFinishTreatment\(appt\)\)\} style=\{main\}>⏹ סיימתי<\/button>/);
  assert.match(card, /<button onClick=\{stop\(\(\)=>handleOpenCashier\(appt\)\)\} style=\{main\}>₪ לתשלום<\/button>/);
  assert.match(card, /\{canTime&&!running&&<button onClick=\{stop\(\(\)=>handleStartTreatment\(appt\)\)\} style=\{ghost\}>▶ התחלתי<\/button>\}/);
});

ok('edit sheet: a running timer is the main button; "▶ התחלתי" is quiet at the bottom', () => {
  assert.match(app, /curLive&&cur\.actual_start_at&&!cur\.actual_end_at&&<button type="button" onClick=\{\(\)=>handleFinishTreatment\(cur\)\}/);
  assert.match(app, /cur\.actual_end_at\|\|cur\.actual_start_at\) return null;/);
});

ok('floating microphone: hidden unless automations.feature_flags.voice_booking is true; no developer text', () => {
  assert.equal(voiceBookingVisible({}), false);
  assert.equal(voiceBookingVisible({ automations: { feature_flags: { voice_booking: 'yes' } } }), false);
  assert.equal(voiceBookingVisible({ automations: { feature_flags: { voice_booking: true } } }), true);
  assert.match(app, /\{voiceBookingVisible\(settings\)&&<button onClick=\{\(\)=>\{ showVoice \? closeVoice\(\) : startVoice\(\); \}\}/);
  assert.doesNotMatch(app, /שלב 2 — הצגת ההבנה בלבד/);
});

ok('setup checklist: five core steps decide Today; the three extras sit under "לא חובה, אבל עוזר" in Settings', () => {
  for (const k of ['branding', 'gallery', 'social']) assert.match(app, new RegExp(`\\{ optional:true, key:"${k}",`));
  assert.match(app, /const setupDone = coreSetupSteps\.filter\(s=>s\.done\)\.length;/);
  assert.match(app, /לא חובה, אבל עוזר/);
  assert.match(app, /\{renderSetupBody\(true\)\}/);
});

ok('Today: revenue only after the first payment of the day, after the question and the next client', () => {
  assert.match(app, /\{fbView!=="active"&&todayTotals\.count>0&&<div className="glass-card card-boxed" style=\{\{order:3,/);
});

ok('till: titled "תשלום חדש", her most-used method, one-tap service chips, extras behind one line', () => {
  assert.match(app, /title="תשלום חדש">/);
  assert.match(app, /setPaymentMethod\(favoritePaymentMethod\)/);
  assert.match(app, /data-testid="cashier-service-chips"/);
  assert.match(app, />הנחה, טיפ והערה</);
  assert.doesNotMatch(app, /<option value="">\+ הוסיפי שירות<\/option>/);
});

ok('new client: name and phone first, the rest behind "פרטים נוספים", then "לקבוע לה תור?"', () => {
  assert.match(app, /טלפון \(לתזכורות בוואטסאפ\)/);
  assert.match(app, /יום הולדת \(לברכה אוטומטית\)/);
  assert.match(app, /data-testid="client-more"/);
  assert.match(app, /toast\("נוספה ✓ · לקבוע לה תור\?", "success", \{ label:"קביעת תור"/);
  assert.match(app, /const emptyClient = \{[^}]*status:"active"\}/);
});

ok('naming: פניות, חבילות, הודעות, קופה', () => {
  assert.match(app, /\{id:"packages", label:"חבילות"\}/);
  assert.doesNotMatch(app, />מרכז הודעות</);
  assert.match(app, /margin:0\}\}>קופה<\/h2>/);
  assert.doesNotMatch(app, /toast\("הליד (עודכן|נוסף)"\)/);
});

ok('calendar: a "רשימת המתנה" chip next to "אירוע אישי", gated until the list has loaded', () => {
  assert.match(app, /data-testid="cal-waitlist-chip"/);
  assert.match(app, /const waitlistChipLabel = waitingCount===null \? "רשימת המתנה" : `רשימת המתנה \(\$\{waitingCount\}\)`;/);
});

ok('phone header: logout moves to Settings › מתקדם; search stays reachable from "עוד"', () => {
  assert.match(app, /<button onClick=\{handleLogout\} disabled=\{isBusy\("logout"\)\} className="icon-btn desktop-only"/);
  assert.match(app, /data-testid="settings-logout"/);
  // Logout from Settings asks first and never closes Settings: cancelling keeps her unsaved edits (Vercel review 2026-11-08).
  assert.match(app, /data-testid="settings-logout" onClick=\{handleLogout\}/);
  assert.doesNotMatch(app, /closeSettings\(true\);handleLogout\(\)/);
  assert.match(app, /data-testid="more-search"/);
});

ok('attention list: steps aside for what My Day already lists', () => {
  assert.match(app, /if\(newLeadsCount>0&&!allOnMyDay\(/);
  assert.match(app, /if\(tomorrowNotSent\.length>0&&!allOnMyDay\(tomorrowNotSent\)\)/);
});

console.log(`${n} passed`);
