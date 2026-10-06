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
import { buildDemoWeek, fullName, type WeekService } from './demoWeek.ts';

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
      // A new signup gets a full free-trial month with full access, so the demo shows a licensed clinic: the income summary then
      // has its month picker and a month-by-month view (an "עוסק פטור" gets only the annual figure).
      business_tax_status: 'licensed',
      branding: {
        reviews: REVIEW_BODIES.slice(0, 3).map((text, i) => ({
          name: fakeClientName(i),
          rating: 5,
          text,
        })),
      },
    }).eq('tenant_id', tenantId);

    // ── Services ──
    const picked = pickSeedServices(field, 8);
    const { inserted: insertedServices, error: svcErr } = await insertPickedServices(db, tenantId, picked);
    if (svcErr) return { ok: false, error: `services: ${svcErr.message}` };
    const services = insertedServices.length ? insertedServices : picked.map((p) => ({ ...p }));

    // ── Clients (14), with full Hebrew names ──
    const CLIENT_COUNT = 14;
    const clientRows = Array.from({ length: CLIENT_COUNT }, (_, i) => ({
      tenant_id: tenantId,
      name: fullName(i),
      phone: fakePhone(i),
      skinType: SKIN_TYPES[i % SKIN_TYPES.length],
      status: 'active',
    }));
    const { data: clients, error: clientErr } = await db.from('clients').insert(clientRows).select('id');
    if (clientErr) return { ok: false, error: `clients: ${clientErr.message}` };
    const clientIds: string[] = (clients || []).map((c: { id: string }) => c.id);

    // ── Appointments: a clinic's week (lib/demoWeek.ts): busy and quiet days, uneven start times, a gap, a cancellation,
    // a no-show. Sequential per day, so no two ever overlap (add_appointment_no_overlap.sql's EXCLUDE constraint). ──
    const week = buildDemoWeek(services as WeekService[], CLIENT_COUNT, now);
    const apptRows = week.appts.map((a) => ({
      date: a.date,
      start_minute: a.start_minute,
      hour: Math.floor(a.start_minute / 60),
      duration: a.duration,
      name: fullName(a.clientIndex),
      service: a.service,
      price: a.price,
      color: serviceColorAt(a.serviceIndex),
      client_id: clientIds[a.clientIndex],
      confirmation_status: a.status,
      tenant_id: tenantId,
      kind: 'appointment',
    }));
    const { data: insertedAppts, error: apptErr } = await db.from('appointments').insert(apptRows).select('id, date, start_minute, client_id, name, confirmation_status');
    if (apptErr) return { ok: false, error: `appointments: ${apptErr.message}` };
    const apptIdByKey = new Map<string, string>((insertedAppts || []).map((a: { id: string; date: string; start_minute: number }) => [`${a.date}#${a.start_minute}`, a.id]));
    const pastAppts = (insertedAppts || []).filter((a: { confirmation_status: string; date: string }) => a.confirmation_status === 'confirmed' && a.date < week.today).slice(0, 8);

    // ── Receipts: dated on the day each treatment was paid (UTC, as the column holds it), for the real service, so a
    // day's revenue is a few hundred to a couple of thousand shekels instead of one lump at reset time ──
    const receiptRow = (r: (typeof week.receipts)[number]) => ({
      tenant_id: tenantId,
      client_id: r.clientIndex != null ? clientIds[r.clientIndex] : null,
      client_name: r.clientName,
      appointment_id: r.apptKey ? apptIdByKey.get(r.apptKey) ?? null : null,
      service: r.service,
      amount: r.amount,
      payment_method: r.method,
      items: JSON.stringify([{ id: '1', name: r.service, price: r.amount, qty: 1 }]),
      created_at: r.createdAtUtc,
    });
    if (week.receipts.length) {
      const { error: recErr } = await db.from('receipts').insert(week.receipts.map(receiptRow));
      if (recErr) return { ok: false, error: `receipts: ${recErr.message}` };
    }
    // Last month, so "this month vs last month" and the month screen have something to show. NOT fatal: it is decoration, and a
    // failure here must never leave the demo half-seeded.
    try {
      if (week.lastMonth.length) {
        const { error: lmErr } = await db.from('receipts').insert(week.lastMonth.map(receiptRow));
        if (lmErr) console.error('[demo-seed] last-month receipts skipped:', lmErr.message);
      }
    } catch (e) {
      console.error('[demo-seed] last-month receipts skipped:', e instanceof Error ? e.message : String(e));
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
