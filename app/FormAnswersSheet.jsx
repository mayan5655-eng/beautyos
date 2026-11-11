'use client';

// app/FormAnswersSheet.jsx
//
// "צפייה בתשובות": the owner reads what her client answered on a signed form, from the client card's "טפסים" tab.
// Until 2026-11-04 she could see only "נחתם" or "ממתין": the answers to the health questions were stored and never shown.
//
// ── Where the answers come from ───────────────────────────────────────────
// Her own signed-in Supabase client (app/supabase.js), the same one the dashboard reads every table with, scoped by
// RLS to her tenant and, on top of that, filtered here by id AND tenant_id. One row, on demand, when she taps: the
// boot read of `forms` lists the forms without form_data or signature (a signature is tens of KB, and nobody needs every
// client's health answers in memory to draw a list).
//
// This is NEVER the public route. /api/forms serves the client's link with the service role and returns only
// client_name, form_type and status, on purpose: a form link is a bearer URL. Nothing here goes through it, and nothing
// in it reads from here (test-form-templates.ts holds both lines).
//
// ── How answers render ────────────────────────────────────────────────────
// lib/formTemplates.ts answerRows(): the template's questions in order, headings included, each with its answer and
// note. Old rows keyed by index ("0", "0_note") read against the same template. "כן" (and, on a question marked flag,
// anything but "אין") is highlighted so the health flags stand out. An unknown form_type shows the raw keys and values.
import { useEffect, useState, useCallback } from 'react';
import Sheet from './Sheet';
import Spinner from './Spinner';
import { supabase } from './supabase';
import { answerRows, templateFor } from '@/lib/formTemplates';
import { tr, trv } from "@/lib/i18n/tr";

const fmtSigned = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
};

