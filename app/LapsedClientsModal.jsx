'use client';

// app/LapsedClientsModal.jsx
//
// "לקוחות שמזמן לא הגיעו" - the clients who have not been in for a while,
// longest-absent first, so she can pick who is actually worth contacting.
//
// ── Why this exists ────────────────────────────────────────────────────────
// The automated winback used to decide this on its own, and it decided badly:
// it messaged everyone 90+ days absent, forever, including people who moved
// away, people who had one bad experience, and people she would never chase.
// The system knows the dates. She knows the people. So the automation is
// suppressed for anyone she handles here, and the list is hers to triage.
//
// ── Two clicks, with the count in between ──────────────────────────────────
// Same shape as the lead importer: the button on the list opens a confirmation
// panel that states how many people are about to receive a message; only the
// button on THAT panel sends. This is a marketing message to real clients from
// her own number - it should not be one click away.
//
// ── "no data" and "couldn't load" are different screens ────────────────────
// A failed fetch renders an error with a retry, never an empty list. An empty
// list says so plainly. Reading "no lapsed clients" when the request actually
// failed is how you conclude your retention is fine when you simply cannot see.

import { useCallback, useEffect, useMemo, useState } from 'react';

const PRESETS = [
  { days: 90, label: '3 חודשים' },
  { days: 180, label: 'חצי שנה' },
  { days: 365, label: 'שנה' },
];

const DEFAULT_MESSAGE =
  'שלום! 💗\nמזמן לא ראינו אותך — נשמח לפנק אותך בטיפול ✨\nרוצה לקבוע תור? פשוט כתבי לנו 😊';

