'use client';

// app/dashboard/monthly/MonthlyScreen.tsx
//
// The monthly report as a screen (lib/monthlyFull.ts through /api/monthly-report): income against last month, visits, new and
// returning clients, the top three treatments, the average per visit, who has not come back (one tap to the win-back list),
// and gift vouchers and products when those are on. Any of the last 12 months from the picker; ?m=YYYY-MM opens one directly.
// Mobile first: one column at 390px, two-up tiles, nothing wider than the screen.
//
// Kalmea chrome (--brand-*, --ink-*), like /dashboard/digest: this is her own dashboard, not a tenant-facing page.

import { useEffect, useState, type CSSProperties } from 'react';
import type { MonthFull, Change } from '@/lib/monthlyFull';
import { tr, trv, uiDir } from "@/lib/i18n/tr";

type Payload = { report: MonthFull; months: { key: string; label: string; current: boolean }[]; noticeOn: boolean; needsStatus: boolean };
type State = { status: 'loading' } | { status: 'error'; message: string } | ({ status: 'ok' } & Payload);

const money = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;

function changeNote(c: Change, inPrev: string, isMoney: boolean): { text: string; tone: 'good' | 'flat' | 'down' } {
  const prev = isMoney ? money(c.prev) : String(c.prev);
  if (c.pct === null) return { text: `${inPrev}: ${prev}`, tone: 'flat' };
  if (c.dir === 'same') return { text: tr("כמו {0} ({1})", [inPrev, prev]), tone: 'flat' };
  return { text: tr("{0} של {1}% ({2}: {3})", [c.dir === 'up' ? 'עלייה' : 'ירידה', c.pct, inPrev, prev]), tone: c.dir === 'up' ? 'good' : 'down' };
}

function readMonthParam(): string {
  try { return new URLSearchParams(window.location.search).get('m') || ''; } catch { return ''; }
}

