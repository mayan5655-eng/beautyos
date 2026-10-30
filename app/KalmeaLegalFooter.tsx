// app/KalmeaLegalFooter.tsx
//
// Kalmea's own seller line (exempt dealer, business number, address) for Kalmea's pages only: the landing page, terms and privacy.
// It is deliberately NOT part of PublicFooterLinks: that row also sits on every cosmetician's booking page and mini-site, where
// Kalmea's registration would read as hers. The values come from lib/kalmeaBusiness.ts.

import type { CSSProperties } from 'react';
import { footerBusinessLine } from '@/lib/kalmeaBusiness';
import { KALMEA_SUPPORT_WHATSAPP_DISPLAY } from '@/lib/support';

// showBusinessLine: off on the landing page (owner, 2026-10-30). The line stays on terms and privacy.
export default function KalmeaLegalFooter({ style, showBusinessLine = true }: { style?: CSSProperties; showBusinessLine?: boolean }) {
  return (
    <p data-testid="kalmea-business-line" style={{ textAlign: 'center', fontSize: 13, lineHeight: 1.6, color: '#3F4F47', direction: 'rtl', margin: 0, padding: '0 16px', ...style }}>
      {showBusinessLine && <>{footerBusinessLine()}<br /></>}
      <span data-testid="kalmea-phone">טלפון לפניות (וואטסאפ): <span dir="ltr">{KALMEA_SUPPORT_WHATSAPP_DISPLAY}</span></span>
    </p>
  );
}
