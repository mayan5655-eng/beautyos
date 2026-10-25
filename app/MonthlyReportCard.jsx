'use client';
// app/MonthlyReportCard.jsx
//
// The simple monthly report: a few plain sentences (lib/monthlyReport.ts decides every number and every word), on the home
// screen and, as a sheet, from the income screen. A month with no payment yet says so warmly instead of showing zeros.
//
// "שיתוף" shares a clean picture of the card in HER colours (settings.primary_color via `accent`), never Kalmea green. The
// picture is drawn straight onto a canvas (lib/design/canvasText: the browser's own Hebrew shaping, one line at a time),
// not rasterised from the DOM, and rendered ahead of the tap so the share sheet is called inside her tap
// (lib/deliverFile.js: a phone refuses navigator.share after an await).
import { useEffect, useRef, useState } from 'react';
import { drawText } from '@/lib/design/canvasText';
import { resolveFamily } from './design/canvasRender';
import { deliverFile, deliveryToast } from '@/lib/deliverFile';
import { contrastOn, readableAccentText, BRAND_INK, DEFAULT_ACCENT } from '@/lib/theme';

const SERIF = "var(--font-frank),'Frank Ruhl Libre',serif";
const SANS = "var(--font-assistant),'Assistant',sans-serif";
const W = 1080, H = 1350, PAD = 80;

const nis = (n) => `₪${Math.round(n).toLocaleString('he-IL')}`;

