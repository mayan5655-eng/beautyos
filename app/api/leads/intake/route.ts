// app/api/leads/intake/route.ts
// Public lead intake: an external landing page or website form POSTs a lead
// directly into a tenant's leads list, authenticated by a per-tenant API key.
//
// POST /api/leads/intake
//   Headers: x-api-key: <the key shown once at generation>
//   Body:    { name, phone, email?, source?, fields? }
//
// The same trust model as app/api/facebook/webhook/route.ts: the caller holds
// no session, so all DB access uses the service-role client, and NOTHING
// touches the database before the key is verified. The tenant is derived from
// the key lookup ONLY - never from the request body - so a caller can write
// exactly one tenant's leads: the one whose key it holds.
//
// The key never exists in the database: settings.lead_api_key_hash holds its
// SHA-256, written by /api/settings/lead-key, compared here. v1 deliberately
// skips AI scoring (latency + spend on an unattended endpoint); the dashboard
// can score later like any manually-entered lead.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { normalizeIsraeliMobile, PHONE_ERROR_HE } from '../../../../lib/phone';
import { checkIpLimit, checkTenantLimit } from '../../../../lib/rateLimit';
import { cleanText } from '../../../../lib/cleanText';

// Service-role client (bypasses RLS). Only ever used after the key hash
// matched a tenant.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const MAX_NAME = 120;
const MAX_EMAIL = 200;
const MAX_SOURCE = 50;
// raw_form_data: whitelisted extra fields from the form, bounded so a caller
// cannot use the leads table as free storage.
const MAX_FIELDS = 20;
const MAX_FIELD_KEY = 60;
const MAX_FIELD_VALUE = 500;

const KEY_RE = /^[A-Za-z0-9_-]{20,128}$/;

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}


export async function POST(request: NextRequest) {
  try {
    // Per-IP cap BEFORE the body is read - a flood should not get as far as
    // parsing JSON, let alone hashing keys.
    const ipLimited = checkIpLimit(request, 'lead-intake');
    if (ipLimited) return ipLimited;

    const apiKey = (request.headers.get('x-api-key') || '').trim();
    if (!KEY_RE.test(apiKey)) {
      console.warn('[lead-intake] key: MISSING or malformed - rejecting');
      return NextResponse.json({ success: false, error: 'missing or invalid x-api-key' }, { status: 401 });
    }

    // Key -> tenant. The ONLY authentication on this endpoint, and the ONLY
    // source of the tenant id. The hash is indexed, so this is a point read.
    const supabase = admin();
    const { data: settingsRow, error: keyErr } = await supabase
      .from('settings')
      .select('tenant_id')
      .eq('lead_api_key_hash', sha256(apiKey))
      .maybeSingle();

    if (keyErr) {
      console.error('[lead-intake] key lookup FAILED:', keyErr.message);
      return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
    }
    if (!settingsRow?.tenant_id) {
      // One body for every bad key - no oracle for which keys exist.
      console.warn('[lead-intake] key: NO MATCH - rejecting');
      return NextResponse.json({ success: false, error: 'missing or invalid x-api-key' }, { status: 401 });
    }
    const tenantId = settingsRow.tenant_id as string;
    console.log(`[lead-intake] key: OK -> tenant ${tenantId}`);

    const tenantLimited = checkTenantLimit(tenantId, 'lead-intake');
    if (tenantLimited) return tenantLimited;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'invalid JSON body' }, { status: 400 });
    }

    const name = cleanText((body as Record<string, unknown>).name, MAX_NAME);
    if (!name) {
      return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 });
    }

    // phone is nullable in the DB; REQUIRED here by decision - a lead she
    // cannot call back is not a lead. Same rule and same normal form as the
    // booking page, so one phone never has two spellings across the app.
    const phoneCheck = normalizeIsraeliMobile(String((body as Record<string, unknown>).phone ?? ''));
    if (!phoneCheck.ok) {
      console.log('[lead-intake] phone: INVALID -', phoneCheck.reason);
      return NextResponse.json(
        { success: false, error: 'invalid phone', detail: PHONE_ERROR_HE[phoneCheck.reason] },
        { status: 400 }
      );
    }
    const phone = phoneCheck.e164;

    const email = cleanText((body as Record<string, unknown>).email, MAX_EMAIL) || null;
    // Caller-labelled source ("landing-facebook", "wix-form"), feeding the
    // lead-source attribution report. Default 'api'.
    const source = cleanText((body as Record<string, unknown>).source, MAX_SOURCE) || 'api';

    // Extra form fields, whitelisted by shape rather than by name: string
    // values only, both sides bounded, count capped.
    const rawFields = (body as Record<string, unknown>).fields;
    const fields: Record<string, string> = {};
    if (rawFields && typeof rawFields === 'object' && !Array.isArray(rawFields)) {
      for (const [k, v] of Object.entries(rawFields as Record<string, unknown>).slice(0, MAX_FIELDS)) {
        const key = cleanText(k, MAX_FIELD_KEY);
        const val = cleanText(v, MAX_FIELD_VALUE);
        if (key && val) fields[key] = val;
      }
    }

    // Dedupe on (tenant, phone), mirroring the skin scanner: a repeat submit
    // updates the card rather than duplicating it, and a status she already
    // advanced is never dragged back to 'new'.
    const { data: existing, error: exErr } = await supabase
      .from('leads')
      .select('id, status')
      .eq('tenant_id', tenantId)
      .eq('phone', phone)
      .limit(1);
    if (exErr) {
      console.error('[lead-intake] dedupe read FAILED:', exErr.message);
      return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
    }

    const leadCore = {
      tenant_id: tenantId,
      name,
      phone,
      email,
      source,
      raw_form_data: { intake: 'api', source, ...fields },
      // timestamptz - always written. (created_at is timestamp WITHOUT time
      // zone with its own default; deliberately not written here.)
      received_at: new Date().toISOString(),
    };

    if (existing && existing.length > 0) {
      const keepStatus =
        existing[0].status && existing[0].status !== 'new' ? existing[0].status : 'new';
      const { error: upErr } = await supabase
        .from('leads')
        .update({ ...leadCore, status: keepStatus })
        .eq('id', existing[0].id);
      if (upErr) {
        console.error('[lead-intake] lead update FAILED:', upErr.code || '', upErr.message);
        return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
      }
      console.log(`[lead-intake] lead update: OK tenant ${tenantId} source ${source}`);
      return NextResponse.json({ success: true, deduplicated: true });
    }

    const { error: insErr } = await supabase
      .from('leads')
      .insert({ ...leadCore, status: 'new' });
    if (insErr) {
      console.error('[lead-intake] lead insert FAILED:', insErr.code || '', insErr.message);
      return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
    }
    console.log(`[lead-intake] lead insert: OK tenant ${tenantId} source ${source}`);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[lead-intake] threw:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ success: false, error: 'server error' }, { status: 500 });
  }
}
