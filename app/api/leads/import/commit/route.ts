// app/api/leads/import/commit/route.ts
//
// STAGE 3 of the lead importer (.csv, .xlsx, .xls): the insert.
//
// ── dryRun is the default ──────────────────────────────────────────────────
// This route writes ONLY when the body carries `dryRun: false` explicitly.
// Anything else - the field missing, null, the string "false", a typo - is
// treated as a dry run. A write to a real cosmetician's leads table should
// require saying so, not require remembering not to.
//
// In dry-run mode NO DATABASE CALL IS MADE AT ALL, not even a read. The
// response describes exactly what a real run would do: the row count, the
// chunk plan, the skipped rows with reasons, and the first rows as they would
// land.
//
// ── The file is re-parsed here, not trusted from the client ────────────────
// The preview posts the same file again rather than the rows it derived. The
// server therefore builds what it writes from the bytes, using the same
// lib/leads/buildRows.ts the preview used - so what she approved and what
// lands are computed by one implementation from one source. A client that sent
// pre-built rows could send anything.
//
// ── Idempotent ─────────────────────────────────────────────────────────────
// Upsert on (tenant_id, source, external_id), which is a real unique index
// (leads_tenant_source_external_key, verified live). external_id is the
// normalised mobile and is never null or empty, so re-running the same file
// updates the same rows instead of duplicating them.

import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/lib/supabase/server';
import { checkIpLimit, checkTenantLimit } from '@/lib/rateLimit';
import { maskValue } from '@/lib/leads/csvImport';
// The SAME parser the analyse route used. Given identical bytes and identical
// options it is deterministic, including which sheet it picks - which is what
// stops the preview and the insert reading different tabs of a workbook.
import { readUpload } from '@/lib/leads/readUpload';
import { buildRows, SKIP_REASON_HE, IMPORT_STATUS, IMPORT_SOURCE } from '@/lib/leads/buildRows';
import type { ColumnMapping } from '@/lib/leads/buildRows';

