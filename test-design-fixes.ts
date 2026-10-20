// The 2026-10-20 design pass: the month-value card counts only what the app recorded, and the layout fixes stay in place
// (phone gutter, calm agenda cards with one main action, היום order, booking-page monogram, price payback line).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { monthValue, monthOf, monthValueLines } from './lib/monthValue.ts';

const rd = (p: string) => readFileSync(p, 'utf8').split('\r\n').join('\n');
let n = 0;
const ok = (name: string, fn: () => void) => { fn(); n++; console.log('ok -', name); };

ok('month value: self-booked (not cancelled) bookings, their paid money, WhatsApp confirmations, new clients; only this month', () => {
  const v = monthValue({
    month: '2026-10',
    appointments: [
      { id: 1, date: '2026-10-03', self_booked: true, confirmation_status: 'confirmed', confirmation_sent: true },
      { id: 2, date: '2026-10-05', self_booked: true, confirmation_status: 'cancelled' },
      { id: 3, date: '2026-10-07', self_booked: false, confirmation_status: 'confirmed', confirmation_sent: true },
      { id: 4, date: '2026-09-30', self_booked: true, confirmation_status: 'confirmed', confirmation_sent: true },
      { id: 5, date: '2026-10-09', self_booked: true, confirmation_status: 'pending', confirmation_sent: true },
    ],
    receipts: [
      { appointment_id: 1, amount: 300 },
      { appointment_id: 1, amount: 50, voided: true },
      { appointment_id: 3, amount: 400 },
      { appointment_id: 5, amount: '250.4' },
    ],
    clients: [{ created_at: '2026-10-01T10:00:00Z' }, { created_at: '2026-09-29T10:00:00Z' }, { created_at: null }],
  });
  assert.deepEqual(v, { bookedOnline: 2, onlineRevenue: 550, confirmed: 2, newClients: 1 });
});

ok('month value lines: nothing to say means no card; singular and plural Hebrew; revenue only with online bookings', () => {
  assert.deepEqual(monthValueLines({ bookedOnline: 0, onlineRevenue: 0, confirmed: 0, newClients: 0 }), []);
  const one = monthValueLines({ bookedOnline: 1, onlineRevenue: 0, confirmed: 1, newClients: 1 });
  assert.deepEqual(one.map((l) => l.text), ['תור שלקוחה קבעה לבד דרך הקישור', 'לקוחה אישרה הגעה בוואטסאפ', 'לקוחה חדשה נוספה']);
  const many = monthValueLines({ bookedOnline: 4, onlineRevenue: 1200, confirmed: 0, newClients: 3 });
  assert.deepEqual(many.map((l) => l.key), ['online', 'revenue', 'new']);
  assert.match(many[1].big, /^₪1,200$/);
  assert.equal(monthOf(new Date(2026, 0, 5)), '2026-01');
});

const app = rd('app/beautyos.jsx');

ok('phone gutter: .app-main keeps 12px sides and room above the floating buttons; cards are rounded again', () => {
  assert.match(app, /\.app-main\{padding:12px 12px calc\(74px \+ 62px \+ env\(safe-area-inset-bottom, 0px\)\)!important\}/);
  assert.doesNotMatch(app, /\.glass-card,\.hero-card\{border-radius:0!important/);
});

ok('agenda card: calm surface with a status stripe, one main action, the rest behind "עוד", rows that wrap', () => {
  const i = app.indexOf('2026-10-20 design pass: a calm card');
  assert.ok(i > 0);
  const card = app.slice(i - 900, i + 6000);
  assert.match(card, /borderInlineStart:`5px solid \$\{apptColor\}`/);
  assert.match(card, /setApptMenuId\(open\?null:appt\.id\)/);
  assert.match(card, /flexWrap:"wrap"/);
  for (const h of ['handleFinishTreatment(appt)', 'handleStartTreatment(appt)', 'handleOpenCashier(appt)', 'sendReminderToClient(appt)', 'markNoShow(appt)', 'handleDelete(appt)', 'handleDeletePersonal(appt)']) {
    assert.ok(card.includes(h), h);
  }
  assert.doesNotMatch(card, /color:"var\(--surface\)",textShadow/);
  assert.match(app, /const \[apptMenuId, setApptMenuId\] = useState\(null\);/);
});

ok('היום order: today and "needs attention" right after the revenue line; the rest after', () => {
  assert.match(app, /activeTab==="dashboard"&&\(<div className="today-stack" style=\{\{display:"flex",flexDirection:"column"\}\}>/);
  assert.match(app, /\.today-stack>\*\{order:8;width:100%;box-sizing:border-box\}/);
  const order = (re: RegExp) => Number((app.match(re) || [])[1]);
  assert.equal(order(/className="glass-card card-boxed" style=\{\{order:(\d+),padding:"16px 17px",marginBottom:12/), 2);
  assert.equal(order(/<div style=\{\{order:(\d+),maxWidth:1180,margin:"0 auto",display:"flex",gap:12/), 4);
  assert.equal(order(/card-boxed-rose" style=\{\{order:(\d+),/), 6);
  assert.match(app, /<MonthValueCard [^>]*style=\{\{order:5\}\}/);
});

ok('Content tab: one heading, not three', () => {
  assert.doesNotMatch(app, /<h2 className="serif"[^>]*>פוסטים ותבניות<\/h2>/);
});

ok('booking page: a monogram when there is no logo and no photo, never a stock image', () => {
  const p = rd('app/PublicLandingPage.tsx');
  assert.match(p, /!brand\.logoUrl && !brand\.heroImageUrl && String\(bizName \|\| ""\)\.trim\(\) !== ""/);
  assert.match(p, /data-testid="biz-monogram"/);
});

ok('landing: the payback line sits with the price', () => {
  const l = rd('app/LandingPage.jsx');
  assert.ok(l.indexOf('data-testid="price-payback"') > l.indexOf('מחיר השקה 349'));
});

console.log(`${n} passed`);
