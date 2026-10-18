// Shared helpers for the browser smoke tests (Playwright against a local production build).
// Run with: node --env-file=.env.local scripts/smoke/<script>.mjs
// Test accounts are always NEW and named kalmea-smoke-*@example.com, so they can be found and removed afterwards. The real business
// (tenant 448e9e45-2251-4572-b665-886c5bc7a4c8) is refused everywhere here.
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

export const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';
export const REAL_TENANT = '448e9e45-2251-4572-b665-886c5bc7a4c8';
export const PASSWORD = 'Smoke-Test-2026!';

export const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export const newEmail = (label) => `kalmea-smoke-${label}-${Date.now().toString(36)}@example.com`;

export async function launch(opts = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, locale: 'he-IL', ...opts });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 240)}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e.message).slice(0, 240)}`));
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`); });
  return { browser, ctx, page, problems };
}

/** Confirm a freshly signed-up user the way clicking the email link would, then return the user. */
export async function confirmUser(email) {
  const db = admin();
  for (let p = 1; p <= 5; p++) {
    const { data } = await db.auth.admin.listUsers({ page: p, perPage: 200 });
    const u = (data?.users || []).find((x) => x.email === email);
    if (u) { await db.auth.admin.updateUserById(u.id, { email_confirm: true }); return u; }
    if (!data?.users?.length) break;
  }
  return null;
}

export async function tenantIdOf(userId) {
  const db = admin();
  const { data } = await db.from('tenant_members').select('tenant_id').eq('user_id', userId).limit(1);
  const id = data?.[0]?.tenant_id || null;
  if (id === REAL_TENANT) throw new Error('refusing to use the real tenant');
  return id;
}
