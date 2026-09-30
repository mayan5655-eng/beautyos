// lib/demoSeed.ts
//
// Everything about what the two demo tenants LOOK like, and the one function
// (resetDemoTenant) that brings a tenant back to that canonical state. Used
// both by scripts/provision-demo-tenants.ts (once, by hand) and
// app/api/demo/reset/route.ts (nightly cron) - one seed, never two copies to
// keep in sync.
//
// All fake. No real client, appointment, receipt, lead or review from any
// real tenant is ever read or copied here - every value below is written out
// by hand or generated from a fixed list of common Hebrew first names.
//
// Dates are computed relative to `now` at reset time, not hardcoded, so the
// demo always shows "today" and "this week" correctly whenever it last reset.

import { DEMO_TENANT_IDS, type DemoField } from './demoTenants.ts';
import { serviceTemplateGroupsFor, suggestedPrice } from './tenantTemplate.ts';
import { insertPickedServices, type PickedService } from './seedServices.ts';
import { serviceColorAt } from './serviceColors.ts';
import { getTemplate } from './design/templates/index.ts';

type Db = {
  from: (table: string) => any;
};

const FIRST_NAMES = [
  'מאיה', 'נועה', 'שירה', 'טליה', 'רוני', 'יעל', 'ליה', 'אור', 'דנה', 'עדי',
  'מיכל', 'הילה', 'שני', 'גלית', 'נטע', 'קרן',
];
const LAST_INITIALS = ['כ.', 'ל.', 'מ.', 'ר.', 'ש.', 'ב.', 'ג.', 'ד.'];

function fakeClientName(i: number): string {
  return `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_INITIALS[i % LAST_INITIALS.length]}`;
}
function fakePhone(i: number): string {
  // 05X-000#### - obviously a block of demo numbers, never a real prefix
  // range and never in numeric sequence with a real phone.
  return `050${(1000000 + i * 137).toString().slice(0, 7)}`;
}

const SKIN_TYPES = ['רגיל', 'יבש', 'שמן', 'מעורב', 'רגיש'];

const LEAD_SOURCES = ['פייסבוק', 'אינסטגרם', 'גוגל', 'טיקטוק', 'המלצה', 'הליכה ברחוב'];
const LEAD_STATUSES = ['new', 'no_answer', 'awaiting_reply', 'in_progress', 'quote_sent', 'scheduled', 'closed', 'irrelevant'];

const PAYMENT_METHODS = ['מזומן', 'אשראי', 'ביט'];

const REVIEW_BODIES = [
  'טיפול מדהים, יצאתי עם עור זוהר ותחושה מפנקת. ממליצה בחום!',
  'תמיד יוצאת מרוצה, שירות אדיב ומקצועי. חוזרת שוב ושוב.',
  'המקום הכי טוב שהייתי בו. יחס אישי וחם, ותוצאות שרואים.',
  'אווירה נעימה, מקצועיות ברמה גבוהה. ממש שווה!',
];

const DESIGN_TEMPLATE_KEYS: Record<DemoField, string[]> = {
  cosmetics: ['offer-feed', 'review-feed', 'tip-feed', 'package-feed', 'acne-feed'],
  nails: ['nail-design-showcase-feed', 'nail-colour-week-feed', 'nail-new-shade-feed', 'nail-bridal-feed', 'nail-event-feed'],
};

const BUSINESS_NAME: Record<DemoField, string> = {
  cosmetics: 'קליניקת דמו - קוסמטיקה',
  nails: 'סטודיו דמו - ציפורניים',
};

/** A working day's fixed, non-overlapping time slots - by construction, never
 *  needs an overlap check against add_appointment_no_overlap.sql's EXCLUDE
 *  constraint. Minutes from midnight. */
const DAY_SLOTS = [9 * 60, 10 * 60 + 30, 12 * 60, 14 * 60, 15 * 60 + 45, 17 * 60];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function isWorkingDay(d: Date): boolean {
  return d.getDay() !== 6; // every day but Saturday
}

/** Real menu items from lib/tenantTemplate.ts - never invented service names,
 *  durations or prices. Takes the first `count` across that field's groups. */
function pickSeedServices(field: DemoField, count: number): PickedService[] {
  const groups = serviceTemplateGroupsFor([field])[0]?.groups || [];
  const items = groups.flatMap((g) => g.items).slice(0, count);
  return items.map((item) => ({
    name: item.name,
    price: suggestedPrice(item),
    duration: item.duration,
    description: item.description,
    field,
  }));
}

