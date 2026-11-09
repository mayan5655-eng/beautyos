// app/VoucherArt.tsx
//
// The gift voucher as a picture, in HER design (lib/giftVoucherDesign.ts voucherLook + ornaments). Used by the voucher page
// (/v/<token>), the shop (/<slug>/gift), the designer in Settings and the marketing card. Server- and client-safe: no hooks.
// Every text is rendered as a React text node (never HTML), and the only URL in a style is her own validated upload.
import type { CSSProperties, ReactNode } from 'react';
import { ornaments, FONT_CSS, type VoucherLook } from '@/lib/giftVoucherDesign';

export type ArtContent = {
  recipientName?: string;
  title: string;          // "₪300" or the treatment's name
  sub?: string;           // "בשווי ₪280"
  message?: string;
  fromName?: string;
  code?: string;          // shown in the code box when present
  businessName?: string;
  logoUrl?: string | null;
  struck?: boolean;       // used up / void / expired: the code is struck through
  badge?: string;         // a status line, e.g. "בוטל"
};

/** A string with digits only (an amount like ₪300) is set left-to-right on its own, so the ₪ stays glued to its number. */
const Ltr = ({ children }: { children: ReactNode }) => <span dir="ltr" style={{ unicodeBidi: 'isolate' }}>{children}</span>;
const isMoney = (s: string) => /^₪[\d,.]+$/.test(s);
/** Her logo's box on a 340px-wide card; both renderers scale it with the card (lib/og/voucherImage.tsx uses the same numbers). */
export const LOGO_MAX_W = 150;
export const LOGO_MAX_H = 72;

export default function VoucherArt({ look, content, width = 340, testId }: { look: VoucherLook; content: ArtContent; width?: number; testId?: string }) {
  const h = Math.round(width * 1.25);
  const s = width / 340; // type scales with the card
  const font = FONT_CSS[look.font];
  const box: CSSProperties = {
    // A minimum, not a fixed height: a treatment voucher with a long dedication and her logo grows instead of cropping the logo and
    // the code (Vercel review 2026-11-08). The ornaments still sit on the first h pixels.
    position: 'relative', width, minHeight: h, borderRadius: 18 * s, overflow: 'hidden', background: look.bg, color: look.ink,
    boxShadow: '0 14px 30px -18px rgba(24,48,36,0.35)', direction: 'rtl', textAlign: 'center', fontFamily: "var(--font-assistant), 'Assistant', system-ui, sans-serif",
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', padding: `${26 * s}px ${24 * s}px`,
  };
  const title = content.title || '';
  return (
    <div data-testid={testId} data-template={look.template} style={box} role="img" aria-label={`שובר מתנה: ${title}${content.recipientName ? ` ל${content.recipientName}` : ''}`}>
      {look.image && <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: `url("${look.image}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />}
      {look.image && <div aria-hidden style={{ position: 'absolute', inset: 0, background: look.veil }} />}
      {ornaments(look, width, h).map((o, i) => (
        <div key={i} aria-hidden style={{ position: 'absolute', top: o.top, left: o.left, right: o.right, bottom: o.bottom, width: o.width, height: o.height, borderRadius: o.radius, background: o.background, border: o.border, opacity: o.opacity, boxSizing: 'border-box' }} />
      ))}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 * s, width: '100%' }}>
        {content.logoUrl
          // Her logo is the brand mark of the gift: 72px tall on a 340px card (a round logo at 44px was unreadable on the 2026-11-08
          // logo walk), a wordmark up to 150px wide. Never cropped: contain.
          ? <span style={{ display: 'inline-flex', marginBottom: 4 * s, ...(look.logoPlate ? { background: look.logoPlate, borderRadius: 14 * s, padding: `${6 * s}px ${10 * s}px` } : {}) }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={content.logoUrl} alt={content.businessName || ''} style={{ display: 'block', maxWidth: LOGO_MAX_W * s, maxHeight: LOGO_MAX_H * s, objectFit: 'contain' }} />
            </span>
          : content.businessName ? <p style={{ margin: 0, fontSize: 14 * s, fontWeight: 700, letterSpacing: '0.03em', color: look.sub }}>{content.businessName}</p> : null}
        <p style={{ margin: 0, fontFamily: font, fontWeight: 700, fontSize: 30 * s, lineHeight: 1.15, color: look.ink }}>{look.headline}</p>
        <span aria-hidden style={{ width: 44 * s, height: 3 * s, borderRadius: 3, background: look.accent, margin: `${2 * s}px 0` }} />
        {content.recipientName && <p style={{ margin: 0, fontSize: 18 * s, fontWeight: 700, color: look.ink }}>ל{content.recipientName}</p>}
        <p style={{ margin: 0, fontFamily: font, fontWeight: 700, fontSize: (isMoney(title) ? 46 : title.length > 16 ? 24 : 30) * s, lineHeight: 1.1, color: look.ink }}>{isMoney(title) ? <Ltr>{title}</Ltr> : title}</p>
        {content.sub && <p style={{ margin: 0, fontSize: 14 * s, color: look.sub }}>{content.sub}</p>}
        {content.message && <p style={{ margin: `${6 * s}px 0 0`, fontSize: 15 * s, lineHeight: 1.5, color: look.ink, whiteSpace: 'pre-line', maxWidth: '92%', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>״{content.message}״</p>}
        {content.fromName && <p style={{ margin: 0, fontSize: 14 * s, color: look.sub }}>באהבה, {content.fromName}</p>}
        {content.badge && <p style={{ margin: `${4 * s}px 0 0`, padding: `${4 * s}px ${12 * s}px`, borderRadius: 999, background: look.panel, color: look.panelInk, fontWeight: 700, fontSize: 13 * s }}>{content.badge}</p>}
        {content.code && (
          <div style={{ marginTop: 8 * s, padding: `${8 * s}px ${14 * s}px`, borderRadius: 12 * s, border: `1.5px dashed ${look.accent}`, background: look.panel }}>
            <p style={{ margin: 0, fontSize: 11 * s, color: look.panelInk, opacity: 0.85 }}>הקוד למימוש</p>
            <p dir="ltr" data-testid="voucher-code" style={{ margin: 0, fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 700, fontSize: 22 * s, letterSpacing: '0.12em', color: look.panelInk, textDecoration: content.struck ? 'line-through' : 'none' }}>{content.code}</p>
          </div>
        )}
      </div>
    </div>
  );
}
