'use client';

// app/LeadImportModal.jsx
//
// STAGE 2 of the CSV lead importer: pick a file, review the proposed mapping,
// correct it, and see exactly what would land.
//
// NOTHING IS WRITTEN. The confirm button is disabled by design and says so.
// The only network call is POST /api/leads/import/analyze, which itself writes
// nothing and does not touch public.leads. Stage 3 adds the insert.
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

export default function LeadImportModal({ open, onClose, pc, pcGrad, pcShadow }) {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  // field -> csv column (or null). Seeded from the proposal, then hers to edit.
  const [mapping, setMapping] = useState({});

  const reset = useCallback(() => {
    setFileName(''); setAnalyzing(false); setError(''); setResult(null); setMapping({});
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const close = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  const analyze = useCallback(async (file) => {
    setAnalyzing(true); setError(''); setResult(null); setMapping({});
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/leads/import/analyze', { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success) {
        // A failed analyse is an error, never an empty preview.
        setError((data && data.error) || 'לא הצלחנו לנתח את הקובץ');
        return;
      }
      setResult(data);
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
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    analyze(file);
  }, [analyze]);

  // The whole preview, recomputed whenever she changes a dropdown.
  const preview = useMemo(() => {
    if (!result || !Array.isArray(result.rows)) return null;
    return buildRows(result.headers || [], result.rows, mapping);
  }, [result, mapping]);

  const phoneMapped = !!mapping.phone;

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
              שלב התצוגה בלבד. שום דבר עדיין לא נשמר.
            </p>
          </div>
          <button type="button" onClick={close} aria-label="סגירה"
            style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--ink-3)', cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* ── file picker ── */}
        <div style={{ margin: '14px 0 6px' }}>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={onPick} style={{ display: 'none' }} id="lead-csv-input" />
          <label htmlFor="lead-csv-input" className="primary-btn"
            style={{ display: 'inline-block', background: pcGrad, color: 'var(--surface)', padding: '10px 18px', fontSize: 12, borderRadius: 24, cursor: 'pointer', boxShadow: `0 8px 18px ${pcShadow}` }}>
            {fileName ? 'בחירת קובץ אחר' : '⇪ בחירת קובץ CSV'}
          </label>
          {fileName && <span style={{ fontSize: 11.5, color: 'var(--ink-2)', marginInlineStart: 10 }}>{fileName}</span>}
        </div>

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
              קידוד: {result.encoding} · מפריד: <code>{result.delimiter === '\t' ? 'טאב' : result.delimiter}</code>
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

        {/* ── actions ── */}
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
          <button type="button" onClick={close} className="primary-btn"
            style={{ flex: 1, padding: '11px 0', border: '1.5px solid var(--line-2)', borderRadius: 24, background: 'var(--surface)', fontSize: 12, color: 'var(--ink-2)' }}>
            סגירה
          </button>
          {/* Disabled on purpose, and it says why rather than looking broken. */}
          <button type="button" disabled title="שלב 3 - עדיין לא פעיל"
            style={{ flex: 2, padding: '11px 0', borderRadius: 24, border: 'none', background: 'var(--line-2)', color: 'var(--ink-3)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'not-allowed' }}>
            ייבוא {preview ? preview.counts.valid : 0} פניות — עדיין לא פעיל
          </button>
        </div>
        <p style={{ fontSize: 10.5, color: 'var(--ink-3)', textAlign: 'center', marginTop: 9, lineHeight: 1.6 }}>
          שום דבר לא נשמר בשלב הזה. כפתור הייבוא ייפתח בשלב הבא, אחרי אישור.
        </p>
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