async function deleteDemoRows(db: Db, tenantId: string) {
  // Child-before-parent: receipt_voids.receipt_id is `on delete restrict`, so
  // voids must go before receipts. Nothing else here has an enforced FK
  // (see the research behind this feature - tenant-scoped tables predate
  // migration tracking and carry no FK constraints of their own), but the
  // same order is kept anyway for readability.
  await db.from('receipt_voids').delete().eq('tenant_id', tenantId);
  await db.from('reviews').delete().eq('tenant_id', tenantId);
  await db.from('receipts').delete().eq('tenant_id', tenantId);
  await db.from('designs').delete().eq('tenant_id', tenantId);
  await db.from('waitlist').delete().eq('tenant_id', tenantId);
  await db.from('leads').delete().eq('tenant_id', tenantId);
  await db.from('appointments').delete().eq('tenant_id', tenantId);
  await db.from('clients').delete().eq('tenant_id', tenantId);
  await db.from('service_prices').delete().eq('tenant_id', tenantId);
}

/**
 * Wipes and re-seeds one demo tenant's data to its canonical fake state.
 * `db` must be a service-role client (RLS has no policy that lets a fixed
 * demo auth user read/write another tenant's rows, and this writes rows with
 * no session behind them at all when called from the nightly cron).
 */
