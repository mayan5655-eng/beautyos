// app/KalmeaLegalFooter.tsx
//
// Kalmea's own seller line (exempt dealer, business number, address) for Kalmea's pages only: the landing page, terms and privacy.
// It is deliberately NOT part of PublicFooterLinks: that row also sits on every cosmetician's booking page and mini-site, where
// Kalmea's registration would read as hers. The values come from lib/kalmeaBusiness.ts.

import type { CSSProperties } from 'react';
import { footerBusinessLine } from '@/lib/kalmeaBusiness';

export default function KalmeaLegalFooter({ style }: { style?: CSSProperties }) {
  return (
    <p data-testid="kalmea-business-line" style={{ textAlign: 'center', fontSize: 13, lineHeight: 1.6, color: '#3F4F47', direction: 'rtl', margin: 0, padding: '0 16px', ...style }}>
      {footerBusinessLine()}
    </p>
  );
}
