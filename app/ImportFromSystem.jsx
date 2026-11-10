'use client';

// app/ImportFromSystem.jsx
//
// "מעבר בקלות מתוכנה אחרת": a card in Settings (and in the import hub) that takes a CSV or Excel export from any system and
// moves clients, services and future appointments into Kalmea. The work is lib/importFile.ts behind /api/import-file.
//
//   pick     choose a file. /api/import-file step=read parses it and guesses every column (Hebrew and English headers).
//   map      one row per column of her file: its header, two sample values, and the field it goes to. She fixes any guess.
//   summary  step=preview: the plan against her real data. "נמצאו 312 לקוחות, 18 כפולות ידלגו", every conflict by row.
//   confirm  one more tap that states the numbers. The ONLY place step=import with confirm=yes is sent.
//   done     what landed, what was left out and why.
//
// Hidden behind NEXT_PUBLIC_IMPORT_TOOL: off (empty) renders nothing at all, not a card, not a hint.

import { useCallback, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import Sheet from './Sheet';
import Spinner from './Spinner';
import { importToolEnabled, FILE_FIELDS } from '@/lib/importFile';

const ACCEPT = '.csv,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';

const box = { background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-md)', padding: '12px 14px' };
const small = { fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.65 };

function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || '');
}

export default function ImportFromSystem({ pc = 'var(--pc)', pcTint = 'var(--pc-tint)', pcGrad, onImported, zIndex = 1070 }) {
  const fileRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState('pick');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [read, setRead] = useState(null);
  const [mapping, setMapping] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [preset, setPreset] = useState('generic');
  const [dateOrder, setDateOrder] = useState('dmy');
  const [want, setWant] = useState({ clients: true, services: false, appts: false });
  const [summary, setSummary] = useState(null);
  const [result, setResult] = useState(null);

  const reset = useCallback(() => {
    setStage('pick'); setBusy(false); setError(''); setFile(null); setRead(null); setMapping([]); setSheet(null);
    setPreset('generic'); setDateOrder('dmy'); setWant({ clients: true, services: false, appts: false }); setSummary(null); setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const post = useCallback(async (fields) => {
    const form = new FormData();
    form.append('file', fields.file || file);
    for (const [k, v] of Object.entries(fields)) if (k !== 'file' && v !== undefined && v !== null) form.append(k, String(v));
    const res = await fetch('/api/import-file', { method: 'POST', body: form });
    const data = await res.json().catch(() => null);
    return { ok: res.ok && !!data && data.success !== false, status: res.status, data };
  }, [file]);

  const readFile = useCallback(async (picked, pickedSheet = null, pickedPreset = 'generic') => {
    setBusy(true); setError(''); setSummary(null); setResult(null);
    try {
      const r = await post({ file: picked, step: 'read', sheet: pickedSheet || '', preset: pickedPreset });
      if (!r.ok) { setError((r.data && r.data.error) || 'לא הצלחנו לקרוא את הקובץ. אפשר לנסות שוב.'); return; }
      const d = r.data;
      setRead(d);
      setSheet(d.sheetName ?? null);
      setMapping(d.mapping || []);
      setDateOrder(d.dateOrder === 'mdy' ? 'mdy' : 'dmy');
      const has = (f) => (d.mapping || []).includes(f);
      setWant({
        clients: has('name') || has('firstName') || has('lastName'),
        services: has('service') && (has('price') || has('duration')) && !has('date'),
        appts: has('date'),
      });
      setStage('map');
    } catch {
      setError('החיבור נקטע. אפשר לנסות שוב.');
    } finally {
      setBusy(false);
    }
  }, [post]);

  const onPick = useCallback((e) => {
    const picked = e.target.files && e.target.files[0];
    if (!picked) return;
    if (picked.size > 5 * 1024 * 1024) { setError('הקובץ גדול מדי. אפשר לפצל אותו לכמה קבצים קטנים יותר.'); return; }
    setFile(picked);
    readFile(picked, null, preset);
  }, [readFile, preset]);

  const has = useCallback((f) => mapping.includes(f), [mapping]);
  const hasName = has('name') || has('firstName') || has('lastName');
  const can = { clients: hasName, services: has('service'), appts: has('date') && hasName };
  const chosen = (want.clients && can.clients) || (want.services && can.services) || (want.appts && can.appts);

  const setField = (i, f) => setMapping((prev) => {
    const next = prev.slice();
    // One column per field (notes may take several): picking a field moves it off the column that had it.
    if (f !== 'ignore' && f !== 'notes') next.forEach((x, j) => { if (x === f && j !== i) next[j] = 'ignore'; });
    next[i] = f;
    return next;
  });

  const planFields = () => ({
    mapping: JSON.stringify(mapping), sheet: sheet || '', dateOrder,
    clients: want.clients && can.clients ? '1' : '', services: want.services && can.services ? '1' : '', appts: want.appts && can.appts ? '1' : '',
  });

  const runPreview = async () => {
    setBusy(true); setError('');
    try {
      const r = await post({ step: 'preview', ...planFields() });
      if (!r.ok) { setError((r.data && r.data.error) || 'לא הצלחנו להכין סיכום. אפשר לנסות שוב.'); return; }
      setSummary(r.data.summary); setStage('summary');
    } catch {
      setError('החיבור נקטע. אפשר לנסות שוב.');
    } finally { setBusy(false); }
  };

  const runImport = async () => {
    setBusy(true); setError(''); setStage('importing');
    try {
      const r = await post({ step: 'import', confirm: 'yes', ...planFields() });
      const d = r.data;
      if (!d) { setError('לא קיבלנו תשובה. ייתכן שחלק נשמר. אפשר לייבא את אותו קובץ שוב, מה שכבר נכנס לא ייכנס פעמיים.'); setStage('done'); return; }
      setResult(d);
      if (d.summary) setSummary(d.summary);
      if (d.wroteAnything && onImported) onImported();
      if (!r.ok && !d.added) setError(d.error || 'הייבוא לא הצליח. אפשר לנסות שוב.');
      setStage('done');
    } catch {
      setError('החיבור נקטע. ייתכן שחלק נשמר. אפשר לייבא את אותו קובץ שוב, מה שכבר נכנס לא ייכנס פעמיים.');
      setStage('done');
    } finally { setBusy(false); }
  };

  const samplesFor = useMemo(() => {
    const rows = (read && read.sample) || [];
    return (i) => rows.map((r) => String(r[i] ?? '').trim()).filter(Boolean).slice(0, 2);
  }, [read]);

  if (!importToolEnabled()) return null;

  const close = () => { if (busy) return; setOpen(false); reset(); };
  const primary = { width: '100%', padding: '12px 0', background: pcGrad || pc, color: 'var(--pc-contrast)', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 'var(--t-md)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-accent)' };
  const secondary = { width: '100%', padding: '11px 0', background: 'var(--surface)', color: 'var(--ink-2)', border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', fontSize: 'var(--t-sm)', cursor: 'pointer', fontFamily: 'inherit' };
  const sel = { width: '100%', boxSizing: 'border-box', fontSize: 'var(--t-sm)', padding: '8px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line-2)', background: 'var(--surface-2)', color: 'var(--ink)', fontFamily: 'inherit' };

  const s = summary;
  const skippedLines = s ? [
    s.clients && s.clients.existing ? `${s.clients.existing} לקוחות כבר קיימות אצלך (לפי טלפון, או לפי שם כשאין טלפון)` : null,
    s.clients && s.clients.dupInFile ? `${s.clients.dupInFile} לקוחות מופיעות בקובץ יותר מפעם אחת` : null,
    s.clients && s.clients.noName ? `${s.clients.noName} שורות בלי שם` : null,
    s.clients && s.clients.nameIsService ? `${s.clients.nameIsService} שורות שבהן השם הוא שם של טיפול (כנראה עמודה לא נכונה)` : null,
    s.appts && s.appts.past ? `${s.appts.past} תורים שכבר עברו (היסטוריה לא מיובאת)` : null,
    s.appts && s.appts.cancelled ? `${s.appts.cancelled} תורים שבוטלו` : null,
    s.appts && s.appts.alreadyInCalendar ? `${s.appts.alreadyInCalendar} תורים שכבר ביומן` : null,
    s.appts && s.appts.dupInFile ? `${s.appts.dupInFile} תורים שמופיעים בקובץ פעמיים` : null,
    s.appts && s.appts.noDate ? `${s.appts.noDate} תורים בלי תאריך שאפשר לקרוא` : null,
    s.appts && s.appts.noTime ? `${s.appts.noTime} תורים בלי שעה` : null,
    s.appts && s.appts.noName ? `${s.appts.noName} תורים בלי שם לקוחה` : null,
  ].filter(Boolean) : [];
  const conflicts = (s && s.appts && s.appts.conflicts) || [];
  const conflictCount = (s && s.appts && s.appts.conflictCount) || 0;
  const total = s ? (s.clients?.toCreate || 0) + (s.services?.toCreate || 0) + (s.appts?.toCreate || 0) : 0;

  return (
    <>
      <div data-testid="import-from-system" className="glass-card" style={{ ...box, marginBottom: 14, background: pcTint }}>
        <p style={{ fontSize: 'var(--t-md)', fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>
          <Icon name="upload" size={15} /> מעבר מתוכנה אחרת
        </p>
        <p style={{ ...small, marginBottom: 10 }}>
          יש לך לקוחות ותורים בתוכנה אחרת? מעלים קובץ CSV או Excel מכל מערכת, ואנחנו נעביר לכאן את הלקוחות, הטיפולים והתורים העתידיים. לפני שמשהו נשמר תראי בדיוק מה ייכנס.
        </p>
        <button type="button" onClick={() => { reset(); setOpen(true); }} style={{ ...primary, padding: '10px 0', fontSize: 'var(--t-sm)' }}>
          העלאת קובץ
        </button>
      </div>

      {open && (
        <Sheet open onClose={close} busy={busy} width={520} zIndex={zIndex} className="pop-in" title="מעבר מתוכנה אחרת" ariaLabel="ייבוא מקובץ של תוכנה אחרת">
          {error && <p role="alert" style={{ ...small, color: 'var(--danger)', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '9px 12px', marginBottom: 12 }}>{error}</p>}

          {stage === 'pick' && (
            <div>
              <p style={{ ...small, marginBottom: 12 }}>
                בתוכנה הקודמת שלך מחפשים כפתור ״ייצוא״ או ״Export״, ושומרים את רשימת הלקוחות או את היומן כקובץ Excel או CSV. אפשר להעלות כל פעם קובץ אחד.
              </p>
              <input ref={fileRef} id="import-system-file" type="file" accept={ACCEPT} onChange={onPick} style={{ display: 'none' }} />
              <label htmlFor="import-system-file" style={{ ...primary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxSizing: 'border-box', opacity: busy ? 0.6 : 1 }}>
                {busy ? <Spinner inline label="קוראת את הקובץ" /> : <><Icon name="upload" size={14} /> בחירת קובץ (Excel או CSV)</>}
              </label>
              <details style={{ marginTop: 12 }}>
                <summary style={{ ...small, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>הקובץ הגיע מתוכנה מסוימת? (לא חובה)</summary>
                <p style={{ ...small, margin: '8px 0 6px' }}>אפשר לבחור, וננחש את העמודות קצת יותר טוב. בכל מקרה תוכלי לבדוק ולתקן כל עמודה לפני הייבוא.</p>
                <select aria-label="מאיזו תוכנה הקובץ" value={preset} onChange={(e) => setPreset(e.target.value)} style={sel}>
                  <option value="generic">זיהוי אוטומטי (מומלץ)</option>
                  <option value="calmark">Calmark</option>
                  <option value="pink">Pink</option>
                  <option value="tor4you">Tor4You</option>
                  <option value="excel">Excel / Google Sheets</option>
                </select>
              </details>
              <p style={{ ...small, color: 'var(--ink-3)', marginTop: 12 }}>הייבוא לא שולח שום הודעה ללקוחות.</p>
            </div>
          )}

          {stage === 'map' && read && (
            <div>
              <p style={{ ...small, marginBottom: 10 }}>
                מצאנו בקובץ <strong>{read.rowCount}</strong> שורות. ניחשנו מה כל עמודה, ואפשר לשנות כל בחירה.
              </p>
              {Array.isArray(read.sheetNames) && read.sheetNames.length > 1 && (
                <label style={{ display: 'block', marginBottom: 12 }}>
                  <span style={{ ...small, fontWeight: 700, color: 'var(--ink)' }}>גיליון</span>
                  <select value={sheet || ''} disabled={busy} onChange={(e) => { setSheet(e.target.value); readFile(file, e.target.value, preset); }} style={{ ...sel, marginTop: 4 }}>
                    {read.sheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {(read.headers || []).map((h, i) => (
                  <div key={i} data-testid="import-map-row" style={{ ...box, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 6, minWidth: 0 }}>
                      <strong style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h || `עמודה ${i + 1}`}</strong>
                      <span dir="auto" style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{samplesFor(i).join(' · ') || 'ריקה'}</span>
                    </div>
                    <select aria-label={`מה העמודה ${h || i + 1}`} value={mapping[i] || 'ignore'} onChange={(e) => setField(i, e.target.value)} style={sel}>
                      {FILE_FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {(has('date') || has('birthday')) && (
                <label style={{ display: 'block', marginBottom: 14 }}>
                  <span style={{ ...small, fontWeight: 700, color: 'var(--ink)' }}>איך כתובים התאריכים בקובץ?</span>
                  <select value={dateOrder} onChange={(e) => setDateOrder(e.target.value)} style={{ ...sel, marginTop: 4 }}>
                    <option value="dmy">יום/חודש/שנה (31/12/2026)</option>
                    <option value="mdy">חודש/יום/שנה (12/31/2026)</option>
                  </select>
                </label>
              )}

              <p style={{ ...small, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>מה לייבא מהקובץ הזה?</p>
              {[
                ['clients', 'לקוחות', 'צריך עמודת שם'],
                ['services', 'טיפולים ומחירים', 'צריך עמודת טיפול'],
                ['appts', 'תורים עתידיים', 'צריך עמודות תאריך ושם'],
              ].map(([k, label, need]) => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, opacity: can[k] ? 1 : 0.55 }}>
                  <input type="checkbox" checked={!!(want[k] && can[k])} disabled={!can[k]} onChange={(e) => setWant((w) => ({ ...w, [k]: e.target.checked }))} />
                  <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink)' }}>{label}</span>
                  {!can[k] && <span style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-3)' }}>({need})</span>}
                </label>
              ))}
              {want.appts && can.appts && <p style={{ ...small, color: 'var(--ink-3)', marginTop: 4 }}>רק תורים שעוד לא היו. תור שמתנגש ביומן שלך לא ייכנס, ותראי אותו ברשימה.</p>}

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button type="button" onClick={reset} disabled={busy} style={{ ...secondary, flex: 1 }}>קובץ אחר</button>
                <button type="button" onClick={runPreview} disabled={busy || !chosen} style={{ ...primary, flex: 2, opacity: busy || !chosen ? 0.5 : 1 }}>
                  {busy ? <Spinner inline label="בודקת" /> : 'המשך לסיכום'}
                </button>
              </div>
            </div>
          )}

          {(stage === 'summary' || stage === 'confirm') && s && (
            <div>
              <div style={{ ...box, marginBottom: 12 }} data-testid="import-summary">
                {(s.headline || []).map((l, i) => <p key={i} style={{ fontSize: 'var(--t-md)', color: 'var(--ink)', lineHeight: 1.6, marginBottom: 4 }}>{l}</p>)}
              </div>
              {skippedLines.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ ...small, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>לא ייכנסו:</p>
                  <ul style={{ ...small, margin: 0, paddingInlineStart: 20 }}>{skippedLines.map((l) => <li key={l}>{l}</li>)}</ul>
                </div>
              )}
              {conflictCount > 0 && (
                <div data-testid="import-conflicts" style={{ ...box, borderColor: 'var(--danger)', marginBottom: 12 }}>
                  <p style={{ ...small, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
                    {conflictCount} תורים מתנגשים בתור אחר ביומן, ולכן לא ייכנסו. כדאי לקבוע אותם ידנית:
                  </p>
                  <ul style={{ ...small, margin: 0, paddingInlineStart: 20, maxHeight: 180, overflowY: 'auto' }}>
                    {conflicts.map((c) => <li key={`${c.row}-${c.date}-${c.time}`}>שורה {c.row}: {c.name}, {fmtDate(c.date)} בשעה {c.time}{c.service ? `, ${c.service}` : ''} (מתנגש עם {c.with})</li>)}
                  </ul>
                </div>
              )}
              {s.clients && s.clients.notMobile > 0 && (
                <p style={{ ...small, color: 'var(--ink-3)', marginBottom: 12 }}>ל-{s.clients.notMobile} לקוחות יש מספר שאינו נייד ישראלי. הן ייכנסו עם המספר כפי שהוא.</p>
              )}
              {stage === 'summary' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setStage('map')} style={{ ...secondary, flex: 1 }}>חזרה למיפוי</button>
                  <button type="button" onClick={() => setStage('confirm')} disabled={total === 0} style={{ ...primary, flex: 2, opacity: total === 0 ? 0.5 : 1 }}>
                    {total === 0 ? 'אין מה לייבא' : 'לייבא'}
                  </button>
                </div>
              )}
              {stage === 'confirm' && (
                <div style={{ ...box, background: 'var(--surface-2)' }}>
                  <p style={{ fontSize: 'var(--t-md)', color: 'var(--ink)', marginBottom: 10, lineHeight: 1.6 }}>
                    לייבא עכשיו {s.clients?.toCreate || 0} לקוחות, {s.services?.toCreate || 0} טיפולים ו-{s.appts?.toCreate || 0} תורים? אף הודעה לא תישלח ללקוחות.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setStage('summary')} style={{ ...secondary, flex: 1 }}>עוד לא</button>
                    <button type="button" onClick={runImport} style={{ ...primary, flex: 2 }}>כן, לייבא</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {stage === 'importing' && <div style={{ padding: '24px 0', textAlign: 'center' }}><Spinner inline label="מייבאת, רק רגע" /></div>}

          {stage === 'done' && (
            <div data-testid="import-done">
              {result && result.added && (
                <div style={{ ...box, marginBottom: 12 }}>
                  <p style={{ fontSize: 'var(--t-md)', color: 'var(--ink)', fontWeight: 700, marginBottom: 4 }}>
                    {result.wroteAnything ? 'הנתונים שלך כאן 🌸' : 'לא נוסף שום דבר חדש'}
                  </p>
                  <p style={small}>
                    נוספו {result.added.clients} לקוחות, {result.added.services} טיפולים ו-{result.added.appts} תורים.
                    {result.failed ? ` ${result.failed} שורות לא נשמרו.` : ''}
                  </p>
                  {result.apptsNoClient > 0 && (
                    <p data-testid="import-no-client" style={{ ...small, marginTop: 6 }}>
                      {result.apptsNoClient} תורים חיכו כי לא הצלחנו לפתוח כרטיס ללקוחה שלהם. אפשר להעלות את אותו קובץ שוב והם ייכנסו.
                    </p>
                  )}
                </div>
              )}
              {conflictCount > 0 && (
                <div style={{ ...box, borderColor: 'var(--danger)', marginBottom: 12 }}>
                  <p style={{ ...small, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>{conflictCount} תורים לא נכנסו בגלל התנגשות ביומן:</p>
                  <ul style={{ ...small, margin: 0, paddingInlineStart: 20, maxHeight: 180, overflowY: 'auto' }}>
                    {conflicts.map((c) => <li key={`${c.row}-${c.date}-${c.time}`}>שורה {c.row}: {c.name}, {fmtDate(c.date)} בשעה {c.time} (מתנגש עם {c.with})</li>)}
                  </ul>
                </div>
              )}
              <p style={{ ...small, color: 'var(--ink-3)', marginBottom: 12 }}>אפשר להעלות שוב את אותו קובץ בכל רגע: מה שכבר נכנס לא ייכנס פעמיים.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={reset} style={{ ...secondary, flex: 1 }}>קובץ נוסף</button>
                <button type="button" onClick={close} style={{ ...primary, flex: 1 }}>סיום</button>
              </div>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
