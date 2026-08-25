// app/api/leads/import/analyze/route.ts
//
// STAGE 1 of the CSV lead importer: analyse and propose. THIS ROUTE WRITES
// NOTHING. It does not touch public.leads at all - it decodes the upload,
// parses it, asks Claude to map the columns, validates the phone column, and
// returns a preview for a human to approve. Stage 2 is what will insert.
//
// ── What leaves this process ───────────────────────────────────────────────
// Only MASKED sample rows go to the Anthropic API by default: digits become 9,
// Hebrew letters א, Latin x/X, with punctuation and length preserved. These are
// real clients' names, phones and email addresses, and the mapping call needs
// their SHAPE, not their values. `sendRawSamples: true` opts out per request;
// it defaults to false and the response always reports which was used.
//
// ── Tenant ─────────────────────────────────────────────────────────────────
// Resolved from the SESSION via get_user_tenant_id(), never from the body. This
// route reads no tenant data, but the tenant is still resolved and logged so
// the rate limit is per-business and Stage 2 inherits the same identity path.

import { NextResponse } from 'next/server';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import {
  decodeCsv,
  parseCsv,
  maskRow,
  normalizeIsraeliMobile,
  PHONE_REASON_HE,
  type PhoneReason,
} from '@/lib/leads/csvImport';
import { proposeMapping, type TargetField } from '@/lib/leads/mapHeaders';

/** How many rows the mapper sees. Three is enough to show a column's shape. */
const SAMPLE_ROWS = 3;
/** Guardrail on the upload itself; ~247 leads is far below this. */
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20_000;

export async function POST(request: Request) {
  try {
    const ipLimited = checkIpLimit(request, 'leads-import');
    if (ipLimited) return ipLimited;

    const session = await createSessionClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'לא מחובר' }, { status: 401 });
    }

    const { data: tenantId, error: rpcErr } = await session.rpc('get_user_tenant_id');
    if (rpcErr || !tenantId) {
      console.error('[leads/import/analyze] tenant resolve failed:', rpcErr?.message);
      return NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 });
    }
    console.log(`[leads/import/analyze] TENANT FILTER: tenant_id = ${tenantId} (analyse only, no writes)`);

    const tenantLimited = checkTenantLimit(tenantId as string, 'leads-import');
    if (tenantLimited) return tenantLimited;

    // Accepts either a multipart upload or a raw JSON body carrying the text.
    let bytes: Uint8Array | null = null;
    let sendRawSamples = false;

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      sendRawSamples = String(form.get('sendRawSamples') ?? '') === 'true';
      if (!(file instanceof Blob)) {
        return NextResponse.json({ success: false, error: 'לא נבחר קובץ' }, { status: 400 });
      }
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      const body = await request.json().catch(() => ({}));
      sendRawSamples = body?.sendRawSamples === true;
      if (typeof body?.csv === 'string' && body.csv) {
        bytes = new TextEncoder().encode(body.csv);
      }
    }

    if (!bytes || bytes.length === 0) {
      return NextResponse.json({ success: false, error: 'הקובץ ריק' }, { status: 400 });
    }
    if (bytes.length > MAX_BYTES) {
      return NextResponse.json({ success: false, error: 'הקובץ גדול מדי' }, { status: 400 });
    }

    const { text, encoding } = decodeCsv(bytes);
    const { headers, rows, delimiter } = parseCsv(text);

    if (headers.length === 0) {
      return NextResponse.json({ success: false, error: 'לא נמצאה שורת כותרות' }, { status: 400 });
    }
    if (rows.length === 0) {
      // An empty file is a real answer, and distinct from a failure to read it.
      return NextResponse.json({ success: false, error: 'הקובץ לא מכיל שורות נתונים' }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ success: false, error: 'יותר מדי שורות בקובץ' }, { status: 400 });
    }

    const rawSamples = rows.slice(0, SAMPLE_ROWS);
    const samplesForModel = sendRawSamples ? rawSamples : rawSamples.map(maskRow);

    const proposal = await proposeMapping(headers, samplesForModel);

    // Validate the proposed phone column across the WHOLE file, so the preview
    // can state exactly how many rows are importable before anything is written.
    const phoneColumn = proposal.mapping.phone.csvColumn;
    const phoneIndex = phoneColumn ? headers.indexOf(phoneColumn) : -1;

    let importable = 0;
    const skippedByReason: Record<string, number> = {};
    const skippedExamples: Array<{ row: number; value: string; reason: string }> = [];
    const seenKeys = new Set<string>();
    let duplicateKeys = 0;

    if (phoneIndex >= 0) {
      rows.forEach((row, i) => {
        const result = normalizeIsraeliMobile(row[phoneIndex]);
        if (result.ok) {
          // The external_id is the normalised number, so two rows carrying the
          // same mobile collapse into one on upsert. Counted here so the
          // preview says so rather than the row count quietly shrinking.
          if (seenKeys.has(result.e164)) duplicateKeys++;
          else { seenKeys.add(result.e164); importable++; }
          return;
        }
        const reason = PHONE_REASON_HE[result.reason as PhoneReason];
        skippedByReason[reason] = (skippedByReason[reason] || 0) + 1;
        if (skippedExamples.length < 5) {
          // Masked: a skipped row is still a real person's record.
          skippedExamples.push({ row: i + 2, value: maskRow([row[phoneIndex] ?? ''])[0], reason });
        }
      });
    }

    const mappedFields = (Object.keys(proposal.mapping) as TargetField[])
      .filter((f) => proposal.mapping[f].csvColumn !== null);

    return NextResponse.json({
      success: true,
      wroteAnything: false,
      encoding,
      delimiter,
      rowCount: rows.length,
      headers,
      // The parsed rows, so the preview can recompute instantly when she
      // changes a column in a dropdown. Without them the client would have to
      // re-upload and re-run the Claude call on every dropdown change, which
      // would be slow and would spend a request per keystroke.
      //
      // This is HER OWN file going back to HER OWN browser over HTTPS. The
      // masking promise is about what reaches the Anthropic API, and that is
      // unchanged: only `sample` below is ever sent there, and only masked.
      rows,
      samplesWereMasked: !sendRawSamples,
      mappingSource: proposal.source,
      fallbackReason: proposal.fallbackReason ?? null,
      mapping: proposal.mapping,
      mappedFields,
      unmappedColumns: proposal.unmappedColumns,
      sample: rawSamples.map(maskRow),
      phone: {
        column: phoneColumn,
        importable,
        duplicateKeys,
        skipped: rows.length - importable - duplicateKeys,
        skippedByReason,
        skippedExamples,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[leads/import/analyze] threw:', message);
    return NextResponse.json(
      { success: false, error: 'לא הצלחנו לנתח את הקובץ' },
      { status: 500 }
    );
  }
}
