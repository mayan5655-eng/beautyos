// lib/og/voucherImage.tsx
//
// The gift voucher as an image she (or the buyer) can share: next/og (satori), the same renderer as her link preview
// (lib/og/tenantOg.tsx), and the same look as the web card (lib/giftVoucherDesign.ts voucherLook + ornaments).
//   voucher  1080x1350: one voucher, display fields only (what /v/<token> shows).
//   story    1080x1920: an Instagram story for her shop: her design, her name, the amounts, and the shop address.
//
// HEBREW: satori has no bidi. Every Hebrew line goes through visualRtl / rtlLines (lib/og/visualRtl.ts), lines are broken by us,
// never auto-wrapped, and every amount ("₪300") and the code and the address are their own left-to-right boxes, so a ₪ can never
// leave its number and a number can never drag a Hebrew line (the kalmea skill's canvas lessons).
import { ImageResponse } from 'next/og';
import { rtlLines, visualRtl } from './visualRtl';
import { ornaments, FONT_TTF, type VoucherLook } from '../giftVoucherDesign';
import { contrastOn } from '../theme';

export const VOUCHER_IMG = { width: 1080, height: 1350 } as const;
export const STORY_IMG = { width: 1080, height: 1920 } as const;

const assets = new Map<string, Promise<ArrayBuffer>>();
function asset(origin: string, path: string): Promise<ArrayBuffer> {
  if (!assets.has(path)) {
    const p = fetch(new URL(path, origin)).then((r) => { if (!r.ok) throw new Error(`asset ${path}: ${r.status}`); return r.arrayBuffer(); });
    p.catch(() => assets.delete(path));
    assets.set(path, p);
  }
  return assets.get(path)!;
}

/** Her validated upload (or logo) as a data URI the renderer can embed; null when missing, too big, or not jpeg/png. */
export async function loadImageData(u: string | null | undefined): Promise<string | null> {
  if (!u) return null;
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const type = (r.headers.get('content-type') || '').split(';')[0].trim();
    if (type !== 'image/jpeg' && type !== 'image/png') return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 3_000_000) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * Text the renderer can draw with the fonts we ship. satori fetches an emoji's picture from a public CDN at render time; that is a
 * third party in the path of her image, and where it cannot be reached the whole response fails ("failed to pipe response", found
 * on the walk 2026-11-08). Emoji and the joiners and variation selectors around them are dropped from the IMAGE only (the web page
 * keeps them).
 */
export function ogText(s: string | undefined | null): string {
  return String(s ?? '').replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u200d\uFE0E\uFE0F]/gu, '').replace(/\s+/g, ' ').trim();
}

export type ImageContent = {
  businessName: string;
  logo: string | null;          // a data URI, already loaded
  background: string | null;    // a data URI, already loaded (her photo)
  recipientName?: string;
  title: string;                // "₪300" or the treatment name
  sub?: string;
  message?: string;
  fromName?: string;
  code?: string;
  amounts?: string[];           // story: "₪200", "₪300"...
  tagline?: string;             // story
  address?: string;             // story: "kalmea.app/studio-noa/gift"
};

const LtrBox = ({ text, size, color, weight = 700, family }: { text: string; size: number; color: string; weight?: number; family: string }) => (
  <div style={{ display: 'flex', fontFamily: family, fontWeight: weight, fontSize: size, color }}>{text}</div>
);
const HebLine = ({ text, size, color, family, weight = 700 }: { text: string; size: number; color: string; family: string; weight?: number }) => (
  <div style={{ display: 'flex', justifyContent: 'center', fontFamily: family, fontWeight: weight, fontSize: size, color, lineHeight: 1.18 }}>{visualRtl(text)}</div>
);
const isMoney = (s: string) => /^₪[\d,.]+$/.test(s);

