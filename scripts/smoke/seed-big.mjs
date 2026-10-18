// Seed a SMOKE tenant with three years of history, to measure dashboard boot at a realistic size.
// node --env-file=.env.local scripts/smoke/seed-big.mjs <tenantId> [clients=1500] [appointments=6000] [receipts=4500] [leads=800]
// Refuses the real tenant. Everything is removed again by `admin-tools.mjs purge`.
import { admin, REAL_TENANT } from './lib.mjs';

const [tenantId, nc = '1500', na = '6000', nr = '4500', nl = '800'] = process.argv.slice(2);
if (!tenantId || tenantId === REAL_TENANT) throw new Error('tenant id missing or the real tenant');
const db = admin();
const NC = Number(nc), NA = Number(na), NR = Number(nr), NL = Number(nl);
const first = ['דנה', 'רחל', 'מיכל', 'שירה', 'נועה', 'יעל', 'תמר', 'הדס', 'ליאת', 'אורית'];
const last = ['כהן', 'לוי', 'מזרחי', 'ביטון', 'פרץ', 'אברהם', 'דהן', 'אזולאי'];
const svc = ['טיפול פנים', 'מניקור ג׳ל', 'הסרת שיער', 'פדיקור', 'עיסוי פנים', 'גבות'];
const chunk = async (table, rows, size = 400) => {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await db.from(table).insert(rows.slice(i, i + size));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
};
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// clients
const clients = Array.from({ length: NC }, (_, i) => ({
  tenant_id: tenantId, name: `${first[i % first.length]} ${last[(i * 7) % last.length]} ${i}`, phone: `05${(i % 9) + 1}${String(1000000 + i).slice(-7)}`, status: 'active',
  notes: i % 5 === 0 ? 'אוהבת קפה חזק ומגיעה בדרך כלל בבוקר' : '', allergies: i % 17 === 0 ? 'לטקס' : '',
}));
await chunk('clients', clients);
const { data: created } = await db.from('clients').select('id, name, phone').eq('tenant_id', tenantId).limit(5000);
console.log('clients', created.length);

// appointments: 3 years back to 2 months ahead, <= 8 per working day, hourly, never overlapping
const today = new Date(); const start = new Date(Date.UTC(today.getUTCFullYear() - 3, today.getUTCMonth(), today.getUTCDate()));
const appts = []; let day = new Date(start); let k = 0;
while (appts.length < NA) {
  const dow = day.getUTCDay();
  if (dow !== 5 && dow !== 6) {
    for (let slot = 0; slot < 8 && appts.length < NA; slot++) {
      const c = created[(k * 13) % created.length]; k++;
      const startMin = (8 + slot) * 60;
      appts.push({ tenant_id: tenantId, client_id: c.id, name: c.name, client_phone: c.phone, service: svc[k % svc.length], date: ymd(day), start_minute: startMin, hour: 8 + slot, duration: 45, price: 150 + (k % 5) * 40, color: '#D98BA0', confirmation_status: 'confirmed', confirmation_sent: true });
    }
  }
  day = new Date(day.getTime() + 86400000);
  if (day > new Date(today.getTime() + 60 * 86400000)) day = new Date(start.getTime() + 43200000);
}
await chunk('appointments', appts);
console.log('appointments', appts.length);

// receipts spread over the same three years
const methods = ['מזומן', 'ביט', 'אשראי'];
const receipts = Array.from({ length: NR }, (_, i) => {
  const c = created[(i * 11) % created.length];
  const d = new Date(start.getTime() + Math.floor((i / NR) * (today.getTime() - start.getTime())));
  return { tenant_id: tenantId, client_id: c.id, client_name: c.name, service: svc[i % svc.length], amount: 150 + (i % 5) * 40, payment_method: methods[i % 3], note: '', items: '[]', created_at: d.toISOString() };
});
await chunk('receipts', receipts);
console.log('receipts', receipts.length);

// leads
const leads = Array.from({ length: NL }, (_, i) => ({ tenant_id: tenantId, name: `פנייה ${i}`, phone: `052${String(2000000 + i).slice(-7)}`, source: i % 2 ? 'facebook' : 'instagram', status: ['new', 'no_answer', 'closed', 'lost'][i % 4], service_interest: svc[i % svc.length] }));
await chunk('leads', leads);
console.log('leads', leads.length, 'done');