export async function resetDemoTenant(db: Db, field: DemoField, now: Date = new Date()): Promise<{ ok: boolean; error?: string }> {
  const tenantId = DEMO_TENANT_IDS[field];
  try {
    await deleteDemoRows(db, tenantId);

    // ── Settings: the business name and the seeded testimonials array reset
    // too, in case a visitor edited them - everything else on the row (hours,
    // colour, automations) was written once at provision and is left alone. ──
    await db.from('settings').update({
      business_name: BUSINESS_NAME[field],
      branding: {
        reviews: REVIEW_BODIES.slice(0, 3).map((text, i) => ({
          name: fakeClientName(i),
          rating: 5,
          text,
        })),
      },
    }).eq('tenant_id', tenantId);

    // ── Services ──
    const picked = pickSeedServices(field, 6);
    const { inserted: insertedServices, error: svcErr } = await insertPickedServices(db, tenantId, picked);
    if (svcErr) return { ok: false, error: `services: ${svcErr.message}` };
    const services = insertedServices.length ? insertedServices : picked.map((p) => ({ ...p }));

    // ── Clients (12) ──
    const CLIENT_COUNT = 12;
    const clientRows = Array.from({ length: CLIENT_COUNT }, (_, i) => ({
      tenant_id: tenantId,
      name: fakeClientName(i),
      phone: fakePhone(i),
      skinType: SKIN_TYPES[i % SKIN_TYPES.length],
      status: 'active',
    }));
    const { data: clients, error: clientErr } = await db.from('clients').insert(clientRows).select('id');
    if (clientErr) return { ok: false, error: `clients: ${clientErr.message}` };
    const clientIds: string[] = (clients || []).map((c: { id: string }) => c.id);

    // ── Appointments: a real-looking week, days -3..+4, working days only,
    // a fixed slot schedule per day so no two ever overlap. ──
    type ApptSeed = { date: string; start_minute: number; duration: number; name: string; service: string; price: number; color: string; client_id: string; confirmation_status: string; dayOffset: number };
    const appts: ApptSeed[] = [];
    let slotCursor = 0;
    for (let dayOffset = -3; dayOffset <= 4; dayOffset++) {
      const d = new Date(now.getTime() + dayOffset * 86_400_000);
      if (!isWorkingDay(d)) continue;
      const date = isoDate(d);
      const slotsToday = dayOffset === -3 || dayOffset === 4 ? 2 : 4; // a quiet day at each end of the window
      for (let s = 0; s < slotsToday; s++) {
        const svc = services[(slotCursor + s) % services.length] as { name: string; price: number; duration: number };
        const client = clientIds[(slotCursor + s) % clientIds.length];
        const startMinute = DAY_SLOTS[s % DAY_SLOTS.length];
        const isPast = dayOffset < 0;
        appts.push({
          date,
          start_minute: startMinute,
          duration: Number(svc.duration) || 60,
          name: fakeClientName((slotCursor + s) % CLIENT_COUNT),
          service: svc.name,
          price: Number(svc.price) || 0,
          color: serviceColorAt(slotCursor + s),
          client_id: client,
          // A little texture: mostly confirmed, one no-show in the past, one
          // cancelled in the future, the rest pending ahead of time.
          confirmation_status: isPast
            ? (s === slotsToday - 1 && dayOffset === -1 ? 'no_show' : 'confirmed')
            : (s === 1 && dayOffset === 2 ? 'cancelled' : (dayOffset === 0 ? 'confirmed' : 'pending')),
          dayOffset,
        });
      }
      slotCursor += slotsToday;
    }
    const apptRows = appts.map(({ dayOffset: _drop, ...row }) => ({
      ...row,
      hour: Math.floor(row.start_minute / 60),
      tenant_id: tenantId,
      kind: 'appointment',
    }));
    const { data: insertedAppts, error: apptErr } = await db.from('appointments').insert(apptRows).select('id, date, client_id, price, name, confirmation_status');
    if (apptErr) return { ok: false, error: `appointments: ${apptErr.message}` };
    const pastAppts = (insertedAppts || []).filter((a: { confirmation_status: string }) => a.confirmation_status === 'confirmed')
      .slice(0, 8);

    // ── Receipts: one per past, confirmed appointment (up to 8) ──
    const receiptRows = pastAppts.map((a: any, i: number) => ({
      tenant_id: tenantId,
      client_id: a.client_id,
      client_name: a.name,
      appointment_id: a.id,
      service: 'טיפול',
      amount: a.price,
      payment_method: PAYMENT_METHODS[i % PAYMENT_METHODS.length],
      items: JSON.stringify([{ id: '1', name: a.name, price: a.price, qty: 1 }]),
    }));
    if (receiptRows.length) {
      const { error: recErr } = await db.from('receipts').insert(receiptRows);
      if (recErr) return { ok: false, error: `receipts: ${recErr.message}` };
    }

    // ── Reviews (public.reviews): a few of the past appointments get a real
    // review row. Only INSERT ever happens here - the table's own trigger
    // blocks UPDATE, never INSERT, so a fresh seed each night is fine. ──
    const reviewAppts = pastAppts.slice(0, 4);
    if (reviewAppts.length) {
      const reviewRows = reviewAppts.map((a: any, i: number) => ({
        tenant_id: tenantId,
        appointment_id: a.id,
        client_id: a.client_id,
        client_name: a.name,
        rating: 5,
        body: REVIEW_BODIES[i % REVIEW_BODIES.length],
        status: 'published',
      }));
      const { error: revErr } = await db.from('reviews').insert(reviewRows);
      if (revErr) return { ok: false, error: `reviews: ${revErr.message}` };
    }

    // ── Waitlist (2) ──
    const { error: wlErr } = await db.from('waitlist').insert([
      { tenant_id: tenantId, client_name: fakeClientName(CLIENT_COUNT), phone: fakePhone(CLIENT_COUNT), service: (services[0] as any)?.name || '', status: 'waiting' },
      { tenant_id: tenantId, client_name: fakeClientName(CLIENT_COUNT + 1), phone: fakePhone(CLIENT_COUNT + 1), service: (services[1 % services.length] as any)?.name || '', status: 'waiting' },
    ]);
    if (wlErr) return { ok: false, error: `waitlist: ${wlErr.message}` };

    // ── Leads (14) ──
    const leadRows = Array.from({ length: 14 }, (_, i) => ({
      tenant_id: tenantId,
      name: fakeClientName(CLIENT_COUNT + 2 + i),
      phone: fakePhone(CLIENT_COUNT + 2 + i),
      source: LEAD_SOURCES[i % LEAD_SOURCES.length],
      service_interest: (services[i % services.length] as any)?.name || '',
      status: LEAD_STATUSES[i % LEAD_STATUSES.length],
    }));
    const { error: leadErr } = await db.from('leads').insert(leadRows);
    if (leadErr) return { ok: false, error: `leads: ${leadErr.message}` };

    // ── Designs: real templates, no images - the seed-image fallback fills
    // the gallery in automatically (lib/design/templateSeedImages.ts). ──
    const designRows = DESIGN_TEMPLATE_KEYS[field].map((key) => {
      const t = getTemplate(key);
      if (!t) return null;
      return {
        tenant_id: tenantId,
        template_key: t.key,
        template_version: t.version,
        category: t.category,
        format: t.format,
        name: t.name,
        values: {},
        images: {},
        overrides: {},
        status: 'draft',
      };
    }).filter(Boolean);
    if (designRows.length) {
      const { error: designErr } = await db.from('designs').insert(designRows);
      if (designErr) return { ok: false, error: `designs: ${designErr.message}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
