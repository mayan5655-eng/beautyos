// marketing/promo-fixtures.mjs
//
// A tiny stand-in for Supabase's REST API, for the promo video's screens that production cannot show yet: the online gift
// voucher shop and the voucher page need Grow switched on, and Grow is off in production (GET /api/grow/policy/public answers
// {"mode":"off"}). promo-shots.mjs starts the app locally (`next dev`) with NEXT_PUBLIC_SUPABASE_URL pointing here, so the REAL
// pages render the made-up business below. Nothing here reaches a real database, a real tenant, Grow or WhatsApp:
//   * the tenant id is a fixed made-up UUID, never the demo tenant and never a real business;
//   * every write (POST/PATCH/DELETE other than the read-only RPC lookups) is refused with 403;
//   * the people are invented, the photos are the product's own stock pictures in public/defaults.

import http from 'node:http';

export const FIX_TENANT = '7e57f1c5-0000-4000-8000-00000000c0de';
export const FIX_SLUG = 'studio-ronit';
export const FIX_VOUCHER_TOKEN = 'c0ffee'.repeat(8);   // 48 hex, the shape of a real token
export const FIX_PAY_TOKEN = 'beaded'.repeat(8);

const settings = {
  tenant_id: FIX_TENANT,
  business_name: 'סטודיו רונית',
  primary_color: '#C98B7F',
  whatsapp: '0500000000',
  automations: {
    gift_vouchers: {
      enabled: true, online: true, amounts: [200, 300, 500], services: ['טיפול פנים קלאסי', 'ניקוי פנים עמוק'], validity_months: 12,
      note: 'השובר תקף לשנה, לכל טיפול בסטודיו',
    },
  },
};
const in8Months = new Date(Date.now() + 240 * 864e5).toISOString().slice(0, 10);
const TABLES = {
  settings: [settings],
  tenants: [{ id: FIX_TENANT, name: 'סטודיו רונית', slug: FIX_SLUG, plan_status: 'active', trial_started_at: null, trial_ends_at: null }],
  service_prices: [
    { id: 1, name: 'טיפול פנים קלאסי', price: 260, active: true },
    { id: 2, name: 'ניקוי פנים עמוק', price: 300, active: true },
  ],
  grow_accounts: [{ user_id: 'fixture', enabled: true }],
  gift_vouchers: [{
    id: 1, tenant_id: FIX_TENANT, code: 'RNT7K2QX', token: FIX_VOUCHER_TOKEN, kind: 'service', service_name: 'טיפול פנים קלאסי',
    initial_amount: 260, balance: 260, status: 'active', expires_at: in8Months, buyer_name: 'מיכל לוי', buyer_phone: '0500000000',
    recipient_name: 'נועה', message: 'יום הולדת שמח! מגיע לך פינוק 💗', sold_via: 'online', grow_payment_id: null, receipt_id: null,
    voided_at: null, void_reason: null, created_at: new Date().toISOString(),
  }],
};
const RPC = { get_public_tenant_by_slug: [{ id: FIX_TENANT, name: 'סטודיו רונית' }] };

export function startFixtureDb(port = 3200) {
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const m = /^\/rest\/v1\/(rpc\/)?([a-z_]+)/.exec(u.pathname);
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(body)); };
    if (!m) return send(404, { message: 'not here' });
    if (m[1]) return RPC[m[2]] ? send(200, RPC[m[2]]) : send(404, { code: 'PGRST202', message: 'no such function' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(403, { message: 'fixture database is read-only' });
    let rows = TABLES[m[2]];
    if (!rows) return send(404, { code: '42P01', message: `relation "${m[2]}" does not exist` });
    for (const [k, v] of u.searchParams) if (/^eq\./.test(v)) rows = rows.filter((r) => !(k in r) || String(r[k]) === v.slice(3));
    if (/vnd\.pgrst\.object/.test(req.headers.accept || '')) return rows.length ? send(200, rows[0]) : send(406, { code: 'PGRST116', message: 'no rows' });
    return send(200, rows);
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}
