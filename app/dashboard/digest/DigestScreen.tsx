'use client';

// app/dashboard/digest/DigestScreen.tsx
//
// The weekly digest as a screen: last week's four numbers against the week before, up to three actions (each one tap into
// the app through /dashboard?go=..., handled in app/beautyos.jsx), and one positive line. Computed live by
// /api/weekly-digest, the same code the Sunday notification is built from (lib/weeklyDigest.ts), so the two agree.
//
// Kalmea chrome (--brand-*, --ink-*): this is her own dashboard, not a tenant-facing page.

import { useEffect, useState } from 'react';
import type { Digest, Change } from '@/lib/weeklyDigest';
import { shortDay } from '@/lib/weeklyDigest';
import { tr, trv, uiDir } from "@/lib/i18n/tr";

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; digest: Digest | null };

const money = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;

function changeNote(c: Change, isMoney = false, lowerIsBetter = false): { text: string; tone: 'good' | 'bad' | 'flat' } {
  const prev = isMoney ? money(c.prev) : String(c.prev);
  if (c.dir === 'same') return { text: tr("כמו בשבוע שלפניו ({0})", [prev]), tone: 'flat' };
  const good = lowerIsBetter ? c.dir === 'down' : c.dir === 'up';
  const word = c.dir === 'up' ? 'עלייה' : 'ירידה';
  return { text: c.pct !== null ? tr("{0} של {1}% (לפני כן {2})", [word, c.pct, prev]) : tr("בשבוע שלפניו {0}", [prev]), tone: good ? 'good' : c.pct === null ? 'flat' : 'bad' };
}

export default function DigestScreen() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    fetch('/api/weekly-digest', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.status === 401) { window.location.href = '/login'; return; }
        if (!r.ok || !j.success) setState({ status: 'error', message: j.error || tr("לא הצלחנו לטעון את הסיכום, אפשר לנסות שוב בעוד רגע") });
        else setState({ status: 'ok', digest: j.digest || null });
      })
      .catch(() => alive && setState({ status: 'error', message: tr("אין חיבור כרגע. אפשר לנסות שוב בעוד רגע") }));
    return () => { alive = false; };
  }, []);

  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', padding: '16px 16px', boxShadow: 'var(--shadow-xs)' };

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
    <main data-testid="weekly-digest" style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 48px', direction: uiDir(), color: 'var(--ink)', fontFamily: 'var(--sans)' }}>
      <a href="/dashboard" style={{ display: 'inline-block', fontSize: 'var(--t-sm)', color: 'var(--ink-2)', fontWeight: 600, textDecoration: 'none', marginBottom: 12 }}>{tr("→ חזרה לקלמיה")}</a>
      <h1 style={{ fontFamily: 'var(--display-heavy)', fontSize: 'var(--t-2xl)', fontWeight: 700, color: 'var(--brand-deep)', margin: 0 }}>{tr("הסיכום השבועי שלך")}</h1>

      {state.status === 'loading' && <p style={{ marginTop: 16, color: 'var(--ink-2)', fontSize: 'var(--t-sm)' }}>{tr("מכינה את הסיכום…")}</p>}
      {state.status === 'error' && <p role="alert" style={{ marginTop: 16, color: 'var(--danger)', fontSize: 'var(--t-sm)', fontWeight: 600 }}>{trv(state.message)}</p>}
      {state.status === 'ok' && !state.digest && (
        <div style={{ ...card, marginTop: 16, textAlign: 'center' }}>
          <p style={{ fontSize: 'var(--t-md)', fontWeight: 700 }}>{tr("השבוע אין מה לסכם 🌸")}</p>
          <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.6 }}>{tr("בשבועיים האחרונים לא נרשמו ביקורים או תשלומים, אז אין מספרים להשוות. הסיכום מתעדכן כאן כל יום ראשון.")}</p>
        </div>
      )}

      {state.status === 'ok' && state.digest && (() => {
        const d = state.digest;
        const n = d.numbers;
        const tiles: { label: string; value: string; note: ReturnType<typeof changeNote> }[] = [
          { label: tr("הכנסות"), value: money(n.revenue.cur), note: changeNote(n.revenue, true) },
          { label: tr("ביקורים"), value: String(n.visits.cur), note: changeNote(n.visits) },
          { label: tr("לקוחות חדשות"), value: String(n.newClients.cur), note: changeNote(n.newClients) },
          { label: tr("לא הגיעו לתור"), value: String(n.noShows.cur), note: changeNote(n.noShows, false, true) },
        ];
        const toneColor = { good: 'var(--success)', bad: 'var(--ink-2)', flat: 'var(--ink-3)' } as const;
        return (
          <>
            <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', marginTop: 4 }}>
              {tr("השבוע שעבר, ראשון")} {shortDay(d.weeks.last.from)} {tr("עד שבת")} {shortDay(d.weeks.last.to)}{tr(", לעומת השבוע שלפניו")}
            </p>

            <section aria-label={tr("המספרים של השבוע")} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              {tiles.map((t) => (
                <div key={t.label} style={{ ...card, padding: '12px 12px' }}>
                  <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', fontWeight: 600 }}>{trv(t.label)}</p>
                  <p style={{ fontFamily: 'var(--display-heavy)', fontSize: 'var(--t-2xl)', fontWeight: 700, color: 'var(--ink)', marginTop: 2 }}>{t.value}</p>
                  <p style={{ fontSize: 'var(--t-xs)', color: toneColor[t.note.tone], marginTop: 2, lineHeight: 1.4 }}>{trv(t.note.text)}</p>
                </div>
              ))}
            </section>

            <section aria-label={tr("מה כדאי לעשות השבוע")} style={{ ...card, marginTop: 14 }}>
              <h2 style={{ fontFamily: 'var(--display-heavy)', fontSize: 'var(--t-lg)', fontWeight: 700, margin: 0 }}>{tr("מה כדאי לעשות השבוע")}</h2>
              {d.actions.length === 0 ? (
                <p style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', marginTop: 8 }}>{tr("הכל מסודר. אין משהו שמחכה לך השבוע 🌸")}</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {d.actions.map((a) => (
                    <li key={a.key} data-testid={`digest-action-${a.key}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--brand-tint)', borderRadius: 'var(--r-md)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 'var(--t-sm)', fontWeight: 700, color: 'var(--ink)' }}>{trv(a.title)}</p>
                        <p style={{ fontSize: 'var(--t-xs)', color: 'var(--ink-2)', marginTop: 2, lineHeight: 1.5 }}>{trv(a.detail)}</p>
                      </div>
                      <a href={a.href} style={{ flexShrink: 0, background: 'var(--brand-deep)', color: 'var(--brand-contrast)', borderRadius: 'var(--r-sm)', padding: '9px 12px', minHeight: 40, display: 'inline-flex', alignItems: 'center', fontSize: 'var(--t-xs)', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>{trv(a.cta)}</a>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {d.positive && (
              <p data-testid="digest-positive" style={{ marginTop: 16, textAlign: 'center', fontSize: 'var(--t-md)', color: 'var(--brand-deep)', fontWeight: 600 }}>{d.positive}</p>
            )}
            <p style={{ marginTop: 18, fontSize: 'var(--t-xs)', color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.6 }}>
              {tr("נשלח אלייך בכל יום ראשון אחר הצהריים, בהתראה באפליקציה. אפשר לכבות בהגדרות, תחת העסק שלי.")}
            </p>
          </>
        );
      })()}
    </main>
    </div>
  );
}
