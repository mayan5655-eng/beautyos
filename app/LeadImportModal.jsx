'use client';

// app/LeadImportModal.jsx
//
// The lead importer (.csv, .xlsx, .xls): pick a file, choose a sheet if it is
// a workbook with several, review the proposed mapping, correct it, see exactly
// what would land, then import.
//
// ── Where the write is ─────────────────────────────────────────────────────
// THIS MODAL CAN NOW WRITE, on exactly one path:
//
//   preview  ->  [ייבוא N פניות]      opens the confirmation panel. No write.
//   confirming -> [כן, ייבא N פניות]  the only place dryRun:false is sent.
//
// Two clicks, with the row count stated in between. The endpoint also treats a
// missing or malformed dryRun field as a dry run, so a request that loses it
// writes nothing rather than writing by accident.
//
// Analysing (/api/leads/import/analyze) still writes nothing and never touches
// public.leads.
//
// ── Why the preview recomputes locally ─────────────────────────────────────
// The analyze response carries the parsed rows, so changing a column in a
// dropdown re-derives the whole preview instantly, in the browser. The
// alternative - re-uploading and re-running the Claude call per dropdown change
// - would be slow and would spend an API request per correction.
//
// The counts come from lib/leads/buildRows.ts, the SAME module Stage 3 will use
// to do the insert. A preview that says "247 will import" and an insert that
// writes 244 is worse than no preview, so both read from one implementation.

import { useCallback, useMemo, useRef, useState } from 'react';
import { buildRows, SKIP_REASON_HE, IMPORT_STATUS, IMPORT_SOURCE } from '@/lib/leads/buildRows';
import { maskValue } from '@/lib/leads/csvImport';

const FIELD_LABELS = {
  name: 'שם',
  phone: 'טלפון',
  email: 'אימייל',
  source: 'מקור',
  notes: 'הערות',
  service_interest: 'טיפול שמעניין',
};
const FIELD_ORDER = ['name', 'phone', 'email', 'source', 'notes', 'service_interest'];

