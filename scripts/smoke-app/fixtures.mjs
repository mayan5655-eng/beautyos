// scripts/smoke-app/fixtures.mjs — a small invented business for the browser run (run.mjs). No real tenant, no real client.
import { buildSeedSettings } from '../../lib/tenantTemplate.ts';

export const TENANT = '11111111-1111-4111-8111-111111111111';
export const USER = { id: '22222222-2222-4222-8222-222222222222', aud: 'authenticated', role: 'authenticated', email: 'smoke@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };

export function buildTables(now = new Date()) {
  const T = TENANT;
  const day = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const at = (n) => new Date(now.getTime() + n * 864e5).toISOString();
  const clients = ['דנה כהן', 'מיכל לוי', 'נועה ישראלי', 'שירה אברהם'].map((name, i) => ({ id: i + 1, tenant_id: T, name, phone: `05000000${i + 1}0`, skinType: 'מעורב', notes: '', status: 'active', created_at: at(-(i + 1) * 20) }));
  const service_prices = [
    { id: 1, tenant_id: T, name: 'טיפול פנים קלאסי', price: 280, duration: 60, color: '#C9A39A', active: true },
    { id: 2, tenant_id: T, name: "לק ג'ל", price: 120, duration: 45, color: '#B7C4B1', active: true },
  ];
  const appointments = [-30, -7, -1, 0, 0, 1, 3].map((n, i) => ({
    id: i + 1, tenant_id: T, date: day(n), start_minute: (10 + (i % 5)) * 60, hour: 10 + (i % 5), name: clients[i % 4].name, client_id: clients[i % 4].id,
    service: service_prices[i % 2].name, duration: service_prices[i % 2].duration, color: service_prices[i % 2].color, note: '', price: service_prices[i % 2].price,
    status: n < 0 ? 'completed' : 'scheduled', confirmation_status: 'pending', confirmation_sent: false, created_at: at(0),
  }));
  const receipts = [-30, -7, -1].map((n, i) => ({ id: i + 1, tenant_id: T, client_id: clients[i].id, client_name: clients[i].name, service: service_prices[i % 2].name, amount: service_prices[i % 2].price, total: service_prices[i % 2].price, payment_method: 'cash', created_at: at(n), receipt_number: 100 + i }));
  const seed = buildSeedSettings();
  const settings = [{
    id: 1, tenant_id: T, business_name: 'סטודיו בדיקה', business_phone: '050-0000000', primary_color: '#B08D7E', business_fields: ['cosmetics', 'nails'], slug: 'smoke', branding: {}, ...seed,
    // The tour is marked seen: it would sit on top of every screen and take the clicks.
    automations: { ...(seed.automations || {}), feature_flags: {}, onboarding_tour_seen: true },
  }];
  const leads = [{ id: 1, tenant_id: T, name: 'ליד בדיקה', phone: '0500000099', status: 'new', source: 'instagram', created_at: at(0) }];
  const packages = [{ id: 1, tenant_id: T, name: 'סדרת 5 טיפולים', sessions: 5, price: 1200, active: true, created_at: at(0) }];
  const expenses = [{ id: 1, tenant_id: T, date: day(-3), amount: 150, category: 'חומרים', description: 'חומרים', created_at: at(0) }];
  return { clients, service_prices, appointments, receipts, settings, leads, packages, expenses };
}