export async function renderVoucherImage(origin: string, lookIn: VoucherLook, cIn: ImageContent, kind: 'voucher' | 'story', headers: Record<string, string>) {
  const look = { ...lookIn, headline: ogText(lookIn.headline) || 'שובר מתנה' };
  const c: ImageContent = {
    ...cIn,
    businessName: ogText(cIn.businessName), recipientName: ogText(cIn.recipientName), title: ogText(cIn.title), sub: ogText(cIn.sub) || undefined,
    message: ogText(cIn.message) || undefined, fromName: ogText(cIn.fromName) || undefined, tagline: ogText(cIn.tagline) || undefined,
  };
  const size = kind === 'story' ? STORY_IMG : VOUCHER_IMG;
  const head = FONT_TTF[look.font];
  const [headFont, body, mono] = await Promise.all([asset(origin, head.path), asset(origin, '/design-fonts/Assistant-700.ttf'), asset(origin, '/design-fonts/Heebo-700.ttf')]);
  const fonts = [
    { name: head.name, data: headFont, weight: 700 as const, style: 'normal' as const },
    ...(head.name === 'Assistant' ? [] : [{ name: 'Assistant', data: body, weight: 700 as const, style: 'normal' as const }]),
    ...(head.name === 'Heebo' ? [] : [{ name: 'Heebo', data: mono, weight: 700 as const, style: 'normal' as const }]),
  ];
  const W = size.width, H = size.height;
  const card = kind === 'story' ? { w: 940, h: 1180, top: 330 } : { w: W, h: H, top: 0 };
  const k = card.w / 340;
  const titleSize = (isMoney(c.title) ? 46 : c.title.length > 16 ? 24 : 30) * k;
  // The story's title is "שובר מתנה", which is also the default headline: drawn once, not twice (logo walk, 2026-11-08).
  const sameAsHeadline = c.title.trim() === look.headline.trim();
  const titleLines = sameAsHeadline ? [] : isMoney(c.title) ? [c.title] : rtlLines(c.title, 18, 2);
  const msgLines = c.message ? rtlLines(`״${c.message.replace(/\n/g, ' ')}״`, 30, 3) : [];
  const headlineLines = rtlLines(look.headline, 18, 2);
  const orn = ornaments(look, card.w, card.h);

  const Card = (
    <div style={{ position: 'absolute', top: card.top, left: (W - card.w) / 2, width: card.w, height: card.h, display: 'flex', overflow: 'hidden', borderRadius: kind === 'story' ? 40 : 0, background: look.bg }}>
      {c.background ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.background} width={card.w} height={card.h} style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }} alt="" />
      ) : null}
      {c.background ? <div style={{ position: 'absolute', top: 0, left: 0, width: card.w, height: card.h, display: 'flex', background: look.veil }} /> : null}
      {orn.map((o, i) => (
        <div key={i} style={{ position: 'absolute', display: 'flex', ...(o.top != null ? { top: o.top } : {}), ...(o.left != null ? { left: o.left } : {}), ...(o.right != null ? { right: o.right } : {}), ...(o.bottom != null ? { bottom: o.bottom } : {}), width: o.width, height: o.height, borderRadius: o.radius || 0, ...(o.background ? { background: o.background } : {}), ...(o.border ? { border: o.border } : {}), opacity: o.opacity ?? 1 }} />
      ))}
      <div style={{ position: 'absolute', top: 0, left: 0, width: card.w, height: card.h, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `${26 * k}px ${24 * k}px` }}>
        {c.logo ? (
          // The same box as the web card (app/VoucherArt.tsx LOGO_MAX_W / LOGO_MAX_H): 72 tall, at most 150 wide, contained.
          <div style={{ display: 'flex', marginBottom: 10 * k, ...(look.logoPlate ? { background: look.logoPlate, borderRadius: 14 * k, padding: `${6 * k}px ${10 * k}px` } : {}) }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.logo} height={72 * k} style={{ maxWidth: 150 * k, objectFit: 'contain' }} alt="" />
          </div>
        ) : c.businessName ? <HebLine text={c.businessName} size={14 * k} color={look.sub} family="Assistant" /> : null}
        {headlineLines.map((l, i) => <div key={i} style={{ display: 'flex', fontFamily: head.name, fontWeight: 700, fontSize: 30 * k, color: look.ink, lineHeight: 1.15 }}>{l}</div>)}
        <div style={{ display: 'flex', width: 44 * k, height: 3 * k, borderRadius: 3, background: look.accent, margin: `${8 * k}px 0` }} />
        {c.recipientName ? <HebLine text={`ל${c.recipientName}`} size={18 * k} color={look.ink} family="Assistant" /> : null}
        {titleLines.map((l, i) => isMoney(c.title)
          ? <LtrBox key={i} text={l} size={titleSize} color={look.ink} family={head.name} />
          : <div key={i} style={{ display: 'flex', fontFamily: head.name, fontWeight: 700, fontSize: titleSize, color: look.ink, lineHeight: 1.12 }}>{l}</div>)}
        {c.sub ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 * k, marginTop: 4 * k }}>
            {/* "בשווי ₪280": the amount is its own LTR box, to the LEFT of the Hebrew word in an RTL line */}
            {c.sub.split(/(₪[\d,.]+)/).filter(Boolean).reverse().map((part, i) => isMoney(part)
              ? <LtrBox key={i} text={part} size={14 * k} color={look.sub} family="Assistant" />
              : <div key={i} style={{ display: 'flex', fontFamily: 'Assistant', fontWeight: 700, fontSize: 14 * k, color: look.sub }}>{visualRtl(part.trim())}</div>)}
          </div>
        ) : null}
        {c.amounts && c.amounts.length ? (
          <div style={{ display: 'flex', flexDirection: 'row-reverse', gap: 10 * k, marginTop: 12 * k, flexWrap: 'wrap', justifyContent: 'center' }}>
            {c.amounts.map((a, i) => (
              <div key={i} style={{ display: 'flex', padding: `${6 * k}px ${12 * k}px`, borderRadius: 999, border: `${1.5 * k}px solid ${look.accent}`, background: look.panel }}>
                <LtrBox text={a} size={18 * k} color={look.panelInk} family={head.name} />
              </div>
            ))}
          </div>
        ) : null}
        {msgLines.map((l, i) => <div key={i} style={{ display: 'flex', fontFamily: 'Assistant', fontWeight: 700, fontSize: 15 * k, color: look.ink, lineHeight: 1.45, marginTop: i === 0 ? 8 * k : 0 }}>{l}</div>)}
        {c.fromName ? <HebLine text={`באהבה, ${c.fromName}`} size={14 * k} color={look.sub} family="Assistant" /> : null}
        {c.code ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 10 * k, padding: `${8 * k}px ${14 * k}px`, borderRadius: 12 * k, border: `${1.5 * k}px dashed ${look.accent}`, background: look.panel }}>
            <HebLine text="הקוד למימוש" size={11 * k} color={look.panelInk} family="Assistant" />
            <LtrBox text={c.code.split('').join(' ')} size={20 * k} color={look.panelInk} family="Heebo" />
          </div>
        ) : null}
      </div>
    </div>
  );

  if (kind === 'voucher') return new ImageResponse(Card, { ...size, fonts, headers });

  // The story: her card in the middle, a line above, the address below, on a soft wash of the card's own colours.
  const tagline = rtlLines(c.tagline || 'המתנה המושלמת למי שאת אוהבת', 24, 2);
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', position: 'relative', background: look.bg }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex', background: look.logoPlate ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.35)' }} />
        <div style={{ position: 'absolute', top: 120, left: 0, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {tagline.map((l, i) => <div key={i} style={{ display: 'flex', fontFamily: head.name, fontWeight: 700, fontSize: 64, color: look.ink, lineHeight: 1.15 }}>{l}</div>)}
        </div>
        {Card}
        <div style={{ position: 'absolute', top: card.top + card.h + 60, left: 0, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <HebLine text="לרכישת שובר מתנה" size={44} color={look.ink} family="Assistant" />
          {c.address ? <div style={{ display: 'flex', padding: '14px 34px', borderRadius: 999, background: look.accent }}><LtrBox text={c.address} size={36} color={contrastOn(look.accent)} family="Heebo" /></div> : null}
        </div>
      </div>
    ),
    { ...size, fonts, headers },
  );
}