export default function LeadImportModal({ open, onClose, onImported, pc, pcGrad, pcShadow }) {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  // The File itself is kept because the commit re-posts it: the server rebuilds
  // the rows from the bytes rather than trusting rows the client derived.
  const [file, setFile] = useState(null);
  // 'preview' -> 'confirming' -> 'importing' -> 'done'. The write happens only
  // on the button in 'confirming', never on the one in 'preview'.
  const [stage, setStage] = useState('preview');
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  // field -> csv column (or null). Seeded from the proposal, then hers to edit.
  const [mapping, setMapping] = useState({});
  // Workbooks only. `sheet` is the tab she is looking at; it is sent with BOTH
  // the analyse and the commit, so the insert can never read a different tab
  // from the one she approved.
  const [sheet, setSheet] = useState(null);
  // Kept separately from `result` so the picker survives an error response -
  // landing on an empty tab must let her switch, not dead-end.
  const [sheetNames, setSheetNames] = useState([]);

  const reset = useCallback(() => {
    setFileName(''); setAnalyzing(false); setError(''); setResult(null); setMapping({});
    setFile(null); setStage('preview'); setImportResult(null); setImportError('');
    setSheet(null); setSheetNames([]);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const close = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  const analyze = useCallback(async (file, pickedSheet = null) => {
    setAnalyzing(true); setError(''); setResult(null); setMapping({});
    setStage('preview'); setImportResult(null); setImportError('');
    try {
      const form = new FormData();
      form.append('file', file);
      if (pickedSheet) form.append('sheet', pickedSheet);
      const res = await fetch('/api/leads/import/analyze', { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      // Even a rejected file may name its sheets, so she can switch tabs
      // instead of being told the file is unusable.
      if (data && Array.isArray(data.sheetNames)) setSheetNames(data.sheetNames);
      if (!res.ok || !data || !data.success) {
        // A failed analyse is an error, never an empty preview.
        setError((data && data.error) || 'לא הצלחנו לנתח את הקובץ');
        return;
      }
      setResult(data);
      // Adopt the sheet the SERVER resolved, not the one we asked for: on the
      // first analyse we send none and it picks the first non-empty tab. This
      // is the value that must ride along to the commit.
      setSheet(data.sheetName ?? null);
      const seeded = {};
      for (const f of FIELD_ORDER) seeded[f] = data.mapping?.[f]?.csvColumn ?? null;
      setMapping(seeded);
    } catch {
      setError('לא הצלחנו לנתח את הקובץ. בדקי את החיבור ונסי שוב.');
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const onPick = useCallback((e) => {
    const picked = e.target.files && e.target.files[0];
    if (!picked) return;
    setFileName(picked.name);
    setFile(picked);
    setSheet(null); setSheetNames([]);
    analyze(picked);
  }, [analyze]);

  const onSheetChange = useCallback((name) => {
    if (!file || name === sheet) return;
    setSheet(name);
    analyze(file, name);
  }, [file, sheet, analyze]);

  // The whole preview, recomputed whenever she changes a dropdown.
  const preview = useMemo(() => {
    if (!result || !Array.isArray(result.rows)) return null;
    return buildRows(result.headers || [], result.rows, mapping);
  }, [result, mapping]);

  const phoneMapped = !!mapping.phone;

  // THE ONLY PLACE dryRun:false IS EVER SENT.
  //
  // Reachable from exactly one button, in the 'confirming' stage, after a panel
  // that states the row count. The preview's button does not write - it only
  // moves to that panel. The endpoint also defaults to a dry run, so a request
  // that loses this field writes nothing rather than writing by accident.
  const runImport = useCallback(async () => {
    if (!file || !mapping.phone) return;
    setStage('importing'); setImportError(''); setImportResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mapping', JSON.stringify(mapping));
      // The tab she previewed. Without this the server would re-resolve the
      // default and could import a different sheet from the one she approved.
      if (sheet) form.append('sheet', sheet);
      form.append('dryRun', 'false');   // explicit, on this click only
      const res = await fetch('/api/leads/import/commit', { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      if (!data) {
        setImportError('לא קיבלנו תשובה מהשרת. ייתכן שחלק מהפניות נשמרו — רענני ובדקי לפני ניסיון נוסף.');
        setStage('done');
        return;
      }
      setImportResult(data);
      // Partial failures still land rows, so the list is reloaded either way.
      if (data.result && data.result.landed > 0 && onImported) onImported();
      if (!data.success && !data.result) setImportError(data.error || 'הייבוא נכשל');
      setStage('done');
    } catch {
      // The request may have reached the server and committed before the
      // connection dropped, so this must NOT claim nothing was written.
      setImportError('החיבור נקטע. ייתכן שחלק מהפניות כבר נשמרו — רענני ובדקי לפני ניסיון נוסף.');
      setStage('done');
    }
  }, [file, mapping, sheet, onImported]);

  if (!open) return null;

  const th = { textAlign: 'right', fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', padding: '7px 9px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--line-2)' };
  const td = { fontSize: 11.5, color: 'var(--ink)', padding: '8px 9px', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' };

  return (
    <div
      dir="rtl"
      onClick={close}
      style={{ position: 'fixed', inset: 0, background: 'rgba(43,34,51,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5100, padding: 14 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 860, maxHeight: '92vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 20, padding: '22px 22px 18px', boxShadow: '0 24px 60px rgba(74,46,90,0.28)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <div>
            <h3 className="serif" style={{ fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>ייבוא פניות מקובץ</h3>
            <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.6 }}>
              {stage === 'done'
                ? 'הייבוא הסתיים.'
                : stage === 'importing'
                  ? 'מייבאת — נא לא לסגור את החלון.'
                  : stage === 'confirming'
                    ? 'אישור אחרון לפני שמירה.'
                    : 'תצוגה מקדימה. שום דבר עדיין לא נשמר.'}
            </p>
          </div>
          <button type="button" onClick={close} aria-label="סגירה"
            style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--ink-3)', cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* ── file picker ── */}
        <div style={{ margin: '14px 0 6px' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={onPick}
            style={{ display: 'none' }}
            id="lead-csv-input"
          />
          <label htmlFor="lead-csv-input" className="primary-btn"
            style={{ display: 'inline-block', background: pcGrad, color: 'var(--surface)', padding: '10px 18px', fontSize: 12, borderRadius: 24, cursor: 'pointer', boxShadow: `0 8px 18px ${pcShadow}` }}>
            {fileName ? 'בחירת קובץ אחר' : '⇪ בחירת קובץ (Excel או CSV)'}
          </label>
          {fileName && <span style={{ fontSize: 11.5, color: 'var(--ink-2)', marginInlineStart: 10 }}>{fileName}</span>}
        </div>

        {/* ── inline help ──
            Collapsed by default: someone who already has her file should not
            have to scroll past six paragraphs to reach the picker. Open, it
            answers the questions that actually cost us time - a PDF or a print-
            out instead of the data, and phone numbers stored as numbers. */}
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer', userSelect: 'none', padding: '4px 0' }}>
            לא בטוחה איזה קובץ להעלות?
          </summary>
          <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--line-2)', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.85 }}>
            <p style={{ marginBottom: 9 }}>
              <strong style={{ color: 'var(--ink)' }}>מה צריך:</strong> קובץ עם לפחות עמודת שם ועמודת טלפון. כל שאר העמודות — אופציונליות.
            </p>
            <p style={{ marginBottom: 9 }}>
              <strong style={{ color: 'var(--ink)' }}>מאקסל:</strong> קובץ ← שמירה בשם ← <strong>חוברת עבודה של Excel‏ (.xlsx)</strong>.
              <br />
              <span style={{ color: 'var(--danger)' }}>לא</span> להשתמש בהדפסה ולא לשמור כ‑PDF — אלה גרסאות מודפסות של הרשימה, לא הנתונים עצמם, ואי אפשר לייבא מהן.
            </p>
            <p style={{ marginBottom: 9 }}>
              <strong style={{ color: 'var(--ink)' }}>מגוגל שיטס:</strong> קובץ ← הורדה ← <strong>Microsoft Excel‏ (.xlsx)</strong>.
              <br />
              שימי לב ש‑PDF נמצא ממש מתחתיו באותו תפריט — קל ללחוץ עליו בטעות.
            </p>
            <p style={{ marginBottom: 9 }}>
              <strong style={{ color: 'var(--ink)' }}>ממערכת אחרת:</strong> לחפש כפתור <strong>ייצוא</strong> / <strong>Export</strong> / <strong>הורדת לקוחות</strong>, ולבחור Excel או CSV.
            </p>
            <p style={{ marginBottom: 9 }}>
              <strong style={{ color: 'var(--ink)' }}>מספרי טלפון ששמורים כמספר?</strong> זה בסדר גמור — המערכת יודעת להתמודד עם זה, כולל אפס מוביל שנעלם באקסל.
            </p>
            <p style={{ marginBottom: 0 }}>
              <strong style={{ color: 'var(--ink)' }}>אם כלום לא עובד:</strong> לפנות לתמיכה ונעשה את זה במקומך.
            </p>
          </div>
        </details>

        {/* ── sheet picker: only when the workbook really has more than one tab ── */}
        {sheetNames.length > 1 && (
          <div style={{ margin: '10px 0 2px', display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <label htmlFor="lead-sheet-select" style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>גיליון</label>
            <select
              id="lead-sheet-select"
              value={sheet ?? ''}
              disabled={analyzing}
              onChange={(e) => onSheetChange(e.target.value)}
              style={{ fontSize: 12, padding: '7px 10px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', minWidth: 160 }}
            >
              {sheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              בקובץ יש {sheetNames.length} גיליונות. הייבוא יכלול רק את הגיליון שנבחר.
            </span>
          </div>
        )}

        {analyzing && <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 12 }}>מנתחת את הקובץ…</p>}

        {error && (
          <div style={{ marginTop: 12, padding: '11px 13px', borderRadius: 12, background: 'var(--brand-cream, #FEFAF7)', border: '1px solid var(--line-2)' }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--danger)', marginBottom: 3 }}>הקובץ לא נותח</p>
            <p style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>{error}</p>
          </div>
        )}

        {result && preview && (
          <>
            {/* ── file facts ── */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 4px' }}>
              <Stat label="שורות בקובץ" value={preview.counts.total} />
              <Stat label="ייובאו" value={preview.counts.valid} tone="ok" />
              <Stat label="ידולגו" value={preview.counts.skipped} tone={preview.counts.skipped ? 'warn' : undefined} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.7, marginBottom: 12 }}>
              {/* Encoding and delimiter are CSV concepts. A workbook has
                  neither, so showing them (empty) would be noise at best and
                  misleading at worst. */}
              {result.format === 'csv'
                ? <>קידוד: {result.encoding} · מפריד: <code>{result.delimiter === '\t' ? 'טאב' : result.delimiter}</code></>
                : <>קובץ {result.format === 'xls' ? 'Excel (פורמט ישן)' : 'Excel'}{result.sheetName ? <> · גיליון: <strong>{result.sheetName}</strong></> : null}</>}
              {' · '}המיפוי הוצע {result.mappingSource === 'ai' ? 'אוטומטית' : 'לפי שמות העמודות בלבד'}
              {result.mappingSource !== 'ai' && result.fallbackReason ? ' (הזיהוי האוטומטי לא היה זמין)' : ''}
              {result.samplesWereMasked ? ' · הדוגמאות שנשלחו לזיהוי היו מוסתרות' : ''}
            </p>

            {/* ── mapping, every field editable ── */}
            <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>התאמת עמודות</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 9, marginBottom: 6 }}>
              {FIELD_ORDER.map((field) => {
                const proposed = result.mapping?.[field];
                const conf = proposed?.confidence ?? 0;
                return (
                  <div key={field} style={{ border: '1px solid var(--line-2)', borderRadius: 12, padding: '9px 11px', background: 'var(--surface-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink)' }}>
                        {FIELD_LABELS[field]}{field === 'phone' && <span style={{ color: 'var(--danger)' }}> *</span>}
                      </span>
                      {mapping[field] && conf > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>ביטחון {Math.round(conf * 100)}%</span>
                      )}
                    </div>
                    <select
                      value={mapping[field] ?? ''}
                      onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value || null }))}
                      style={{ width: '100%', border: '1px solid var(--line-2)', borderRadius: 9, padding: '7px 9px', fontSize: 11.5, fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }}
                    >
                      <option value="">— לא מיובא —</option>
                      {(result.headers || []).map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 14, lineHeight: 1.6 }}>
              טלפון הוא שדה חובה: הוא גם מזהה הכפילות, כך שהרצה חוזרת של אותו קובץ לא תיצור כפילויות.
            </p>

            {!phoneMapped && (
              <div style={{ padding: '11px 13px', borderRadius: 12, background: 'var(--brand-cream, #FEFAF7)', border: '1px solid var(--line-2)', marginBottom: 14 }}>
                <p style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                  בלי עמודת טלפון אי אפשר לייבא: כל השורות ידולגו.
                </p>
              </div>
            )}

            {/* ── skipped, with reasons ── */}
            {preview.counts.skipped > 0 && (
              <div style={{ marginBottom: 14 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 7 }}>
                  שורות שידולגו ({preview.counts.skipped})
                </h4>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 8 }}>
                  {Object.entries(preview.counts.byReason)
                    .filter(([, n]) => n > 0)
                    .map(([reason, n]) => (
                      <span key={reason} style={{ fontSize: 11, padding: '5px 11px', borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--line-2)', color: 'var(--ink-2)' }}>
                        {SKIP_REASON_HE[reason]}: <strong>{n}</strong>
                      </span>
                    ))}
                </div>
                <div style={{ overflowX: 'auto', border: '1px solid var(--line-2)', borderRadius: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>שורה</th><th style={th}>שם</th><th style={th}>ערך הטלפון</th><th style={th}>סיבה</th></tr></thead>
                    <tbody>
                      {preview.skipped.slice(0, 5).map((s, i) => (
                        <tr key={i}>
                          <td style={td}>{s.row}</td>
                          <td style={td}>{s.name || '—'}</td>
                          {/* masked: a skipped row is still a real person */}
                          <td style={{ ...td, direction: 'ltr', textAlign: 'left', fontFamily: 'ui-monospace,Menlo,Consolas,monospace' }}>{maskValue(s.value) || '—'}</td>
                          <td style={td}>{SKIP_REASON_HE[s.reason]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.skipped.length > 5 && (
                  <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6 }}>
                    ועוד {preview.skipped.length - 5} שורות.
                  </p>
                )}
              </div>
            )}

            {/* ── first 5 rows exactly as they would be inserted ── */}
            <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 7 }}>
              5 השורות הראשונות, בדיוק כפי שייכנסו
            </h4>
            {preview.valid.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 14 }}>אין שורות תקינות לייבוא.</p>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--line-2)', borderRadius: 12, marginBottom: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>שם</th><th style={th}>טלפון (מנורמל)</th><th style={th}>אימייל</th>
                      <th style={th}>סטטוס</th><th style={th}>מקור</th><th style={th}>מזהה חיצוני</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.valid.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <td style={td}>{r.name || '—'}</td>
                        <td style={{ ...td, direction: 'ltr', textAlign: 'left', fontFamily: 'ui-monospace,Menlo,Consolas,monospace' }}>{r.phone}</td>
                        <td style={{ ...td, direction: 'ltr', textAlign: 'left' }}>{r.email || '—'}</td>
                        <td style={td}>{r.status}</td>
                        <td style={td}>{r.source}</td>
                        <td style={{ ...td, direction: 'ltr', textAlign: 'left', fontFamily: 'ui-monospace,Menlo,Consolas,monospace' }}>{r.external_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.7, marginBottom: 16 }}>
              כל השורות ייכנסו בסטטוס <strong>{IMPORT_STATUS}</strong> ובמקור <strong>{IMPORT_SOURCE}</strong>,
              כך שאפשר לבחור אותן כקבוצה אחת. הטלפון המנורמל משמש גם כמזהה החיצוני.
            </p>
          </>
        )}

        {/* ── the confirmation step: states the count before anything fires ── */}
        {stage === 'confirming' && preview && (
          <div style={{ marginTop: 4, marginBottom: 14, padding: '15px 16px', borderRadius: 14, background: 'var(--surface-2)', border: `1px solid ${pc}` }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 7 }}>
              לייבא {preview.counts.valid} פניות?
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.75, marginBottom: 5 }}>
              ייווצרו <strong>{preview.counts.valid}</strong> פניות חדשות בסטטוס <strong>{IMPORT_STATUS}</strong> ובמקור <strong>{IMPORT_SOURCE}</strong>.
              {preview.counts.skipped > 0 && <> {preview.counts.skipped} שורות ידולגו.</>}
              {/* Name the tab at the moment of approval: with several sheets,
                  "which one" is as much a part of the decision as "how many". */}
              {sheetNames.length > 1 && sheet && <> הייבוא הוא מגיליון <strong>{sheet}</strong> בלבד.</>}
            </p>
            <p style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.7 }}>
              זו הפעולה הראשונה שכותבת לבסיס הנתונים. אפשר להריץ שוב בבטחה אם משהו נכשל: הייבוא מזוהה לפי מספר הטלפון ולא יוצר כפילויות.
            </p>
          </div>
        )}

        {/* ── the result ── */}
        {stage === 'done' && (
          <div style={{ marginTop: 4, marginBottom: 14, padding: '15px 16px', borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--line-2)' }}>
            {importError ? (
              <>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>הייבוא לא הושלם</p>
                <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.7 }}>{importError}</p>
              </>
            ) : importResult?.result ? (
              <>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: importResult.success ? 'var(--success)' : 'var(--danger)', marginBottom: 6 }}>
                  {importResult.success ? 'הייבוא הושלם' : 'הייבוא הושלם חלקית'}
                </p>
                <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.75 }}>{importResult.message}</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <Stat label="נשמרו" value={importResult.result.landed} tone="ok" />
                  {importResult.result.notLanded > 0 && <Stat label="לא נשמרו" value={importResult.result.notLanded} tone="warn" />}
                  {typeof importResult.result.followUpLaterCountForTenant === 'number' && (
                    <Stat label={`סה"כ ב-${IMPORT_STATUS}`} value={importResult.result.followUpLaterCountForTenant} />
                  )}
                </div>
                {importResult.result.failedChunks > 0 && (
                  <p style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 9, lineHeight: 1.7 }}>
                    {importResult.result.failedChunks} מקטעים נכשלו. אפשר לסגור ולהריץ את אותו קובץ שוב — מה שכבר נשמר לא ישוכפל.
                  </p>
                )}
              </>
            ) : (
              <p style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{importResult?.error || 'הייבוא נכשל'}</p>
            )}
          </div>
        )}

        {/* ── actions ── */}
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
          {stage === 'done' ? (
            <button type="button" onClick={close} className="primary-btn"
              style={{ flex: 1, padding: '11px 0', borderRadius: 24, border: 'none', background: pcGrad, color: 'var(--surface)', fontSize: 12, fontWeight: 700 }}>
              סגירה
            </button>
          ) : (
            <>
              <button type="button" onClick={stage === 'confirming' ? () => setStage('preview') : close}
                disabled={stage === 'importing'} className="primary-btn"
                style={{ flex: 1, padding: '11px 0', border: '1.5px solid var(--line-2)', borderRadius: 24, background: 'var(--surface)', fontSize: 12, color: 'var(--ink-2)', opacity: stage === 'importing' ? 0.5 : 1 }}>
                {stage === 'confirming' ? 'חזרה' : 'סגירה'}
              </button>

              {stage === 'preview' ? (
                // Does NOT write. It only opens the confirmation panel above.
                <button type="button"
                  onClick={() => setStage('confirming')}
                  disabled={!preview || preview.counts.valid === 0 || !phoneMapped}
                  style={{ flex: 2, padding: '11px 0', borderRadius: 24, border: 'none', background: (!preview || preview.counts.valid === 0 || !phoneMapped) ? 'var(--line-2)' : pcGrad, color: (!preview || preview.counts.valid === 0 || !phoneMapped) ? 'var(--ink-3)' : 'var(--surface)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: (!preview || preview.counts.valid === 0 || !phoneMapped) ? 'not-allowed' : 'pointer' }}>
                  ייבוא {preview ? preview.counts.valid : 0} פניות
                </button>
              ) : (
                // THE WRITE. Only this button sends dryRun:false.
                <button type="button" onClick={runImport} disabled={stage === 'importing'}
                  style={{ flex: 2, padding: '11px 0', borderRadius: 24, border: 'none', background: pcGrad, color: 'var(--surface)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: stage === 'importing' ? 'wait' : 'pointer', opacity: stage === 'importing' ? 0.7 : 1 }}>
                  {stage === 'importing' ? 'מייבאת…' : `כן, ייבא ${preview ? preview.counts.valid : 0} פניות`}
                </button>
              )}
            </>
          )}
        </div>
        {stage === 'preview' && (
          <p style={{ fontSize: 10.5, color: 'var(--ink-3)', textAlign: 'center', marginTop: 9, lineHeight: 1.6 }}>
            עדיין לא נשמר כלום. הכפתור פותח מסך אישור לפני הייבוא.
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const color = tone === 'ok' ? 'var(--success)' : tone === 'warn' ? 'var(--danger)' : 'var(--ink)';
  return (
    <div style={{ padding: '9px 15px', borderRadius: 13, background: 'var(--surface-2)', border: '1px solid var(--line-2)', minWidth: 92 }}>
      <div style={{ fontSize: 19, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{label}</div>
    </div>
  );
}