async function renderReportImage(report, { accent, businessName }) {
  const serif = resolveFamily(SERIF), sans = resolveFamily(SANS);
  if (document.fonts?.load) {
    await Promise.all([`700 40px ${serif}`, `900 40px ${serif}`, `400 40px ${sans}`, `600 40px ${sans}`]
      .map((f) => document.fonts.load(f, 'אבג abc 123 ₪').catch(() => null)));
    if (document.fonts.ready) await document.fonts.ready;
  }
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const color = accent || DEFAULT_ACCENT;
  const onAccent = contrastOn(color);
  const accentText = readableAccentText(color);

  ctx.fillStyle = '#FBF8F1'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = color; ctx.fillRect(0, 0, W, 270);
  const t = (text, x, y, w, h, o) => drawText(ctx, { text, x, y, w, h, family: sans, weight: 400, sizePx: 40, lineHeight: 1.4, maxLines: 1, align: 'right', valign: 'top', color: BRAND_INK, ...o });

  t(businessName || 'העסק שלי', PAD, 70, W - 2 * PAD, 90, { family: serif, weight: 700, sizePx: 64, lineHeight: 1.15, color: onAccent });
  t(`הדוח החודשי · ${report.monthName}`, PAD, 170, W - 2 * PAD, 60, { weight: 600, sizePx: 40, color: onAccent });

  t(nis(report.income), PAD, 310, W - 2 * PAD, 170, { family: serif, weight: 900, sizePx: 150, lineHeight: 1.05, color: accentText });
  t(report.netOfVat ? 'הכנסות החודש, לפני מע"מ' : 'הכנסות החודש', PAD, 470, W - 2 * PAD, 50, { sizePx: 34, color: '#5C6B63' });

  let y = 545;
  for (const s of report.sentences) {
    t(s, PAD, y, W - 2 * PAD - 34, 160, { maxLines: 3, sizePx: 38 });
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(W - PAD - 8, y + 27, 9, 0, Math.PI * 2); ctx.fill();
    y += 170;
  }
  t('נוצר ב-Kalmea', PAD, H - 90, W - 2 * PAD, 40, { sizePx: 28, color: '#5C6B63', align: 'center' });

  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export default function MonthlyReportCard({ report, accent, businessName, toast, onOpenIncome, variant = 'home', style }) {
  const [blob, setBlob] = useState(null);
  const sentences = report?.sentences || [];
  const key = sentences.join('|') + '|' + (accent || '') + '|' + (businessName || '');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // Draw the picture ahead of the tap. A failure only means "שיתוף" asks her to try again.
  useEffect(() => {
    setBlob(null);
    if (!report?.hasData) return undefined;
    let cancelled = false;
    const id = setTimeout(() => {
      renderReportImage(report, { accent, businessName }).then((b) => { if (!cancelled && b) setBlob(b); }).catch(() => {});
    }, 200);
    return () => { cancelled = true; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, report?.hasData]);

  if (!report) return null;
  const accentText = readableAccentText(accent || DEFAULT_ACCENT);
  const shell = { padding: '14px 17px', marginBottom: variant === 'home' ? 12 : 0, maxWidth: 1180, marginInline: 'auto', width: '100%', boxSizing: 'border-box', position: 'relative', overflow: 'hidden', ...style };

  if (!report.hasData) {
    return (
      <section className="glass-card card-boxed" data-testid="monthly-report" data-state="empty" aria-label="הדוח החודשי" style={shell}>
        <span data-testid="monthly-report-stripe" aria-hidden style={{ position: 'absolute', insetBlock: 0, insetInlineStart: 0, width: 5, background: accent || DEFAULT_ACCENT }} />
        <p style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 17, color: 'var(--ink)', margin: '0 0 6px' }}>הדוח החודשי שלי · {report.monthName}</p>
        <p data-testid="monthly-report-empty" style={{ fontSize: 'var(--t-sm)', color: 'var(--ink-2)', lineHeight: 1.6, margin: 0 }}>
          עוד אין נתונים לחודש הזה. ברגע שתרשמי את התשלום הראשון, כאן יחכה לך סיכום קצר של החודש.
        </p>
        {onOpenIncome && <IncomeLink onClick={onOpenIncome} />}
      </section>
    );
  }

  const share = async () => {
    if (!blob) { toast?.('התמונה עוד מתכוננת, עוד רגע ונסי שוב', 'error'); return; }
    // First thing in the tap, nothing awaited before it: the share sheet needs a live tap.
    const o = await deliverFile(blob, `kalmea-month-report-${new Date().toISOString().slice(0, 7)}.png`);
    const msg = deliveryToast(o, { what: 'התמונה', downloaded: 'התמונה ירדה' });
    if (msg) toast?.(msg.text, msg.kind);
  };

  return (
    <section className="glass-card card-boxed" data-testid="monthly-report" data-state="data" aria-label="הדוח החודשי" style={shell}>
        <span data-testid="monthly-report-stripe" aria-hidden style={{ position: 'absolute', insetBlock: 0, insetInlineStart: 0, width: 5, background: accent || DEFAULT_ACCENT }} />
      <p style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 17, color: 'var(--ink)', margin: '0 0 2px' }}>הדוח החודשי שלי · {report.monthName}</p>
      <p data-testid="monthly-report-income" style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 38, letterSpacing: '-0.02em', color: accentText, lineHeight: 1.05, margin: '4px 0 0' }}>{nis(report.income)}</p>
      <p style={{ fontSize: 12.5, color: 'var(--brand-muted)', margin: '2px 0 8px' }}>{report.netOfVat ? 'הכנסות החודש, לפני מע"מ' : 'הכנסות החודש'}</p>
      <div data-testid="monthly-report-text" style={{ display: 'grid', gap: 8 }}>
        {sentences.map((s, i) => (
          <p key={i} style={{ margin: 0, fontSize: 'var(--t-md, 15px)', lineHeight: 1.6, color: 'var(--ink)' }}>{s}</p>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        <button type="button" onClick={share} data-testid="monthly-report-share" className="secondary-btn"
          style={{ minHeight: 44, padding: '10px 18px', fontSize: 'var(--t-sm)', border: `1px solid ${accentText}`, background: 'var(--surface)', color: 'var(--ink)', borderRadius: 'var(--r-full, 999px)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          שיתוף
        </button>
        {onOpenIncome && <IncomeLink onClick={onOpenIncome} />}
      </div>
    </section>
  );
}

function IncomeLink({ onClick }) {
  return (
    <button type="button" onClick={onClick} data-testid="monthly-report-to-income"
      style={{ background: 'none', border: 'none', padding: '10px 4px', minHeight: 44, color: 'var(--pc-deep, var(--ink))', fontSize: 'var(--t-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
      לסיכום ההכנסות המלא ←
    </button>
  );
}