export default function FormAnswersSheet({ form, tenantId, label, onClose, pcTint }) {
  const [row, setRow] = useState(null);       // the form with its answers; null while loading
  const [state, setState] = useState('loading'); // loading | ok | notfound | denied | error

  const load = useCallback(async () => {
    setState('loading');
    if (!form?.id || !tenantId) { setState('error'); return; }
    try {
      const { data, error } = await supabase
        .from('forms')
        .select('id, client_name, form_type, status, form_data, signature, signed_at')
        .eq('id', form.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) {
        console.error('[forms] answers read failed:', error.message);
        // 42501 is Postgres "permission denied": a column grant that does not let her read form_data or signature.
        // Today her select on forms has no column list (the boot read selects every column), so this should never
        // happen; if a future grant narrows it, she is told why instead of being shown "try again" forever.
        setState(error.code === '42501' ? 'denied' : 'error');
        return;
      }
      if (!data) { setState('notfound'); return; }
      setRow(data);
      setState('ok');
    } catch (err) {
      console.error('[forms] answers read threw:', err);
      setState('error');
    }
  }, [form?.id, tenantId]);

  useEffect(() => { load(); }, [load]);

  const tpl = templateFor(form?.form_type);
  const title = label || tpl?.title || form?.form_type || 'טופס';
  const rows = state === 'ok' ? answerRows(row.form_type, row.form_data) : [];
  const flagged = rows.filter((r) => r.kind === 'question' && r.flag).length;
  const unknown = state === 'ok' && !templateFor(row.form_type);
  const sig = state === 'ok' && typeof row.signature === 'string' && row.signature.startsWith('data:image/') ? row.signature : '';
  const signedAt = fmtSigned(row?.signed_at || form?.signed_at);
  const note = { fontSize: 'var(--t-sm)', color: 'var(--ink-3)', lineHeight: 1.55, margin: 0 };

  return (
    <Sheet open onClose={onClose} width={440} zIndex={1250} className="pop-in" title={trv(title)}
      subtitle={[form?.client_name, signedAt && `נחתם ${signedAt}`].filter(Boolean).join(' · ')} ariaLabel={tr("התשובות בטופס {0}", [title])}>
      <div data-testid="form-answers-sheet" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {state === 'loading' && <p style={note}><Spinner inline label={tr("טוענת את התשובות")} /></p>}

        {state === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p data-testid="form-answers-error" style={{ ...note, color: 'var(--ink)' }}>{tr("לא הצלחנו לטעון את התשובות כרגע. הן שמורות, אפשר לנסות שוב.")}</p>
            <button type="button" onClick={load} className="primary-btn" style={{ minHeight: 44, fontSize: 'var(--t-sm)' }}>{tr("ניסיון נוסף")}</button>
          </div>
        )}
        {state === 'denied' && (
          <p data-testid="form-answers-denied" style={{ ...note, color: 'var(--ink)' }}>{tr("הטופס נחתם והתשובות שמורות, אבל כדי להציג אותן כאן צריך עדכון קטן במערכת שעוד לא הותקן.")}</p>
        )}
        {state === 'notfound' && <p style={{ ...note, color: 'var(--ink)' }}>{tr("הטופס הזה לא נמצא בחשבון.")}</p>}

        {state === 'ok' && (
          <>
            {flagged > 0 && (
              <p data-testid="form-answers-flags" style={{ ...note, color: 'var(--ink)', background: 'rgba(242,184,75,0.16)', borderRadius: 'var(--r-sm)', padding: '8px 12px' }}>
                {flagged === 1 ? tr("תשובה אחת מסומנת לתשומת לבך") : tr("{0} תשובות מסומנות לתשומת לבך", [flagged])}
              </p>
            )}
            {unknown && <p style={note}>{tr("סוג הטופס לא מוכר למערכת, אז אלה התשובות כפי שנשמרו.")}</p>}
            {rows.length === 0 && <p style={note}>{tr("לא נשמרו תשובות בטופס הזה.")}</p>}

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rows.map((r, i) => {
                if (r.kind === 'section') return (
                  <p key={i} className="serif" style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', margin: i === 0 ? '0 0 6px' : '14px 0 6px', paddingBottom: 4, borderBottom: '1px solid var(--line-2)' }}>{trv(r.title)}</p>
                );
                if (r.kind === 'raw') return (
                  <div key={i} data-testid="form-answer-raw" style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 'var(--t-sm)' }}>
                    <span style={{ color: 'var(--ink-3)', minWidth: 48, direction: 'ltr', textAlign: 'right' }}>{r.key}</span>
                    <span style={{ color: 'var(--ink)', flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{r.value}</span>
                  </div>
                );
                return (
                  <div key={i} data-testid="form-answer" data-flag={r.flag ? 'true' : undefined}
                    style={r.flag
                      ? { padding: '8px 10px', margin: '4px 0', borderRadius: 'var(--r-sm)', background: 'rgba(242,184,75,0.16)', borderInlineStart: '3px solid var(--warning, #F2B84B)' }
                      : { padding: '8px 13px', borderBottom: '1px solid var(--line)' }}>
                    <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', margin: '0 0 3px', lineHeight: 1.5 }}>{r.n}. {trv(r.q)}</p>
                    <p style={{ fontSize: 'var(--t-md)', fontWeight: r.answer ? 700 : 400, color: r.answer ? 'var(--ink)' : 'var(--ink-3)', margin: 0, lineHeight: 1.5, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
                      {r.answer || (r.optional ? tr("לא ענתה (לא חובה)") : tr("לא ענתה"))}
                    </p>
                    {r.note && <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', margin: '4px 0 0', lineHeight: 1.5, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{tr("פירוט:")} {trv(r.note)}</p>}
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 6 }}>
              <p style={{ ...note, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>{tr("החתימה")}</p>
              {sig
                ? <img data-testid="form-answers-signature" src={sig} alt={tr("החתימה של {0}", [form?.client_name || 'הלקוחה'])} style={{ display: 'block', width: '100%', maxWidth: 360, height: 'auto', background: pcTint || 'var(--surface-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)' }} />
                : <p style={note}>{tr("לא נשמרה חתימה בטופס הזה.")}</p>}
            </div>
          </>
        )}

        <button type="button" onClick={onClose} style={{ minHeight: 44, borderRadius: 'var(--r-lg)', border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 'var(--t-sm)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 }}>{tr("סגירה")}</button>
      </div>
    </Sheet>
  );
}