/** Chunk size. 247 rows becomes 5 statements, not one 247-row statement. */
const CHUNK = 50;
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
      console.error('[leads/import/commit] tenant resolve failed:', rpcErr?.message);
      return NextResponse.json({ success: false, error: 'לא זוהה עסק' }, { status: 400 });
    }

    const tenantLimited = checkTenantLimit(tenantId as string, 'leads-import');
    if (tenantLimited) return tenantLimited;

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) {
      return NextResponse.json({ success: false, error: 'לא נבחר קובץ' }, { status: 400 });
    }
    const filename = file instanceof File ? file.name : null;
    // Which sheet she previewed. Travels with the commit precisely so the
    // insert cannot read a different tab from the one she approved.
    const sheet = String(form.get('sheet') ?? '') || null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) {
      return NextResponse.json({ success: false, error: 'הקובץ ריק או גדול מדי' }, { status: 400 });
    }

    let mapping: ColumnMapping = {};
    try {
      mapping = JSON.parse(String(form.get('mapping') ?? '{}')) as ColumnMapping;
    } catch {
      return NextResponse.json({ success: false, error: 'מיפוי העמודות אינו תקין' }, { status: 400 });
    }
    if (!mapping.phone) {
      return NextResponse.json(
        { success: false, error: 'חובה למפות עמודת טלפון' },
        { status: 400 }
      );
    }

    // Writes require saying so. Everything else is a dry run.
    const dryRun = String(form.get('dryRun') ?? 'true') !== 'false';

    const read = readUpload(bytes, { filename, sheet, maxRows: MAX_ROWS });
    if (!read.ok) {
      return NextResponse.json(
        { success: false, error: read.message, problem: read.problem, sheetNames: read.sheetNames },
        { status: 400 }
      );
    }
    const { format, headers, rows, delimiter, encoding, sheetName } = read;

    const built = buildRows(headers, rows, mapping);
    const chunkCount = Math.ceil(built.valid.length / CHUNK) || 0;

    // Everything the caller needs to see, identical in both modes.
    const plan = {
      format,
      encoding,
      delimiter,
      // Echoed so the dry-run output states which tab is about to be imported.
      sheetName,
      tenantId,
      status: IMPORT_STATUS,
      source: IMPORT_SOURCE,
      conflictTarget: 'tenant_id,source,external_id',
      counts: built.counts,
      chunkSize: CHUNK,
      chunkCount,
      skippedByReasonHe: Object.fromEntries(
        Object.entries(built.counts.byReason)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => [SKIP_REASON_HE[k as keyof typeof SKIP_REASON_HE], n])
      ),
      // Masked: a skipped row is still a real person's phone number.
      skippedSample: built.skipped.slice(0, 5).map((s) => ({
        row: s.row, reason: SKIP_REASON_HE[s.reason], value: maskValue(s.value),
      })),
      firstRows: built.valid.slice(0, 5),
    };

    if (dryRun) {
      // NO DATABASE CALL. Not a read, not a count, nothing.
      console.log(
        `[leads/import/commit] DRY RUN — no database call. ` +
        `TENANT FILTER: tenant_id = ${tenantId} | would upsert ${built.valid.length} row(s) ` +
        `in ${chunkCount} chunk(s) of ${CHUNK}`
      );
      return NextResponse.json({ success: true, dryRun: true, wroteAnything: false, plan });
    }

    // ── real run ────────────────────────────────────────────────────────────
    const admin = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const chunks: Array<{ chunk: number; attempted: number; landed: number; error: string | null }> = [];
    let landed = 0;
    let firstError: string | null = null;

    for (let i = 0; i < built.valid.length; i += CHUNK) {
      const slice = built.valid.slice(i, i + CHUNK);
      const chunkNo = Math.floor(i / CHUNK) + 1;
      const payload = slice.map((r) => ({ ...r, tenant_id: tenantId }));

      console.log(
        `[leads/import/commit] TENANT FILTER: tenant_id = ${tenantId} | ` +
        `chunk ${chunkNo}/${chunkCount} | upsert ${slice.length} row(s) ` +
        `on conflict (tenant_id, source, external_id)`
      );

      const { data, error } = await admin
        .from('leads')
        .upsert(payload, { onConflict: 'tenant_id,source,external_id' })
        .select('id');

      if (error) {
        // One bad chunk does not abort the rest, and it does not get counted
        // as landed. "How many actually made it" is the question this whole
        // route has to be able to answer afterwards.
        console.error(`[leads/import/commit] chunk ${chunkNo} FAILED: ${error.code} ${error.message}`);
        chunks.push({ chunk: chunkNo, attempted: slice.length, landed: 0, error: error.message });
        if (!firstError) firstError = error.message;
        continue;
      }
      const got = data?.length ?? 0;
      landed += got;
      chunks.push({ chunk: chunkNo, attempted: slice.length, landed: got, error: null });
    }

    // Independent confirmation, not a running total: ask the database.
    console.log(
      `[leads/import/commit] TENANT FILTER: tenant_id = ${tenantId} AND status = ${IMPORT_STATUS} | final count`
    );
    const { count: followUpCount, error: countErr } = await admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', IMPORT_STATUS);

    const failedChunks = chunks.filter((c) => c.error).length;

    return NextResponse.json({
      success: failedChunks === 0,
      dryRun: false,
      wroteAnything: landed > 0,
      plan,
      result: {
        attempted: built.valid.length,
        landed,
        notLanded: built.valid.length - landed,
        failedChunks,
        firstError,
        chunks,
        followUpLaterCountForTenant: countErr ? null : followUpCount,
        countError: countErr?.message ?? null,
      },
      // Said plainly, because a partial import is the case where a vague
      // success message does the most damage.
      message:
        failedChunks === 0
          ? `יובאו ${landed} פניות.`
          : `יובאו ${landed} מתוך ${built.valid.length}. ${failedChunks} מקטעים נכשלו — אפשר להריץ שוב, הייבוא לא יוצר כפילויות.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[leads/import/commit] threw:', message);
    return NextResponse.json(
      { success: false, error: 'הייבוא נכשל' },
      { status: 500 }
    );
  }
}