export default function MonthlyScreen() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [month, setMonth] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const m = month ?? readMonthParam();
    fetch(`/api/monthly-report${m ? `?m=${encodeURIComponent(m)}` : ''}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.status === 401) { window.location.href = '/login'; return; }
        if (!r.ok || !j.success) setState({ status: 'error', message: j.error || tr("לא הצלחנו לטעון את הדוח, אפשר לנסות שוב בעוד רגע") });
        else setState({ status: 'ok', report: j.report, months: j.months || [], noticeOn: !!j.noticeOn, needsStatus: !!j.needsStatus });
      })
      .catch(() => alive && setState({ status: 'error', message: tr("אין חיבור כרגע. אפשר לנסות שוב בעוד רגע") }));
    return () => { alive = false; };
  }, [month]);

  const pick = (key: string) => {
    setState({ status: 'loading' });
    setMonth(key);
    try { window.history.replaceState({}, '', `/dashboard/monthly?m=${key}`); } catch { /* the URL is a convenience */ }
  };

  const card: CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '14px 16px', boxShadow: 'var(--shadow-xs)' };
  const h2: CSSProperties = { fontFamily: 'var(--display-heavy)', fontSize: 'var(--t-lg)', fontWeight: 700, margin: 0, color: 'var(--ink)' };
  const toneColor = { good: 'var(--success)', down: 'var(--ink-2)', flat: 'var(--ink-3)' } as const;

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
      <main data-testid="monthly-screen" style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 48px', direction: uiDir(), color: 'var(--ink)', fontFamily: 'var(--sans)', boxSizing: 'border-box' }}>
        <a href="/dashboard" style={{ display: 'inline-block', fontSize: 'var(--t-sm)', color: 'var(--ink-2)', fontWeight: 600, textDecoration: 'none', marginBottom: 12 }}>{tr("→ חזרה לקלמיה")}</a>
        <h1 style={{ fontFamily: 'var(--display-heavy)', fontSize: 'var(--t-2xl)', fontWeight: 700, color: 'var(--brand-deep)', margin: 0 }}>{tr("הדוח החודשי שלך")}</h1>

        {state.status === 'loading' && <p style={{ marginTop: 16, color: 'var(--ink-2)', fontSize: 'var(--t-sm)' }}>{tr("מכינה את הדוח…")}</p>}
        {state.status === 'error' && <p role="alert" style={{ marginTop: 16, color: 'var(--danger)', fontSize: 'var(--t-sm)', fontWeight: 600 }}>{trv(state.message)}</p>}

        {state.status === 'ok' && (() => {
          const r = state.report;
          const inc = changeNote(r.income, r.inPrev, true);
          const vis = changeNote(r.visits, r.inPrev, false);
          const tiles = [
            { key: 'income', label: r.netOfVat ? tr("הכנסות (לפני מע\"מ)") : tr("הכנסות"), value: money(r.income.cur), note: inc },
            { key: 'visits', label: tr("ביקורים"), value: String(r.visits.cur), note: vis },
            { key: 'avg', label: tr("ממוצע לביקור"), value: r.avgPerVisit === null ? 'אין עדיין' : money(r.avgPerVisit), note: { text: tr("לטיפול ששולם"), tone: 'flat' as const } },
            { key: 'clients', label: tr("לקוחות חדשות"), value: String(r.newClients), note: { text: r.returningClients === 1 ? tr("ועוד לקוחה אחת שחזרה") : tr("ועוד {0} שחזרו", [r.returningClients]), tone: 'flat' as const } },
          ];
          const maxTop = Math.max(1, ...r.top.map((t) => t.income));
          return (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>
                <span>{tr("החודש:")}</span>
                <select aria-label={tr("בחירת חודש")} data-testid="monthly-picker" value={r.key} onChange={(e) => pick(e.target.value)}
                  style={{ flex: 1, minWidth: 0, minHeight: 44, border: '1px solid var(--line-2)', borderRadius: 'var(--r-sm)', padding: '8px 10px', fontSize: 'var(--t-sm)', fontFamily: 'inherit', background: 'var(--surface)', color: 'var(--ink)' }}>
                  {state.months.map((m) => <option key={m.key} value={m.key}>{trv(m.label)}</option>)}
                </select>
              </label>

              {state.needsStatus && (
                <p style={{ marginTop: 10, fontSize: 'var(--t-xs)', color: 'var(--warning)', lineHeight: 1.6 }}>
                  {tr("עוד לא בחרת סוג עסק (פטור, מורשה או חברה), אז ההכנסות מוצגות כמו שהן, בלי להוריד מע\"מ. אפשר לבחור בהגדרות, תחת העסק שלי.")}
                </p>
              )}

              <p data-testid="monthly-headline" style={{ marginTop: 14, fontSize: 'var(--t-md)', fontWeight: 600, color: 'var(--brand-deep)', lineHeight: 1.6 }}>{trv(r.headline)}</p>
              {r.isCurrent && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', marginTop: 2 }}>{tr("החודש עוד לא נגמר, אז ההשוואה היא לאותם ימים ב")}{r.prevName}.</p>}

              {r.hasData && (
                <>
                  <section aria-label={tr("המספרים של החודש")} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 14 }}>
                    {tiles.map((t) => (
                      <div key={t.key} data-testid={`monthly-tile-${t.key}`} style={{ ...card, padding: '12px 12px', minWidth: 0 }}>
                        <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', fontWeight: 600, margin: 0 }}>{trv(t.label)}</p>
                        <p style={{ fontFamily: 'var(--display-heavy)', fontSize: 'var(--t-2xl)', fontWeight: 700, color: 'var(--ink)', margin: '2px 0 0', overflowWrap: 'anywhere' }}>{t.value}</p>
                        <p style={{ fontSize: 'var(--t-xs)', color: toneColor[t.note.tone], margin: '2px 0 0', lineHeight: 1.4 }}>{trv(t.note.text)}</p>
                      </div>
                    ))}
                  </section>

                  <section aria-label={tr("הטיפולים שהכניסו הכי הרבה")} data-testid="monthly-top" style={{ ...card, marginTop: 14 }}>
                    <h2 style={h2}>{tr("הטיפולים שהכניסו הכי הרבה")}</h2>
                    {r.top.length === 0 ? (
                      <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', margin: '8px 0 0' }}>{tr("החודש לא נרשמו תשלומים על טיפולים.")}</p>
                    ) : (
                      <ol style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {r.top.map((t, i) => (
                          <li key={t.name}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--t-sm)' }}>
                              <span style={{ fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>{i + 1}. {t.name}</span>
                              <span style={{ fontWeight: 700, flexShrink: 0 }}>{money(t.income)}</span>
                            </div>
                            <div aria-hidden style={{ height: 8, background: 'var(--surface-2)', borderRadius: 'var(--r-xs)', marginTop: 4, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.max(4, Math.round((t.income / maxTop) * 100))}%`, height: '100%', background: i === 0 ? 'var(--brand-deep)' : 'var(--brand-accent, var(--k-petal, #E9A9A1))', borderRadius: 'var(--r-xs)' }} />
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>

                  {(r.products || r.vouchers) && (
                    <section aria-label={tr("מוצרים ושוברים")} data-testid="monthly-extras" style={{ ...card, marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {r.products && (
                        <p style={{ fontSize: 'var(--t-sm)', margin: 0, lineHeight: 1.6 }}>
                          <strong>{tr("מוצרים:")}</strong> {r.products.units > 0 ? `${r.products.units === 1 ? 'נמכר מוצר אחד' : `נמכרו ${r.products.units} מוצרים`}, ${money(r.products.income)}` : tr("לא נמכרו מוצרים החודש")}
                        </p>
                      )}
                      {r.vouchers && (
                        <p style={{ fontSize: 'var(--t-sm)', margin: 0, lineHeight: 1.6 }}>
                          <strong>{tr("שוברי מתנה:")}</strong> {r.vouchers.soldCount > 0 ? `${r.vouchers.soldCount === 1 ? 'שובר אחד נמכר' : `${r.vouchers.soldCount} נמכרו`} (${money(r.vouchers.soldAmount)})` : tr("לא נמכרו שוברים")}
                          {r.vouchers.redeemedCount !== null && `, ${r.vouchers.redeemedCount === 0 ? 'אף שובר לא מומש' : r.vouchers.redeemedCount === 1 ? `מימוש אחד (${money(r.vouchers.redeemedAmount || 0)})` : `${r.vouchers.redeemedCount} מימושים (${money(r.vouchers.redeemedAmount || 0)})`}`}
                        </p>
                      )}
                    </section>
                  )}

                  {r.noShows > 0 && (
                    <p style={{ marginTop: 12, fontSize: 'var(--t-sm)', color: 'var(--ink-2)' }}>{r.noShows === 1 ? tr("לקוחה אחת לא הגיעה לתור החודש.") : tr("{0} לקוחות לא הגיעו לתור החודש.", [r.noShows])}</p>
                  )}
                </>
              )}

              <section aria-label={tr("לקוחות שלא חזרו")} data-testid="monthly-lapsed" style={{ ...card, marginTop: 14 }}>
                <h2 style={h2}>{tr("לקוחות שלא חזרו")}</h2>
                <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', margin: '2px 0 0', lineHeight: 1.6 }}>{tr("נכון להיום: הביקור האחרון לפני יותר מ-")}{r.lapsed.minDays ?? 90} {tr("ימים ועד שנה, ואין להן תור עתידי.")}</p>
                {r.lapsed.count === 0 ? (
                  <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', margin: '8px 0 0' }}>{tr("אין כרגע לקוחות כאלה 🌸")}</p>
                ) : (
                  <>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {r.lapsed.clients.map((c) => (
                        <li key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--t-sm)', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                          <span style={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{c.name}</span>
                          <span style={{ color: 'var(--ink-2)', flexShrink: 0 }}>{tr("לפני")} {c.days} {tr("ימים")}</span>
                        </li>
                      ))}
                    </ul>
                    {r.lapsed.count > r.lapsed.clients.length && <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-3)', margin: '6px 0 0' }}>{tr("ועוד")} {r.lapsed.count - r.lapsed.clients.length}</p>}
                    <a href="/dashboard?go=winback" data-testid="monthly-winback" style={{ marginTop: 12, background: 'var(--brand-deep)', color: 'var(--brand-contrast)', borderRadius: 'var(--r-sm)', padding: '10px 14px', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--t-sm)', fontWeight: 700, textDecoration: 'none' }}>
                      {r.lapsed.count === 1 ? tr("להודעה חמה אליה") : tr("להודעה חמה אל {0} הלקוחות", [r.lapsed.count])}
                    </a>
                  </>
                )}
              </section>

              <p style={{ marginTop: 18, fontSize: 'var(--t-xs)', color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.6 }}>
                {state.noticeOn
                  ? tr("בתחילת כל חודש מחכה לך כאן הדוח של החודש שעבר, עם התראה באפליקציה. אפשר לכבות בהגדרות, תחת העסק שלי.")
                  : tr("ההתראה בתחילת החודש כבויה אצלך. אפשר להפעיל בהגדרות, תחת העסק שלי. הדוח עצמו תמיד כאן.")}
              </p>
            </>
          );
        })()}
      </main>
    </div>
  );
}