export default function LapsedClientsModal({ open, onClose, pc, pcGrad, pcShadow }) {
  const [days, setDays] = useState(90);
  const [loadError, setLoadError] = useState('');
  const [data, setData] = useState(null);
  // Bumped to force a refetch on "try again" without touching `days`.
  const [reloadToken, setReloadToken] = useState(0);
  const [selected, setSelected] = useState(() => new Set());
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  // 'list' -> 'confirming' -> 'sending' -> 'done'
  const [stage, setStage] = useState('list');
  const [sendResult, setSendResult] = useState(null);
  const [sendError, setSendError] = useState('');
  const [notConnected, setNotConnected] = useState(false);

  // Every setState here happens in a promise callback, never synchronously in
  // the effect body - and the AbortController is not decoration. Without it,
  // tapping 3 חודשים then שנה quickly lets the slower first response land last
  // and show the wrong list under the right button.
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    fetch(`/api/clients/lapsed?days=${days}`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!res.ok || !json || !json.success) {
          // An error is an error. It must not render as "nobody is lapsed".
          setLoadError((json && json.error) || 'לא הצלחנו לטעון את הרשימה');
          return;
        }
        setData(json);
      })
      .catch((e) => {
        if (e && e.name === 'AbortError') return;
        setLoadError('לא הצלחנו לטעון את הרשימה. בדקי את החיבור ונסי שוב.');
      });
    return () => controller.abort();
  }, [open, days, reloadToken]);

  // Derived, not stored: with the fetch above owning data/loadError, a separate
  // `loading` flag is a third source of truth that can disagree with them.
  const loading = open && !data && !loadError;

  const rows = useMemo(() => data?.clients ?? [], [data]);
  // Only people we can actually reach are selectable.
  const selectable = useMemo(() => rows.filter((r) => r.hasPhone), [rows]);
  const allSelected = selectable.length > 0 && selected.size === selectable.length;

  const toggle = (id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.id)));

  const close = useCallback(() => {
    setStage('list'); setSendResult(null); setSendError(''); setSelected(new Set());
    setData(null); setLoadError(''); setNotConnected(false);
    onClose();
  }, [onClose]);

  const send = useCallback(async () => {
    if (selected.size === 0 || !message.trim()) return;
    setStage('sending'); setSendError(''); setSendResult(null); setNotConnected(false);
    try {
      const res = await fetch('/api/clients/lapsed/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientIds: [...selected], message: message.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!json) {
        setSendError('לא קיבלנו תשובה מהשרת. ייתכן שחלק מההודעות נשלחו — כדאי לבדוק לפני ניסיון נוסף.');
        setStage('done');
        return;
      }
      if (!json.success) {
        setNotConnected(!!json.notConnected);
        setSendError(json.error || 'השליחה נכשלה');
        setStage('done');
        return;
      }
      setSendResult(json);
      setStage('done');
    } catch {
      // The request may have reached the server and sent before the connection
      // dropped, so this must NOT claim nothing went out.
      setSendError('החיבור נקטע. ייתכן שחלק מההודעות כבר נשלחו — כדאי לבדוק לפני ניסיון נוסף.');
      setStage('done');
    }
  }, [selected, message]);

  if (!open) return null;

  const th = { textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--ink-3)', padding: '7px 9px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--line-2)' };
  const td = { fontSize: 11.5, color: 'var(--ink)', padding: '8px 9px', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' };

  return (
    <div
      dir="rtl"
      onClick={close}
      style={{ position: 'fixed', inset: 0, background: 'rgba(43,34,51,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5100, padding: 14 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 880, maxHeight: '92vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 20, padding: '22px 22px 18px', boxShadow: '0 24px 60px rgba(74,46,90,0.28)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
          <div>
            <h3 className="serif" style={{ fontSize: 21, fontWeight: 600, color: 'var(--ink)' }}>לקוחות שמזמן לא הגיעו</h3>
            <p style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.6 }}>
              {stage === 'done' ? 'השליחה הסתיימה.'
                : stage === 'sending' ? 'שולחת — נא לא לסגור את החלון.'
                : stage === 'confirming' ? 'אישור אחרון לפני שליחה.'
                : 'הרשימה מסודרת לפי משך ההיעדרות. את בוחרת למי לפנות.'}
            </p>
          </div>
          <button type="button" onClick={close} aria-label="סגירה"
            style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--ink-3)', cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* ── threshold ── */}
        {stage === 'list' && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '14px 0 10px', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>לא הגיעו מעל</span>
            {PRESETS.map((p) => (
              <button key={p.days} type="button" onClick={() => { if (p.days === days) return; setData(null); setLoadError(''); setSelected(new Set()); setDays(p.days); }}
                style={{
                  fontSize: 11.5, padding: '6px 13px', borderRadius: 20, cursor: 'pointer',
                  border: `1px solid ${days === p.days ? pc : 'var(--line-2)'}`,
                  background: days === p.days ? pc : 'var(--surface)',
                  color: days === p.days ? 'var(--surface)' : 'var(--ink-2)',
                  fontWeight: days === p.days ? 700 : 400, fontFamily: 'inherit',
                }}>
                {p.label}
              </button>
            ))}
          </div>
        )}

        {loading && <p style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 12 }}>טוענת…</p>}

        {/* couldn't load - NOT the same as an empty list */}
        {loadError && (
          <div style={{ marginTop: 12, padding: '11px 13px', borderRadius: 12, background: 'var(--brand-cream, #FEFAF7)', border: '1px solid var(--line-2)' }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--danger)', marginBottom: 3 }}>לא הצלחנו לטעון</p>
            <p style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 9 }}>{loadError}</p>
            <button type="button" onClick={() => { setLoadError(''); setData(null); setReloadToken((t) => t + 1); }}
              style={{ fontSize: 11.5, padding: '7px 15px', borderRadius: 20, border: `1px solid ${pc}`, background: 'var(--surface)', color: pc, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
              נסי שוב
            </button>
          </div>
        )}

        {/* genuinely empty */}
        {!loading && !loadError && data && rows.length === 0 && (
          <div style={{ marginTop: 14, padding: '15px 16px', borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--line-2)' }}>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.7 }}>
              אין לקוחות שלא הגיעו מעל {days} ימים. 🎉
            </p>
          </div>
        )}

        {!loading && !loadError && data && rows.length > 0 && stage === 'list' && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 10px' }}>
              <Stat label="לא הגיעו" value={data.total} />
              <Stat label="עם טלפון" value={data.withPhone} tone={data.withPhone ? 'ok' : 'warn'} />
              <Stat label="כבר נשלחה פנייה" value={data.alreadyMessaged} />
              <Stat label="נבחרו" value={selected.size} tone={selected.size ? 'ok' : undefined} />
            </div>

            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--line-2)', borderRadius: 12, marginBottom: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)' }}>
                  <tr>
                    <th style={{ ...th, width: 34 }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="בחירת הכל" />
                    </th>
                    <th style={th}>שם</th>
                    <th style={th}>ביקור אחרון</th>
                    <th style={th}>לפני</th>
                    <th style={th}>סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} style={{ opacity: r.hasPhone ? 1 : 0.55 }}>
                      <td style={td}>
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          disabled={!r.hasPhone}
                          onChange={() => toggle(r.id)}
                          aria-label={`בחירת ${r.name}`}
                        />
                      </td>
                      <td style={td}>{r.name || '—'}</td>
                      <td style={td}>{r.lastVisit}</td>
                      <td style={td}>{formatGap(r.daysSince)}</td>
                      <td style={{ ...td, fontSize: 11, color: 'var(--ink-3)' }}>
                        {!r.hasPhone ? 'אין טלפון' : r.alreadyMessaged ? 'כבר נשלחה פנייה' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label htmlFor="lapsed-msg" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', display: 'block', marginBottom: 6 }}>
              ההודעה
            </label>
            <textarea
              id="lapsed-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              style={{ width: '100%', border: '1px solid var(--line-2)', borderRadius: 12, padding: '10px 12px', fontSize: 12.5, fontFamily: 'inherit', lineHeight: 1.7, color: 'var(--ink)', background: 'var(--surface-2)', resize: 'vertical', outline: 'none' }}
            />
            <p style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.6 }}>
              ההודעה נשלחת מהמספר שלך בלבד, בקבוצות קטנות עם הפסקה ביניהן.
              מי שתקבל הודעה כאן לא תקבל גם את הפנייה האוטומטית.
            </p>
          </>
        )}

        {/* ── confirm ── */}
        {stage === 'confirming' && (
          <div style={{ marginTop: 4, marginBottom: 14, padding: '15px 16px', borderRadius: 14, background: 'var(--surface-2)', border: `1px solid ${pc}` }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 7 }}>
              לשלוח ל־{selected.size} לקוחות?
            </p>
            <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.75 }}>
              ההודעה תישלח מהמספר שלך, בקבוצות של 20 עם הפסקה קצרה ביניהן.
              אחרי השליחה הן לא יקבלו את הפנייה האוטומטית על אותה היעדרות.
            </p>
          </div>
        )}

        {/* ── result ── */}
        {stage === 'done' && (
          <div style={{ marginTop: 4, marginBottom: 14, padding: '15px 16px', borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--line-2)' }}>
            {sendError ? (
              <>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--danger)', marginBottom: 6 }}>
                  {notConnected ? 'וואטסאפ לא מחובר' : 'השליחה לא הושלמה'}
                </p>
                <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.7 }}>{sendError}</p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>נשלח</p>
                <p style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.75 }}>
                  נשלחו <strong>{sendResult?.sent ?? 0}</strong> הודעות
                  {sendResult?.failed ? <> · נכשלו <strong>{sendResult.failed}</strong></> : null}
                  {sendResult?.skipped_no_phone ? <> · דולגו (אין טלפון) <strong>{sendResult.skipped_no_phone}</strong></> : null}
                  .
                </p>
                {sendResult?.marked !== sendResult?.sent && (
                  <p style={{ fontSize: 11.5, color: 'var(--danger)', lineHeight: 1.6, marginTop: 6 }}>
                    שימי לב: לא הצלחנו לסמן חלק מהלקוחות, וייתכן שיקבלו גם את הפנייה האוטומטית.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ── actions ── */}
        <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-start', marginTop: 4, flexWrap: 'wrap' }}>
          <button type="button" onClick={stage === 'confirming' ? () => setStage('list') : close}
            disabled={stage === 'sending'}
            style={{ fontSize: 12, padding: '9px 17px', borderRadius: 22, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink-2)', cursor: stage === 'sending' ? 'default' : 'pointer', fontFamily: 'inherit', opacity: stage === 'sending' ? 0.5 : 1 }}>
            {stage === 'confirming' ? 'חזרה' : 'סגירה'}
          </button>

          {stage === 'list' && rows.length > 0 && (
            <button
              type="button"
              disabled={selected.size === 0 || !message.trim()}
              onClick={() => setStage('confirming')}
              className="primary-btn"
              style={{ fontSize: 12, padding: '9px 20px', borderRadius: 22, border: 'none', background: selected.size ? pcGrad : 'var(--line-2)', color: 'var(--surface)', cursor: selected.size ? 'pointer' : 'default', fontFamily: 'inherit', fontWeight: 700, boxShadow: selected.size ? `0 8px 18px ${pcShadow}` : 'none' }}>
              שליחה ל־{selected.size} לקוחות
            </button>
          )}

          {stage === 'confirming' && (
            // The ONLY button that sends.
            <button type="button" onClick={send} className="primary-btn"
              style={{ fontSize: 12, padding: '9px 20px', borderRadius: 22, border: 'none', background: pcGrad, color: 'var(--surface)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, boxShadow: `0 8px 18px ${pcShadow}` }}>
              כן, שלחי ל־{selected.size} לקוחות
            </button>
          )}

          {stage === 'sending' && (
            <span style={{ fontSize: 12, color: 'var(--ink-2)', alignSelf: 'center' }}>שולחת…</span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatGap(days) {
  if (days >= 365) {
    const y = Math.floor(days / 365);
    const m = Math.floor((days % 365) / 30);
    return m ? `${y} שנים ו־${m} חודשים` : y === 1 ? 'שנה' : `${y} שנים`;
  }
  if (days >= 60) return `${Math.floor(days / 30)} חודשים`;
  return `${days} ימים`;
}

function Stat({ label, value, tone }) {
  const color = tone === 'ok' ? 'var(--ok, #2E7D5B)' : tone === 'warn' ? 'var(--danger)' : 'var(--ink)';
  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 11, padding: '7px 12px', background: 'var(--surface-2)', minWidth: 86 }}>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
