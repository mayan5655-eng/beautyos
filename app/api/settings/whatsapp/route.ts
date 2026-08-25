// app/api/settings/whatsapp/route.ts
//
// The ONLY path that writes a GreenAPI token.
//
// ── Why this route has to exist ────────────────────────────────────────────
// The token used to go straight from a React input into settings, in the
// browser's own UPDATE. Once the column is ciphertext the browser cannot
// produce it: TOKEN_ENCRYPTION_KEY is server-side and must stay there. So the
// write moves here, and app/beautyos.jsx stops sending the field entirely.
//
// ── Write-only ─────────────────────────────────────────────────────────────
// GET reports whether a token is set. It NEVER returns the token, encrypted or
// otherwise. Before this change the plaintext round-tripped to the browser on
// every settings load and sat in a form field; now the value only ever travels
// inward.
//
// ── Identity ───────────────────────────────────────────────────────────────
// The tenant comes from get_user_tenant_id() on HER session, never from the
// body. The body carries the token and nothing else that matters.

import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { readCredentials, writeToken, clearToken } from '@/lib/greenApi/credentials';

/** GreenAPI tokens are ~50 hex chars. This is a sanity bound, not a format. */
const MAX_TOKEN = 500;

async function resolveTenant() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: 'לא מחובר', status: 401 as const, tenantId: null };

  const { data: tenantId, error } = await session.rpc('get_user_tenant_id');
  if (error || !tenantId) {
    console.error('[settings/whatsapp] tenant resolve failed:', error?.message);
    return { error: 'לא זוהה עסק', status: 400 as const, tenantId: null };
  }
  return { error: null, status: 200 as const, tenantId: tenantId as string };
}

/** Is a token stored? Never what it is. */
export async function GET() {
  const t = await resolveTenant();
  if (!t.tenantId) return NextResponse.json({ success: false, error: t.error }, { status: t.status });

  console.log(`[settings/whatsapp] TENANT FILTER: tenant_id = ${t.tenantId} (status read)`);
  const cred = await readCredentials(t.tenantId);
  return NextResponse.json({
    success: true,
    connected: !!cred,
    idInstance: cred?.idInstance ?? null,
    // Diagnostic only while both columns exist; never the value itself.
    tokenSource: cred?.tokenSource ?? 'none',
  });
}

export async function POST(request: Request) {
  const t = await resolveTenant();
  if (!t.tenantId) return NextResponse.json({ success: false, error: t.error }, { status: t.status });

  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === 'string' ? body.token.trim() : '';

  if (!token) {
    return NextResponse.json({ success: false, error: 'נא להזין טוקן' }, { status: 400 });
  }
  if (token.length > MAX_TOKEN) {
    return NextResponse.json({ success: false, error: 'הטוקן ארוך מדי' }, { status: 400 });
  }

  console.log(`[settings/whatsapp] TENANT FILTER: tenant_id = ${t.tenantId} (token write, encrypted)`);
  const res = await writeToken(t.tenantId, token);
  if (!res.ok) {
    // Never echo the token back, not even on failure.
    return NextResponse.json(
      { success: false, error: 'לא הצלחנו לשמור את הטוקן' },
      { status: 500 }
    );
  }
  return NextResponse.json({ success: true, connected: true });
}

export async function DELETE() {
  const t = await resolveTenant();
  if (!t.tenantId) return NextResponse.json({ success: false, error: t.error }, { status: t.status });

  console.log(`[settings/whatsapp] TENANT FILTER: tenant_id = ${t.tenantId} (token cleared)`);
  const res = await clearToken(t.tenantId);
  if (!res.ok) {
    return NextResponse.json({ success: false, error: 'לא הצלחנו לנתק' }, { status: 500 });
  }
  return NextResponse.json({ success: true, connected: false });
}
