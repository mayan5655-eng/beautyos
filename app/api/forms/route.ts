// app/api/forms/route.ts
//
// The public consent-form endpoint: fetch one form to display, and sign it.
// No auth - this is the link a cosmetician sends her client, and the client
// has no login.
//
// ── Why this exists ────────────────────────────────────────────────────────
// app/form/page.jsx read and wrote public.forms straight from the browser on
// the ANON key. RLS denies anon on that table, so the read returned zero rows
// to every real client and the page fell through to its "form not found"
// branch. A client opening a consent link was told the form DOES NOT EXIST -
// a blocked read presented as a missing record. The signature write would have
// failed too, so journey 7 never worked at all.
//
// This is the same fix as /api/availability: move the read to the server,
// where the service-role key can see the row, and return only what the page
// needs.
//
// ── What leaves this endpoint ──────────────────────────────────────────────
// GET returns exactly three fields: client_name, form_type, status.
//
// NOT form_data and NOT signature. Those are the answers to a health
// questionnaire - pregnancy, epilepsy, diabetes, blood thinners - and a
// previously captured signature. The page never displays them, and a form link
// is a bearer URL that can be forwarded, screenshotted or found in a message
// history. `select('*')` here would turn every old link into a window onto a
// client's medical answers. The column list is the enforcement.
//
// tenant_id is not returned either. The page has no use for it and it would
// only help someone enumerate businesses.
//
// ── Signing is one-way ─────────────────────────────────────────────────────
// POST refuses to overwrite a form that is already signed. Before this, anyone
// holding the link could re-submit and replace a completed health declaration,
// including its signature. That is a legal record of what the client declared
// before treatment; it must not be silently rewritable by whoever still has
// the URL in their WhatsApp history. An already-signed form comes back as
// { state: 'already-signed' } so the page can say so plainly.

import { createClient } from '@supabase/supabase-js';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** The ONLY columns that may leave this route. */
const SAFE_FIELDS = 'id, client_name, form_type, status';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ~500KB of base64. A signature canvas produces a few tens of KB. */
const MAX_SIGNATURE_CHARS = 700_000;
/** The answers object is a handful of short strings plus optional notes. */
const MAX_ANSWERS_CHARS = 20_000;

export async function GET(request: Request) {
  try {
    const ipLimited = checkIpLimit(request, 'form-fetch');
    if (ipLimited) return ipLimited;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id') || '';
    if (!UUID_RE.test(id)) {
      return Response.json(
        { success: false, error: 'קישור הטופס אינו תקין' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('forms')
      .select(`${SAFE_FIELDS}, tenant_id`)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[forms] read failed:', error.message);
      // An explicit failure, NOT an empty answer. The page has to be able to
      // tell "this form does not exist" from "I could not find out", because
      // conflating those is the bug being fixed.
      return Response.json(
        { success: false, error: 'לא הצלחנו לטעון את הטופס' },
        { status: 500 }
      );
    }
    if (!data) {
      return Response.json(
        { success: false, notFound: true, error: 'הטופס לא נמצא' },
        { status: 404 }
      );
    }

    const tenantLimited = checkTenantLimit(data.tenant_id, 'form-fetch');
    if (tenantLimited) return tenantLimited;

    return Response.json({
      success: true,
      form: {
        id: data.id,
        client_name: data.client_name,
        form_type: data.form_type,
        status: data.status,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[forms] GET threw:', message);
    return Response.json(
      { success: false, error: 'לא הצלחנו לטעון את הטופס' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const ipLimited = checkIpLimit(request, 'form-sign');
    if (ipLimited) return ipLimited;

    const body = await request.json().catch(() => ({}));
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!UUID_RE.test(id)) {
      return Response.json(
        { success: false, error: 'קישור הטופס אינו תקין' },
        { status: 400 }
      );
    }

    const signature = typeof body?.signature === 'string' ? body.signature : '';
    if (!signature.startsWith('data:image/') || signature.length > MAX_SIGNATURE_CHARS) {
      return Response.json(
        { success: false, error: 'החתימה חסרה או אינה תקינה' },
        { status: 400 }
      );
    }

    const answers = body?.answers;
    if (!answers || typeof answers !== 'object') {
      return Response.json(
        { success: false, error: 'התשובות חסרות' },
        { status: 400 }
      );
    }
    if (JSON.stringify(answers).length > MAX_ANSWERS_CHARS) {
      return Response.json(
        { success: false, error: 'התשובות ארוכות מדי' },
        { status: 400 }
      );
    }

    // Read first: needed for the tenant rate-limit key, and to refuse
    // overwriting a form that has already been signed.
    const { data: existing, error: readErr } = await supabase
      .from('forms')
      .select('id, tenant_id, status')
      .eq('id', id)
      .maybeSingle();

    if (readErr) {
      console.error('[forms] pre-sign read failed:', readErr.message);
      return Response.json(
        { success: false, error: 'לא הצלחנו לשמור את הטופס' },
        { status: 500 }
      );
    }
    if (!existing) {
      return Response.json(
        { success: false, notFound: true, error: 'הטופס לא נמצא' },
        { status: 404 }
      );
    }

    const tenantLimited = checkTenantLimit(existing.tenant_id, 'form-sign');
    if (tenantLimited) return tenantLimited;

    if (existing.status === 'signed') {
      // Not an error, and deliberately not an overwrite. See the header.
      return Response.json({ success: true, state: 'already-signed' });
    }

    const { data: updated, error: writeErr } = await supabase
      .from('forms')
      .update({
        form_data: answers,
        signature,
        signed_at: new Date().toISOString(),
        status: 'signed',
      })
      .eq('id', id)
      .eq('status', existing.status) // lost-update guard: two tabs, one wins
      .select('id')
      .maybeSingle();

    if (writeErr) {
      console.error('[forms] write failed:', writeErr.message);
      return Response.json(
        { success: false, error: 'לא הצלחנו לשמור את הטופס' },
        { status: 500 }
      );
    }
    if (!updated) {
      // The status changed between the read and the write - someone else
      // signed it a moment ago. Same answer as the already-signed case.
      return Response.json({ success: true, state: 'already-signed' });
    }

    return Response.json({ success: true, state: 'signed' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[forms] POST threw:', message);
    return Response.json(
      { success: false, error: 'לא הצלחנו לשמור את הטופס' },
      { status: 500 }
    );
  }
}
